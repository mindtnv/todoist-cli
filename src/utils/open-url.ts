import { spawn } from "node:child_process";

export function openUrl(url: string): void {
  const platform = process.platform;
  if (platform === "darwin") spawn("open", [url], { stdio: "ignore", detached: true }).unref();
  else if (platform === "linux") spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
  else if (platform === "win32") spawn("cmd", ["/c", "start", url], { stdio: "ignore", detached: true }).unref();
  else throw new Error(`Unsupported platform: ${platform}`);
}
