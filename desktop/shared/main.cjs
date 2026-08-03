/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, Menu, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = app.isPackaged ? path.join(process.resourcesPath, "app.asar.unpacked") : path.resolve(__dirname, "../..");
const children = [];
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function start(command, args, extraEnv = {}) {
  const logFile = path.join(app.getPath("userData"), "craftpilot-desktop.log");
  const child = spawn(command, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, env: { ...process.env, CRAFTPILOT_DATA_DIR: path.join(app.getPath("userData"), "minecraft-data"), ...extraEnv } });
  const log = (chunk) => fs.appendFile(logFile, `[${new Date().toISOString()}] ${String(chunk)}`, () => {});
  child.stdout.on("data", log);
  child.stderr.on("data", log);
  child.on("error", (error) => log(`[launcher] ${error.message}\n`));
  children.push(child);
}

async function createWindow() {
  if (app.isPackaged) {
    const nodeMode = { ELECTRON_RUN_AS_NODE: "1" };
    const packagedEnv = { ...nodeMode, CRAFTPILOT_DESKTOP: "1" };
    start(process.execPath, ["local/agent.mjs"], packagedEnv);
    start(process.execPath, ["node_modules/vinext/dist/cli.js", "dev"], packagedEnv);
  } else {
    start(process.env.CRAFTPILOT_NODE || "node", ["local/agent.mjs"]);
    start(npm, ["run", "dev"]);
  }
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1060,
    minHeight: 720,
    backgroundColor: "#17131f",
    title: "CraftPilot",
    icon: path.join(root, "public/craftpilot-logo.png"),
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    titleBarOverlay: process.platform === "win32" ? { color: "#17131f", symbolColor: "#f7f2ff", height: 44 } : undefined,
    vibrancy: process.platform === "darwin" ? "under-window" : undefined,
    visualEffectState: "active",
    trafficLightPosition: process.platform === "darwin" ? { x: 18, y: 18 } : undefined,
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: "CraftPilot", submenu: [{ label: "Ricarica", role: "reload" }, { label: "Apri documentazione", click: () => shell.openExternal("https://docs.papermc.io/") }, { type: "separator" }, { role: "quit" }] }]));
  const dashboardUrl = "http://localhost:3000/";
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(dashboardUrl);
      if (response.ok) {
        await win.loadURL(dashboardUrl);
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await win.loadURL(dashboardUrl);
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { for (const child of children) child.kill(); if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", () => { for (const child of children) child.kill(); });
