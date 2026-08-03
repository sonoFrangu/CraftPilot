import http from "node:http";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createWriteStream, existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(process.env.CRAFTPILOT_DATA_DIR || path.resolve(process.cwd(), "minecraft-data"));
const SERVER_DIR = path.join(ROOT, "server");
const CONFIG_FILE = path.join(ROOT, "craftpilot.json");
const INSTANCES_DIR = path.join(ROOT, "instances");
const DELETED_DIR = path.join(ROOT, "deleted-servers");
const PORT = Number(process.env.CRAFTPILOT_AGENT_PORT || 4010);
const MAX_LOGS = 600;
const logs = [];
let minecraft = null;
let startedAt = null;
let installProgress = null;
let knownPlayers = new Map();
let tunnelProcess = null;
let tunnelState = { provider: null, status: "stopped", address: "", message: "" };
let playitInstall = { active: false, percent: 0, label: "" };

await Promise.all([fs.mkdir(SERVER_DIR, { recursive: true }), fs.mkdir(INSTANCES_DIR, { recursive: true }), fs.mkdir(DELETED_DIR, { recursive: true })]);

function addLog(line, stream = "info") {
  const clean = String(line).replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "").trimEnd();
  if (!clean) return;
  logs.push({ id: Date.now() + Math.random(), time: new Date().toISOString(), stream, line: clean });
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
  const joined = clean.match(/:\s+([A-Za-z0-9_]{3,16}) joined the game/);
  const left = clean.match(/:\s+([A-Za-z0-9_]{3,16}) left the game/);
  if (joined) knownPlayers.set(joined[1], { name: joined[1], online: true, lastSeen: new Date().toISOString() });
  if (left) knownPlayers.set(left[1], { name: left[1], online: false, lastSeen: new Date().toISOString() });
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n");
}

async function getConfig() {
  return readJson(CONFIG_FILE, null);
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
}

function send(res, status, body) {
  cors(res);
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers: { "User-Agent": "CraftPilot/0.1 (local Minecraft manager)", ...headers } });
  if (!response.ok) throw new Error(`Download service returned ${response.status}`);
  return response.json();
}

async function download(url, destination, onProgress) {
  const response = await fetch(url, { headers: { "User-Agent": "CraftPilot/0.1 (local Minecraft manager)" } });
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status})`);
  const total = Number(response.headers.get("content-length")) || 0;
  let received = 0;
  const stream = new TransformStream({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (onProgress) onProgress(total ? Math.round((received / total) * 100) : 35);
      else if (installProgress?.active) installProgress.percent = total ? Math.round((received / total) * 82) + 8 : 35;
      controller.enqueue(chunk);
    }
  });
  await pipeline(Readable.fromWeb(response.body.pipeThrough(stream)), createWriteStream(destination));
}

async function vanillaDownload(version) {
  const manifest = await fetchJson("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json");
  const item = manifest.versions.find((entry) => entry.id === version);
  if (!item) throw new Error("Versione Minecraft non trovata");
  const details = await fetchJson(item.url);
  if (!details.downloads?.server?.url) throw new Error("Questa versione non include un server Java scaricabile");
  return details.downloads.server.url;
}

async function paperDownload(version) {
  const builds = await fetchJson(`https://fill.papermc.io/v3/projects/paper/versions/${encodeURIComponent(version)}/builds`);
  if (builds?.ok === false) throw new Error(builds.message || "Versione Paper non disponibile");
  const stable = builds.find((build) => build.channel === "STABLE" && build.downloads?.["server:default"]?.url);
  if (!stable) throw new Error("Nessuna build Paper stabile disponibile per questa versione");
  return stable.downloads["server:default"].url;
}

function propertiesText(config) {
  const safeMotd = String(config.motd || "Un server gestito con CraftPilot").replace(/[\r\n=]/g, " ");
  return [
    "# Managed by CraftPilot",
    `server-port=${Number(config.port) || 25565}`,
    "server-ip=",
    `motd=${safeMotd}`,
    `gamemode=${config.gamemode || "survival"}`,
    `difficulty=${config.difficulty || "normal"}`,
    `max-players=${Number(config.maxPlayers) || 20}`,
    `online-mode=${config.onlineMode !== false}`,
    `white-list=${Boolean(config.whitelist)}`,
    `enforce-whitelist=${Boolean(config.whitelist)}`,
    `pvp=${config.pvp !== false}`,
    `view-distance=${Number(config.viewDistance) || 10}`,
    `simulation-distance=${Number(config.simulationDistance) || 8}`,
    "enable-query=false",
    "enable-rcon=false",
    "spawn-protection=16",
    "allow-flight=false",
    "generate-structures=true",
    "level-name=world",
  ].join("\n") + "\n";
}

