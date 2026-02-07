import { join, resolve } from "path";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, lstatSync } from "fs";
import { homedir } from "os";
import { execSync } from "child_process";
import { getConfig, saveConfig, setPluginEntry, removePluginEntry } from "../config/index.ts";
import type { Config } from "../config/index.ts";
import type { PluginManifest } from "./types.ts";

const PLUGINS_DIR = join(homedir(), ".config", "todoist-cli", "plugins");

function ensurePluginsDir(): void {
  if (!existsSync(PLUGINS_DIR)) {
    mkdirSync(PLUGINS_DIR, { recursive: true });
  }
}

export interface InstallResult {
  name: string;
  version: string;
  description?: string;
  permissions?: string[];
}

function derivePluginName(source: string): string {
  if (source.startsWith("github:")) {
    const parts = source.replace("github:", "").split("/");
    return parts[parts.length - 1] ?? source;
  }
  if (source.startsWith("npm:")) {
    return source.replace("npm:", "").replace(/^@[^/]+\//, "");
  }
  return source.split("/").pop() ?? source;
}

export async function installPlugin(source: string): Promise<InstallResult> {
  ensurePluginsDir();

  let name = derivePluginName(source);
  const targetDir = join(PLUGINS_DIR, name);

  if (existsSync(targetDir)) {
    throw new Error(`Plugin "${name}" is already installed. Use "todoist plugin remove ${name}" first.`);
  }

  if (source.startsWith("github:")) {
    const repo = source.replace("github:", "");
    execSync(`git clone https://github.com/${repo}.git "${targetDir}"`, { stdio: "pipe" });
  } else if (source.startsWith("npm:")) {
    const pkg = source.replace("npm:", "");
    mkdirSync(targetDir, { recursive: true });
    execSync(`cd "${targetDir}" && npm init -y && npm install ${pkg}`, { stdio: "pipe" });
  } else {
    // Local path — use symlink so dependencies resolve from the source project
    const resolvedPath = resolve(process.cwd(), source);
    if (!existsSync(resolvedPath)) throw new Error(`Local path not found: ${resolvedPath}`);
    symlinkSync(resolvedPath, targetDir, "dir");
  }

  // Install dependencies for non-symlinked plugins
  const isSymlink = lstatSync(targetDir).isSymbolicLink();
  if (!isSymlink && existsSync(join(targetDir, "package.json"))) {
    try {
      execSync(`cd "${targetDir}" && bun install`, { stdio: "pipe" });
    } catch {
      execSync(`cd "${targetDir}" && npm install`, { stdio: "pipe" });
    }
  }

  const manifestPath = join(targetDir, "plugin.json");
  let manifest: PluginManifest | null = null;
  if (existsSync(manifestPath)) {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as PluginManifest;
    name = manifest.name;
  }

  setPluginEntry(name, { source });

  return {
    name,
    version: manifest?.version ?? "unknown",
    description: manifest?.description,
    permissions: manifest?.permissions,
  };
}

export function removePlugin(name: string): void {
  const targetDir = join(PLUGINS_DIR, name);
  if (!existsSync(targetDir)) {
    throw new Error(`Plugin "${name}" is not installed.`);
  }

  // Handle both symlinks and real directories
  if (lstatSync(targetDir).isSymbolicLink()) {
    rmSync(targetDir);
  } else {
    rmSync(targetDir, { recursive: true, force: true });
  }

  removePluginEntry(name);
}

export function enablePlugin(name: string): void {
  const config = getConfig();
  const plugins = config.plugins;
  if (!plugins?.[name]) {
    throw new Error(`Plugin "${name}" is not installed.`);
  }
  const { enabled, ...rest } = plugins[name];
  setPluginEntry(name, rest);
}

export function disablePlugin(name: string): void {
  const config = getConfig();
  const plugins = config.plugins;
  if (!plugins?.[name]) {
    throw new Error(`Plugin "${name}" is not installed.`);
  }
  setPluginEntry(name, { ...plugins[name], enabled: false });
}

export interface UpdateResult {
  name: string;
  updated: boolean;
  message: string;
}

export function updatePlugin(name: string): UpdateResult {
  const config = getConfig();
  const plugins = config.plugins;
  if (!plugins?.[name]) {
    throw new Error(`Plugin "${name}" is not installed.`);
  }

  const targetDir = join(PLUGINS_DIR, name);
  if (!existsSync(targetDir)) {
    throw new Error(`Plugin directory not found for "${name}".`);
  }

  const source = plugins[name].source as string;
  const isSymlink = lstatSync(targetDir).isSymbolicLink();

  if (isSymlink) {
    return { name, updated: false, message: "Local symlink — already up to date" };
  }

  if (source.startsWith("github:")) {
    execSync(`cd "${targetDir}" && git pull`, { stdio: "pipe" });
    if (existsSync(join(targetDir, "package.json"))) {
      try {
        execSync(`cd "${targetDir}" && bun install`, { stdio: "pipe" });
      } catch {
        execSync(`cd "${targetDir}" && npm install`, { stdio: "pipe" });
      }
    }
    return { name, updated: true, message: "Pulled latest from git" };
  }

  if (source.startsWith("npm:")) {
    const pkg = source.replace("npm:", "");
    execSync(`cd "${targetDir}" && npm update ${pkg}`, { stdio: "pipe" });
    return { name, updated: true, message: "Updated npm package" };
  }

  return { name, updated: false, message: "Local plugin — update manually" };
}

export function listPlugins(): Array<{ name: string; source: string; enabled: boolean }> {
  const config = getConfig();
  const plugins = config.plugins;
  if (!plugins) return [];

  return Object.entries(plugins).map(([name, cfg]) => ({
    name,
    source: cfg.source as string,
    enabled: cfg.enabled !== false,
  }));
}
