import { spawn } from "node:child_process";
import { platform } from "node:os";

const children = [];
function run(command, args) {
  const child = spawn(command, args, { stdio: "inherit", shell: platform() === "win32" });
  children.push(child);
  child.on("exit", (code) => { if (code && code !== 0) process.exitCode = code; });
  return child;
}

run(process.execPath, ["local/agent.mjs"]);
setTimeout(() => run(platform() === "win32" ? "npm.cmd" : "npm", ["run", "dev"]), 350);

function stop() {
  for (const child of children) child.kill("SIGINT");
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