function serverId(name = "server") {
  const slug = String(name).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "server";
  return `${slug}-${Date.now().toString(36)}`;
}

async function normalizedConfig(config) {
  if (!config) return null;
  if (config.instanceId && config.githubOwner) return config;
  const next = { ...config, instanceId: config.instanceId || serverId(config.name), githubOwner: config.githubOwner || "sonoFrangu" };
  await writeJson(CONFIG_FILE, next);
  return next;
}

async function listServers() {
  const result = [];
  const current = await normalizedConfig(await getConfig());
  if (current?.installed) result.push({ id: current.instanceId, name: current.name, version: current.version, software: current.software, active: true, updatedAt: current.installedAt || "" });
  const entries = await fs.readdir(INSTANCES_DIR, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[a-z0-9-]+$/i.test(entry.name)) continue;
    const config = await readJson(path.join(INSTANCES_DIR, entry.name, "craftpilot.json"), null);
    if (config?.installed) result.push({ id: entry.name, name: config.name, version: config.version, software: config.software, active: false, updatedAt: config.installedAt || "" });
  }
  return result;
}

async function archiveActiveServer() {
  if (minecraft) throw new Error("Arresta il server prima di cambiare istanza");
  const config = await normalizedConfig(await getConfig());
  if (!config?.installed) return null;
  const target = path.join(INSTANCES_DIR, config.instanceId);
  if (existsSync(target)) throw new Error("Esiste già un’istanza con questo identificatore");
  await fs.mkdir(target, { recursive: true });
  await fs.rename(SERVER_DIR, path.join(target, "server"));
  await fs.rename(CONFIG_FILE, path.join(target, "craftpilot.json"));
  await fs.mkdir(SERVER_DIR, { recursive: true });
  knownPlayers = new Map();
  return config.instanceId;
}

async function createServerSlot() {
  const archived = await archiveActiveServer();
  addLog(archived ? "[CraftPilot] Server corrente archiviato. Nuova configurazione pronta." : "[CraftPilot] Nuova configurazione pronta.");
  return { archived };
}

async function switchServerInstance(id) {
  if (!/^[a-z0-9-]+$/i.test(id || "")) throw new Error("Istanza non valida");
  const source = path.join(INSTANCES_DIR, id);
  if (!existsSync(path.join(source, "craftpilot.json")) || !existsSync(path.join(source, "server"))) throw new Error("Server salvato non trovato");
  await archiveActiveServer();
  await fs.rename(path.join(source, "server"), SERVER_DIR);
  await fs.rename(path.join(source, "craftpilot.json"), CONFIG_FILE);
  await fs.rmdir(source).catch(() => {});
  knownPlayers = new Map();
  addLog(`[CraftPilot] Istanza attiva: ${(await getConfig())?.name || id}`);
}

async function deleteActiveServer(data) {
  if (minecraft) throw new Error("Arresta il server prima di eliminarlo");
  const config = await normalizedConfig(await getConfig());
  if (!config?.installed) throw new Error("Nessun server attivo da eliminare");
  if (data.code !== "ELIMINA" || data.confirmation !== config.name) throw new Error("La doppia conferma non corrisponde al nome del server");
  stopTunnel();
  const target = path.join(DELETED_DIR, `${config.instanceId}-${Date.now().toString(36)}`);
  await fs.mkdir(target, { recursive: true });
  await fs.rename(SERVER_DIR, path.join(target, "server"));
  await fs.rename(CONFIG_FILE, path.join(target, "craftpilot.json"));
  await fs.mkdir(SERVER_DIR, { recursive: true });
  knownPlayers = new Map();
  addLog(`[CraftPilot] Server ${config.name} spostato nell’archivio eliminati.`);
  return { recoverablePath: target };
}

function resolveServerPath(relative = "") {
  const clean = String(relative).replaceAll("\\", "/").replace(/^\/+/, "");
  const target = path.resolve(SERVER_DIR, clean || ".");
  if (target !== SERVER_DIR && !target.startsWith(`${SERVER_DIR}${path.sep}`)) throw new Error("Percorso non consentito");
  return target;
}

