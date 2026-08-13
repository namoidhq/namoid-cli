import { spawn } from "node:child_process";

export function openBrowser(url, { platform = process.platform, spawnImpl = spawn } = {}) {
  const commands = {
    darwin: ["open", [url]],
    win32: ["cmd", ["/c", "start", "", url]],
    linux: ["xdg-open", [url]],
  };
  const command = commands[platform];
  if (!command) throw new Error(`Opening a browser is unsupported on ${platform}`);
  const child = spawnImpl(command[0], command[1], { detached: true, stdio: "ignore" });
  child.unref();
}