async function listServerFiles(relative = "") {
  const target = resolveServerPath(relative);
  const stat = await fs.stat(target).catch(() => null);
  if (!stat?.isDirectory()) throw new Error("Cartella non trovata");
  const entries = await fs.readdir(target, { withFileTypes: true });
  const items = await Promise.all(entries.slice(0, 300).map(async (entry) => {
    const absolute = path.join(target, entry.name);
    const details = await fs.stat(absolute);
    const itemPath = path.relative(SERVER_DIR, absolute).split(path.sep).join("/");
    return { name: entry.name, path: itemPath, type: entry.isDirectory() ? "directory" : "file", size: entry.isFile() ? details.size : 0, modifiedAt: details.mtime.toISOString() };
  }));
  items.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "directory" ? -1 : 1));
  return { path: path.relative(SERVER_DIR, target).split(path.sep).join("/"), items };
}

async function openServerFolder(relative = "") {
  const target = resolveServerPath(relative);
  const stat = await fs.stat(target).catch(() => null);
  if (!stat) throw new Error("File o cartella non trovati");
  const openTarget = stat.isDirectory() ? target : path.dirname(target);
  const commandName = os.platform() === "darwin" ? "open" : os.platform() === "win32" ? "explorer.exe" : "xdg-open";
  const child = spawn(commandName, [openTarget], { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
  return openTarget;
}

async function install(config) {
  if (!config.acceptEula) throw new Error("Devi accettare la EULA di Minecraft per installare il server");
  if (minecraft) throw new Error("Arresta il server prima di reinstallare");
  installProgress = { active: true, percent: 3, label: "Preparazione cartella server" };
  try {
    await fs.mkdir(SERVER_DIR, { recursive: true });
    installProgress = { active: true, percent: 7, label: `Ricerca Minecraft ${config.version}` };
    const url = config.software === "vanilla" ? await vanillaDownload(config.version) : await paperDownload(config.version);
    installProgress.label = "Download del server";
    await download(url, path.join(SERVER_DIR, "server.jar"));
    installProgress = { active: true, percent: 92, label: "Configurazione del mondo" };
    const normalized = {
      installed: true,
      name: config.name || "Il mio server",
      version: config.version,
      software: config.software || "paper",
      memory: Math.max(1, Math.min(32, Number(config.memory) || 4)),
      port: Math.max(1, Math.min(65535, Number(config.port) || 25565)),
      maxPlayers: Math.max(1, Math.min(200, Number(config.maxPlayers) || 20)),
      motd: config.motd || "Un server gestito con CraftPilot",
      description: config.description || "Un mondo aperto a nuove avventure.",
      serverIcon: Boolean(config.serverIcon),
      gamemode: config.gamemode || "survival",
      difficulty: config.difficulty || "normal",
      onlineMode: config.onlineMode !== false,
      whitelist: Boolean(config.whitelist),
      pvp: config.pvp !== false,
      viewDistance: Number(config.viewDistance) || 10,
      simulationDistance: Number(config.simulationDistance) || 8,
      customHost: config.customHost || "",
      githubOwner: config.githubOwner || "sonoFrangu",
      instanceId: config.instanceId || serverId(config.name),
      installedAt: new Date().toISOString(),
    };
    await fs.writeFile(path.join(SERVER_DIR, "eula.txt"), "# Accepted from CraftPilot setup\neula=true\n");
    await fs.writeFile(path.join(SERVER_DIR, "server.properties"), propertiesText(normalized));
    await writeJson(CONFIG_FILE, normalized);
    installProgress = { active: false, percent: 100, label: "Server pronto" };
    addLog(`[CraftPilot] Minecraft ${normalized.version} (${normalized.software}) installato.`);
  } catch (error) {
    installProgress = { active: false, percent: 0, label: error.message, error: true };
    throw error;
  }
}

async function startServer() {
  const config = await getConfig();
  if (!config?.installed || !existsSync(path.join(SERVER_DIR, "server.jar"))) throw new Error("Installa prima un server");
  if (minecraft) throw new Error("Il server è già acceso");
  await fs.writeFile(path.join(SERVER_DIR, "server.properties"), propertiesText(config));
  const args = [`-Xms${Math.min(2, config.memory)}G`, `-Xmx${config.memory}G`, "-jar", "server.jar", "--nogui"];
  minecraft = spawn("java", args, { cwd: SERVER_DIR, stdio: ["pipe", "pipe", "pipe"] });
  startedAt = Date.now();
  addLog(`[CraftPilot] Avvio: java ${args.join(" ")}`);
  minecraft.stdout.on("data", (chunk) => String(chunk).split(/\r?\n/).forEach((line) => addLog(line, "stdout")));
  minecraft.stderr.on("data", (chunk) => String(chunk).split(/\r?\n/).forEach((line) => addLog(line, "stderr")));
  minecraft.on("error", (error) => addLog(`[CraftPilot] ${error.message}`, "stderr"));
  minecraft.on("exit", (code) => {
    addLog(`[CraftPilot] Server arrestato (codice ${code ?? "?"}).`);
    minecraft = null;
    startedAt = null;
    for (const [name, player] of knownPlayers) knownPlayers.set(name, { ...player, online: false });
  });
}

function command(value) {
  if (!minecraft?.stdin?.writable) throw new Error("Il server è spento");
  const clean = String(value || "").replace(/[\r\n]/g, "").trim();
  if (!clean) throw new Error("Comando vuoto");
  minecraft.stdin.write(clean + "\n");
  addLog(`> ${clean}`, "command");
}

async function stopServer() {
  if (!minecraft) return;
  command("stop");
}

async function javaInfo() {
  try {
    const { stderr, stdout } = await execFileAsync("java", ["-version"], { timeout: 4000 });
    return { available: true, version: (stderr || stdout).split("\n")[0].replaceAll('"', "") };
  } catch { return { available: false, version: "Java non trovato" }; }
}

async function processMetrics() {
  if (!minecraft?.pid || os.platform() === "win32") return { cpu: 0, memoryMb: 0 };
  try {
    const { stdout } = await execFileAsync("ps", ["-o", "%cpu=,rss=", "-p", String(minecraft.pid)]);
    const [cpu, rss] = stdout.trim().split(/\s+/).map(Number);
    return { cpu: Math.round(cpu * 10) / 10, memoryMb: Math.round((rss || 0) / 1024) };
  } catch { return { cpu: 0, memoryMb: 0 }; }
}

function localAddresses() {
  const result = [];
  for (const values of Object.values(os.networkInterfaces())) {
    for (const item of values || []) if (item.family === "IPv4" && !item.internal) result.push(item.address);
  }
  return result;
}

async function playerData() {
  const ops = await readJson(path.join(SERVER_DIR, "ops.json"), []);
  const whitelist = await readJson(path.join(SERVER_DIR, "whitelist.json"), []);
  const map = new Map(knownPlayers);
  for (const item of [...ops, ...whitelist]) if (item?.name && !map.has(item.name)) map.set(item.name, { name: item.name, online: false });
  return [...map.values()].map((player) => ({
    ...player,
    operator: ops.some((item) => item.name?.toLowerCase() === player.name.toLowerCase()),
    whitelisted: whitelist.some((item) => item.name?.toLowerCase() === player.name.toLowerCase()),
    role: ops.some((item) => item.name?.toLowerCase() === player.name.toLowerCase()) ? "Amministratore" : "Giocatore",
  })).sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
}

async function queryPlayerData(name, field) {
  const startIndex = logs.length;
  command(`data get entity ${name} ${field}`);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const response = logs.slice(startIndex).find((entry) => entry.stream === "stdout" && /following entity data|entity data/i.test(entry.line));
    if (response) return response.line;
  }
  throw new Error(`Minecraft non ha risposto alla richiesta ${field}`);
}

async function inspectPlayer(name) {
  if (!minecraft) throw new Error("Avvia il server prima di ispezionare un giocatore");
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name || "")) throw new Error("Nome giocatore non valido");
  const player = (await playerData()).find((entry) => entry.name.toLowerCase() === name.toLowerCase());
  if (!player?.online) throw new Error("Il giocatore deve essere online per leggere inventario e statistiche");
  const healthLine = await queryPlayerData(name, "Health");
  const hungerLine = await queryPlayerData(name, "foodLevel");
  const xpLine = await queryPlayerData(name, "XpLevel");
  const inventoryLine = await queryPlayerData(name, "Inventory");
  const numberFrom = (line) => Number(line.match(/data:\s*(-?\d+(?:\.\d+)?)/i)?.[1] || 0);
  const inventory = [];
  for (const block of inventoryLine.matchAll(/\{([^{}]+)\}/g)) {
    const slot = block[1].match(/Slot:\s*(-?\d+)b/i);
    const id = block[1].match(/id:\s*"minecraft:([^"]+)"/i);
    const count = block[1].match(/(?:count|Count):\s*(\d+)b?/i);
    if (slot && id) inventory.push({ slot: Number(slot[1]), id: id[1], count: Number(count?.[1] || 1) });
  }
  return { name, health: numberFrom(healthLine), maxHealth: 20, hunger: numberFrom(hungerLine), maxHunger: 20, xpLevel: numberFrom(xpLine), inventory };
}

async function updateSettings(patch) {
  const current = await getConfig();
  if (!current) throw new Error("Server non configurato");
  const next = { ...current, ...patch, memory: Number(patch.memory ?? current.memory), port: Number(patch.port ?? current.port), maxPlayers: Number(patch.maxPlayers ?? current.maxPlayers), viewDistance: Number(patch.viewDistance ?? current.viewDistance), simulationDistance: Number(patch.simulationDistance ?? current.simulationDistance), githubOwner: String(patch.githubOwner ?? current.githubOwner ?? "sonoFrangu").replace(/[^A-Za-z0-9-]/g, "").slice(0, 39) || "sonoFrangu" };
  await writeJson(CONFIG_FILE, next);
  await fs.writeFile(path.join(SERVER_DIR, "server.properties"), propertiesText(next));
  return next;
}

async function updateServerAssets(data) {
  const current = await getConfig();
  if (!current) throw new Error("Server non configurato");
  const next = { ...current };
  if (typeof data.description === "string") next.description = data.description.slice(0, 2000);
  if (data.iconDataUrl) {
    const match = String(data.iconDataUrl).match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
    if (!match) throw new Error("Formato icona non supportato");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(match[2]) || match[2].length % 4 === 1) throw new Error("Dati icona non validi");
    const buffer = Buffer.from(match[2], "base64");
    if (buffer.length > 1.5 * 1024 * 1024) throw new Error("L’icona deve essere più piccola di 1,5 MB");
    const validImage = match[1].toLowerCase() === "png" ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : match[1].toLowerCase() === "webp" ? buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP" : buffer.subarray(0, 2).equals(Buffer.from([255, 216]));
    if (!validImage) throw new Error("Il file non contiene un’immagine valida");
    await fs.writeFile(path.join(SERVER_DIR, "server-icon.png"), buffer);
    next.serverIcon = true;
  }
  await writeJson(CONFIG_FILE, next);
  return next;
}

async function serveServerIcon(res) {
  const icon = path.join(SERVER_DIR, "server-icon.png");
  if (!existsSync(icon)) { res.statusCode = 404; return res.end(); }
  cors(res);
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "no-store");
  res.end(await fs.readFile(icon));
}

async function backup() {
  const config = await getConfig();
  if (!config) throw new Error("Server non configurato");
  const name = `backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const target = path.join(ROOT, "backups", name);
  if (minecraft) command("save-all flush");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(SERVER_DIR, target, { recursive: true, filter: (source) => !source.endsWith("server.jar") });
  addLog(`[CraftPilot] Backup creato: ${name}`);
  return name;
}

async function listBackups() {
  const dir = path.join(ROOT, "backups");
  try {
    const names = await fs.readdir(dir);
    const entries = await Promise.all(names.map(async (name) => ({ name, createdAt: (await fs.stat(path.join(dir, name))).birthtime.toISOString() })));
    return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch { return []; }
}

async function installedPlugins() {
  const dir = path.join(SERVER_DIR, "plugins");
  await fs.mkdir(dir, { recursive: true });
  const names = await fs.readdir(dir);
  const jars = await Promise.all(names.filter((name) => name.toLowerCase().endsWith(".jar")).map(async (name) => {
    const info = await fs.stat(path.join(dir, name));
    return { file: name, name: name.replace(/\.jar$/i, ""), sizeMb: Math.round(info.size / 1024 / 1024 * 10) / 10, modifiedAt: info.mtime.toISOString(), enabled: true };
  }));
  return jars.sort((a, b) => a.name.localeCompare(b.name));
}

async function searchPlugins(query) {
  const term = String(query || "").trim();
  const endpoint = `https://hangar.papermc.io/api/v1/projects?limit=12&offset=0${term ? `&query=${encodeURIComponent(term)}` : ""}`;
  const data = await fetchJson(endpoint);
  return (data.result || []).map((project) => ({
    id: project.id,
    owner: project.namespace?.owner,
    slug: project.namespace?.slug || project.name,
    name: project.name,
    description: project.description || "Plugin Paper",
    downloads: project.stats?.downloads || 0,
    stars: project.stats?.stars || 0,
    url: `https://hangar.papermc.io/${project.namespace?.owner}/${project.namespace?.slug || project.name}`,
  }));
}

async function installPlugin(data) {
  if (!data.owner || !data.slug) throw new Error("Plugin non valido");
  const versions = await fetchJson(`https://hangar.papermc.io/api/v1/projects/${encodeURIComponent(data.owner)}/${encodeURIComponent(data.slug)}/versions?limit=12&offset=0`);
  const choices = versions.result || [];
  if (!choices.length) throw new Error("Nessuna versione pubblica disponibile");
  const selected = data.version ? choices.find((version) => version.name === data.version) : choices[0];
  if (!selected) throw new Error("Versione plugin non disponibile");
  const detail = await fetchJson(`https://hangar.papermc.io/api/v1/projects/${encodeURIComponent(data.owner)}/${encodeURIComponent(data.slug)}/versions/${encodeURIComponent(selected.name)}`);
  const downloadUrl = detail.downloads?.PAPER?.downloadUrl;
  if (!downloadUrl) throw new Error("Questo plugin non pubblica un JAR Paper scaricabile automaticamente");
  const pluginsDir = path.join(SERVER_DIR, "plugins");
  await fs.mkdir(pluginsDir, { recursive: true });
  const filename = detail.downloads.PAPER.fileInfo?.name || `${data.slug}-${selected.name}.jar`;
  await download(downloadUrl, path.join(pluginsDir, filename));
  addLog(`[CraftPilot] Plugin installato: ${data.slug} ${selected.name}`);
  return { file: filename, version: selected.name };
}

async function disablePlugin(file) {
  if (!/^[A-Za-z0-9._-]+\.jar$/i.test(file || "")) throw new Error("Nome plugin non valido");
  const source = path.join(SERVER_DIR, "plugins", file);
  if (!existsSync(source)) throw new Error("Plugin non trovato");
  await fs.rename(source, `${source}.disabled`);
  addLog(`[CraftPilot] Plugin disabilitato: ${file}`);
}

async function commandExists(commandName) {
  try { await execFileAsync(os.platform() === "win32" ? "where" : "which", [commandName], { timeout: 3000 }); return true; } catch { return false; }
}

function playitExecutable() {
  return path.join(ROOT, "tools", "playit", os.platform() === "win32" ? "playit.exe" : "playit");
}

async function playitInfo() {
  const executable = playitExecutable();
  const metadata = await readJson(path.join(ROOT, "tools", "playit", "metadata.json"), null);
  return { installed: existsSync(executable) || await commandExists("playit"), managed: existsSync(executable), executable: existsSync(executable) ? executable : "playit", version: metadata?.version || "", install: playitInstall };
}

function playitAssetForRelease(release) {
  const assets = release.assets || [];
  if (os.platform() === "darwin") {
    const suffix = os.arch() === "arm64" ? "playit-darwin-arm" : "playit-darwin-intel";
    return assets.find((asset) => asset.name === suffix);
  }
  if (os.platform() === "win32") {
    const suffix = os.arch() === "ia32" ? "playit-windows-x86-signed.exe" : "playit-windows-x86_64-signed.exe";
    return assets.find((asset) => asset.name === suffix);
  }
  if (os.platform() === "linux") {
    const suffix = os.arch() === "arm64" ? "playit-cli-linux-aarch64" : "playit-cli-linux-amd64";
    return assets.find((asset) => asset.name === suffix);
  }
  return null;
}

async function installPlayit() {
  if (playitInstall.active) throw new Error("Download Playit già in corso");
  playitInstall = { active: true, percent: 3, label: "Ricerca della versione ufficiale" };
  try {
    const releases = await fetchJson("https://api.github.com/repos/playit-cloud/playit-agent/releases?per_page=100", { Accept: "application/vnd.github+json" });
    let selected = null;
    let asset = null;
    for (const release of releases) {
      if (release.draft || release.prerelease) continue;
      const candidate = playitAssetForRelease(release);
      if (candidate) { selected = release; asset = candidate; break; }
    }
    if (!selected || !asset) throw new Error("Playit non pubblica un binario compatibile per questo sistema");
    const executable = playitExecutable();
    await fs.mkdir(path.dirname(executable), { recursive: true });
    playitInstall = { active: true, percent: 8, label: `Download Playit ${selected.tag_name}` };
    await download(asset.browser_download_url, executable, (percent) => { playitInstall = { active: true, percent: Math.max(8, percent), label: `Download Playit ${selected.tag_name}` }; });
    if (os.platform() !== "win32") await fs.chmod(executable, 0o755);
    await writeJson(path.join(ROOT, "tools", "playit", "metadata.json"), { version: selected.tag_name, source: asset.browser_download_url, installedAt: new Date().toISOString() });
    playitInstall = { active: false, percent: 100, label: "Playit pronto" };
    addLog(`[CraftPilot] Playit ${selected.tag_name} installato dall’origine ufficiale.`);
    return playitInfo();
  } catch (error) {
    playitInstall = { active: false, percent: 0, label: error.message, error: true };
    throw error;
  }
}

function tunnelOutput(chunk) {
  const line = String(chunk).trim();
  if (!line) return;
  addLog(`[Tunnel] ${line}`);
  const claim = line.match(/https?:\/\/(?:www\.)?playit\.gg\/claim\/[A-Za-z0-9_-]+/i);
  if (claim) tunnelState = { ...tunnelState, status: "starting", claimUrl: claim[0], message: "Completa una volta il collegamento Playit, poi l’indirizzo apparirà qui." };
  const match = line.match(/\b([a-z0-9][a-z0-9.-]+\.(?:playit\.gg|gl\.at\.ply\.gg|ts\.net)(?::\d+)?)\b/i);
  if (match) tunnelState = { ...tunnelState, status: "running", address: match[1] };
}

async function startTunnel(data) {
  if (tunnelProcess) throw new Error("Un tunnel è già attivo");
  const provider = data.provider || "playit";
  const localPort = Number(data.port) || (await getConfig())?.port || 25565;
  const managedPlayit = provider === "playit" && existsSync(playitExecutable());
  if (!managedPlayit && !await commandExists(provider === "tailscale" ? "tailscale" : provider === "cloudflare" ? "cloudflared" : "playit")) {
    throw new Error(`Installa prima ${provider === "playit" ? "playit.gg" : provider === "tailscale" ? "Tailscale" : "cloudflared"} e riprova`);
  }
  const commandName = provider === "tailscale" ? "tailscale" : provider === "cloudflare" ? "cloudflared" : managedPlayit ? playitExecutable() : "playit";
  const args = provider === "tailscale" ? ["funnel", "--bg", `--tcp=${Number(data.externalPort) || 25565}`, `tcp://127.0.0.1:${localPort}`] : provider === "cloudflare" ? ["tunnel", "--url", `tcp://127.0.0.1:${localPort}`] : [];
  tunnelState = { provider, status: "starting", address: "", message: provider === "playit" ? "Attendo l’indirizzo assegnato da playit.gg…" : "Tunnel in avvio…", claimUrl: "" };
  tunnelProcess = spawn(commandName, args, { stdio: ["ignore", "pipe", "pipe"] });
  tunnelProcess.stdout.on("data", tunnelOutput);
  tunnelProcess.stderr.on("data", tunnelOutput);
  tunnelProcess.on("error", (error) => { tunnelState = { ...tunnelState, status: "error", message: error.message }; tunnelProcess = null; });
  tunnelProcess.on("exit", (code) => { if (tunnelState.status !== "stopped") tunnelState = { ...tunnelState, status: code ? "error" : "stopped", message: code ? `Processo terminato (${code})` : "" }; tunnelProcess = null; });
}

function stopTunnel() {
  if (tunnelProcess) tunnelProcess.kill("SIGTERM");
  tunnelProcess = null;
  tunnelState = { provider: null, status: "stopped", address: "", message: "" };
}

async function handle(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.end();
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === "GET" && url.pathname === "/api/versions") {
      const manifest = await fetchJson("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json");
      const releases = manifest.versions.filter((item) => item.type === "release").slice(0, 35).map((item) => ({ id: item.id, releaseTime: item.releaseTime }));
      return send(res, 200, { latest: manifest.latest.release, versions: releases });
    }
    if (req.method === "GET" && url.pathname === "/api/status") {
      const config = await getConfig();
      const metrics = await processMetrics();
      const players = await playerData();
      return send(res, 200, { connected: true, installed: Boolean(config?.installed), running: Boolean(minecraft), pid: minecraft?.pid || null, uptime: startedAt ? Date.now() - startedAt : 0, config, metrics, players, online: players.filter((p) => p.online).length, installProgress, java: await javaInfo(), localAddresses: localAddresses(), logs: logs.slice(-180), backups: await listBackups(), plugins: await installedPlugins(), tunnel: { ...tunnelState, process: Boolean(tunnelProcess) }, playit: await playitInfo() });
    }
    if (req.method === "GET" && url.pathname === "/api/servers") return send(res, 200, { servers: await listServers() });
    if (req.method === "GET" && url.pathname === "/api/files") return send(res, 200, await listServerFiles(url.searchParams.get("path") || ""));
    if (req.method === "GET" && url.pathname === "/api/server-icon") return serveServerIcon(res);
    if (req.method === "GET" && url.pathname === "/api/public-ip") {
      const result = await fetchJson("https://api.ipify.org?format=json");
      return send(res, 200, result);
    }
    if (req.method === "GET" && url.pathname === "/api/plugins/search") return send(res, 200, { plugins: await searchPlugins(url.searchParams.get("q") || "") });
    if (req.method === "POST" && url.pathname === "/api/plugins/install") return send(res, 200, { ok: true, plugin: await installPlugin(await body(req)) });
    if (req.method === "POST" && url.pathname === "/api/plugins/disable") { await disablePlugin((await body(req)).file); return send(res, 200, { ok: true }); }
    if (req.method === "POST" && url.pathname === "/api/tunnel/start") { await startTunnel(await body(req)); return send(res, 200, { ok: true }); }
    if (req.method === "POST" && url.pathname === "/api/tunnel/stop") { stopTunnel(); return send(res, 200, { ok: true }); }
    if (req.method === "POST" && url.pathname === "/api/tools/playit/install") { return send(res, 200, { ok: true, playit: await installPlayit() }); }
    if (req.method === "POST" && url.pathname === "/api/servers/new") return send(res, 200, { ok: true, ...(await createServerSlot()) });
    if (req.method === "POST" && url.pathname === "/api/servers/switch") { await switchServerInstance((await body(req)).id); return send(res, 200, { ok: true }); }
    if (req.method === "POST" && url.pathname === "/api/server/delete") return send(res, 200, { ok: true, ...(await deleteActiveServer(await body(req))) });
    if (req.method === "POST" && url.pathname === "/api/files/open") return send(res, 200, { ok: true, path: await openServerFolder((await body(req)).path || "") });
    if (req.method === "POST" && url.pathname === "/api/install") { await install(await body(req)); return send(res, 200, { ok: true }); }
    if (req.method === "POST" && url.pathname === "/api/start") { await startServer(); return send(res, 200, { ok: true }); }
    if (req.method === "POST" && url.pathname === "/api/stop") { await stopServer(); return send(res, 200, { ok: true }); }
    if (req.method === "POST" && url.pathname === "/api/restart") { await stopServer(); setTimeout(() => startServer().catch((e) => addLog(e.message, "stderr")), 5000); return send(res, 200, { ok: true }); }
    if (req.method === "POST" && url.pathname === "/api/command") { const data = await body(req); command(data.command); return send(res, 200, { ok: true }); }
    if (req.method === "POST" && url.pathname === "/api/settings") { return send(res, 200, { ok: true, config: await updateSettings(await body(req)) }); }
    if (req.method === "POST" && url.pathname === "/api/server-assets") { return send(res, 200, { ok: true, config: await updateServerAssets(await body(req)) }); }
    if (req.method === "POST" && url.pathname === "/api/player") {
      const data = await body(req);
      const allowed = new Set(["op", "deop", "kick", "ban", "pardon", "whitelist add", "whitelist remove"]);
      if (!allowed.has(data.action)) throw new Error("Azione non consentita");
      if (!/^[A-Za-z0-9_]{3,16}$/.test(data.name || "")) throw new Error("Nome giocatore non valido");
      command(`${data.action} ${data.name}`);
      return send(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/player-inspect") { const data = await body(req); return send(res, 200, { ok: true, player: await inspectPlayer(data.name) }); }
    if (req.method === "POST" && url.pathname === "/api/backup") return send(res, 200, { ok: true, name: await backup() });
    return send(res, 404, { error: "Endpoint non trovato" });
  } catch (error) {
    addLog(`[CraftPilot] ${error.message}`, "stderr");
    return send(res, 400, { error: error.message || "Errore inatteso" });
  }
}

const server = http.createServer(handle);
server.listen(PORT, "127.0.0.1", () => {
  console.log(`CraftPilot agent: http://127.0.0.1:${PORT}`);
});

async function shutdown() {
  if (minecraft) {
    try { command("stop"); } catch {}
    setTimeout(() => minecraft?.kill("SIGTERM"), 8000).unref();
  }
  stopTunnel();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
