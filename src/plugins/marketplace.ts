import { join } from "path";
import { homedir } from "os";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  cpSync,
} from "fs";
import { execFileSync } from "child_process";
import { getConfig, saveConfig, setPluginEntry, removePluginEntry } from "../config/index.ts";
import type {
  MarketplaceManifest,
  MarketplacePluginEntry,
  MarketplaceExternalSource,
  MarketplaceConfig,
  DiscoveredPlugin,
  InstallResult,
  UpdateResult,
} from "./marketplace-types.ts";

// ── Constants ──

const CONFIG_DIR = join(homedir(), ".config", "todoist-cli");
const MARKETPLACE_CACHE_DIR = join(CONFIG_DIR, "marketplace-cache");
const PLUGINS_DIR = join(CONFIG_DIR, "plugins");
const DEFAULT_MARKETPLACE = "github:mindtnv/todoist-cli";
const DEFAULT_MARKETPLACE_NAME = "todoist-cli-official";

// ── Helpers ──

function isValidPluginName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name);
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function parseGitHubSource(source: string): { user: string; repo: string } | null {
  if (!source.startsWith("github:")) return null;
  const parts = source.replace("github:", "").split("/");
  if (parts.length < 2 || !parts[0] || !parts[1]) return null;
  return { user: parts[0], repo: parts[1] };
}

function deriveNameFromSource(source: string): string {
  if (source.startsWith("github:")) {
    const parts = source.replace("github:", "").split("/");
    return parts[parts.length - 1] ?? source;
  }
  // URL: use last path segment
  try {
    const url = new URL(source);
    const segments = url.pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? source;
  } catch {
    // Local path: use last directory name
    return source.split("/").pop() ?? source;
  }
}

function isExternalSource(source: string | MarketplaceExternalSource): source is MarketplaceExternalSource {
  return typeof source === "object" && source !== null && "type" in source;
}

// ── Marketplace Registration ──

export function getRegisteredMarketplaces(): MarketplaceConfig[] {
  const config = getConfig();
  const marketplaces: MarketplaceConfig[] = [];

  // Always include the default marketplace
  marketplaces.push({
    name: DEFAULT_MARKETPLACE_NAME,
    source: DEFAULT_MARKETPLACE,
    autoUpdate: true,
  });

  // Add user-configured marketplaces
  const configMarketplaces = (config as Record<string, unknown>).marketplaces as
    | Record<string, Record<string, unknown>>
    | undefined;

  if (configMarketplaces) {
    for (const [name, entry] of Object.entries(configMarketplaces)) {
      if (name === DEFAULT_MARKETPLACE_NAME) continue; // skip duplicate default
      marketplaces.push({
        name,
        source: (entry.source as string) ?? "",
        autoUpdate: (entry.autoUpdate as boolean) ?? true,
      });
    }
  }

  return marketplaces;
}

export function addMarketplace(source: string): string {
  const name = deriveNameFromSource(source);

  if (name === DEFAULT_MARKETPLACE_NAME) {
    throw new Error(`Cannot add marketplace with reserved name "${DEFAULT_MARKETPLACE_NAME}".`);
  }

  // Save to config under marketplaces.<name>
  const config = getConfig();
  const rawConfig = config as Record<string, unknown>;
  if (!rawConfig.marketplaces) {
    rawConfig.marketplaces = {};
  }
  const marketplaces = rawConfig.marketplaces as Record<string, Record<string, unknown>>;
  marketplaces[name] = { source, autoUpdate: true };
  saveConfig(config);

  return name;
}

export function removeMarketplace(name: string): void {
  if (name === DEFAULT_MARKETPLACE_NAME) {
    throw new Error(`Cannot remove the default marketplace "${DEFAULT_MARKETPLACE_NAME}".`);
  }

  const config = getConfig();
  const rawConfig = config as Record<string, unknown>;
  const marketplaces = rawConfig.marketplaces as
    | Record<string, Record<string, unknown>>
    | undefined;

  if (!marketplaces || !(name in marketplaces)) {
    throw new Error(`Marketplace "${name}" is not registered.`);
  }

  delete marketplaces[name];
  saveConfig(config);

  // Clean up cache directory
  const cacheDir = join(MARKETPLACE_CACHE_DIR, name);
  if (existsSync(cacheDir)) {
    rmSync(cacheDir, { recursive: true, force: true });
  }
}

// ── Manifest Fetching ──

export async function fetchMarketplaceManifest(
  config: MarketplaceConfig,
): Promise<MarketplaceManifest> {
  ensureDir(MARKETPLACE_CACHE_DIR);

  const github = parseGitHubSource(config.source);
  if (github) {
    const cacheDir = join(MARKETPLACE_CACHE_DIR, config.name);

    if (existsSync(cacheDir)) {
      // Pull latest
      try {
        execFileSync("git", ["-C", cacheDir, "pull"], { stdio: "pipe" });
      } catch {
        // If pull fails (e.g. network), use cached version
      }
    } else {
      // Clone
      execFileSync(
        "git",
        ["clone", `https://github.com/${github.user}/${github.repo}.git`, cacheDir],
        { stdio: "pipe" },
      );
    }

    const manifestPath = join(cacheDir, "marketplace.json");
    if (!existsSync(manifestPath)) {
      throw new Error(
        `Marketplace "${config.name}" does not contain a marketplace.json file.`,
      );
    }
    const raw = readFileSync(manifestPath, "utf-8");
    return JSON.parse(raw) as MarketplaceManifest;
  }

  // Check if it's a URL (http/https)
  if (config.source.startsWith("http://")) {
    throw new Error("HTTP marketplace sources are not supported for security. Use HTTPS.");
  }
  if (config.source.startsWith("https://")) {
    const response = await fetch(config.source);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch marketplace manifest from ${config.source}: ${response.statusText}`,
      );
    }
    return (await response.json()) as MarketplaceManifest;
  }

  // Local path
  const manifestPath = join(config.source, "marketplace.json");
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Marketplace at "${config.source}" does not contain a marketplace.json file.`,
    );
  }
  const raw = readFileSync(manifestPath, "utf-8");
  return JSON.parse(raw) as MarketplaceManifest;
}

// ── Plugin Discovery ──

export async function discoverPlugins(): Promise<DiscoveredPlugin[]> {
  const marketplaces = getRegisteredMarketplaces();
  const discovered: DiscoveredPlugin[] = [];

  // Read installed plugins from config
  const config = getConfig();
  const installedPlugins = config.plugins ?? {};

  for (const marketplace of marketplaces) {
    try {
      const manifest = await fetchMarketplaceManifest(marketplace);

      for (const plugin of manifest.plugins) {
        const isInstalled = plugin.name in installedPlugins;
        const pluginConfig = installedPlugins[plugin.name];
        const isEnabled = isInstalled ? pluginConfig?.enabled !== false : false;

        discovered.push({
          ...plugin,
          marketplace: marketplace.name,
          installed: isInstalled,
          enabled: isEnabled,
        });
      }
    } catch {
      // Skip marketplaces that fail to fetch
      continue;
    }
  }

  return discovered;
}

// ── Plugin Installation ──

export async function installPlugin(
  pluginName: string,
  marketplaceName?: string,
): Promise<InstallResult> {
  if (!isValidPluginName(pluginName)) {
    throw new Error(`Invalid plugin name "${pluginName}". Names must start with an alphanumeric character and contain only alphanumeric characters, hyphens, and underscores.`);
  }
  ensureDir(PLUGINS_DIR);

  const allPlugins = await discoverPlugins();

  // Find matching plugin
  let candidates = allPlugins.filter((p) => p.name === pluginName);
  if (marketplaceName) {
    candidates = candidates.filter((p) => p.marketplace === marketplaceName);
  }

  if (candidates.length === 0) {
    throw new Error(
      `Plugin "${pluginName}" not found${marketplaceName ? ` in marketplace "${marketplaceName}"` : ""}.`,
    );
  }

  const plugin = candidates[0]!;

  if (plugin.installed) {
    throw new Error(
      `Plugin "${pluginName}" is already installed. Use "todoist plugin remove ${pluginName}" first.`,
    );
  }

  const targetDir = join(PLUGINS_DIR, pluginName);

  if (isExternalSource(plugin.source)) {
    // External source
    resolveExternalSource(plugin.source, targetDir);
  } else {
    // String source
    const source = plugin.source;
    if (source.startsWith("./") || source.startsWith("../")) {
      // Relative path within marketplace cache dir
      const cacheDir = join(MARKETPLACE_CACHE_DIR, plugin.marketplace);
      const sourcePath = join(cacheDir, source);

      if (!existsSync(sourcePath)) {
        throw new Error(
          `Plugin source path not found: ${sourcePath}`,
        );
      }

      ensureDir(targetDir);
      cpSync(sourcePath, targetDir, { recursive: true });
    } else if (source.startsWith("github:")) {
      const github = parseGitHubSource(source);
      if (!github) throw new Error(`Invalid GitHub source: ${source}`);
      execFileSync(
        "git",
        ["clone", `https://github.com/${github.user}/${github.repo}.git`, targetDir],
        { stdio: "pipe" },
      );
    } else {
      // Treat as local path
      if (!existsSync(source)) {
        throw new Error(`Plugin source path not found: ${source}`);
      }
      ensureDir(targetDir);
      cpSync(source, targetDir, { recursive: true });
    }
  }

  // Install dependencies if package.json exists
  if (existsSync(join(targetDir, "package.json"))) {
    try {
      execFileSync("bun", ["install"], { cwd: targetDir, stdio: "pipe" });
    } catch {
      try {
        execFileSync("npm", ["install"], { cwd: targetDir, stdio: "pipe" });
      } catch {
        console.warn(
          `Warning: Failed to install dependencies for plugin "${pluginName}". The plugin may not work correctly.`,
        );
      }
    }
  }

  // Register in config
  setPluginEntry(pluginName, {
    source: `${pluginName}@${plugin.marketplace}`,
    enabled: true,
  });

  return {
    name: pluginName,
    version: plugin.version ?? "unknown",
    marketplace: plugin.marketplace,
    description: plugin.description,
  };
}

function resolveExternalSource(
  source: MarketplaceExternalSource,
  targetDir: string,
): void {
  switch (source.type) {
    case "github": {
      if (!source.repo) throw new Error("GitHub source requires a 'repo' field.");
      const cloneArgs = ["clone"];
      if (source.ref) cloneArgs.push("--branch", source.ref);
      cloneArgs.push(`https://github.com/${source.repo}.git`, targetDir);
      execFileSync("git", cloneArgs, { stdio: "pipe" });
      if (source.sha) {
        execFileSync("git", ["-C", targetDir, "checkout", source.sha], {
          stdio: "pipe",
        });
      }
      break;
    }
    case "git": {
      if (!source.url) throw new Error("Git source requires a 'url' field.");
      const gitCloneArgs = ["clone"];
      if (source.ref) gitCloneArgs.push("--branch", source.ref);
      gitCloneArgs.push(source.url, targetDir);
      execFileSync("git", gitCloneArgs, { stdio: "pipe" });
      if (source.sha) {
        execFileSync("git", ["-C", targetDir, "checkout", source.sha], {
          stdio: "pipe",
        });
      }
      break;
    }
    case "npm": {
      if (!source.package) throw new Error("npm source requires a 'package' field.");
      mkdirSync(targetDir, { recursive: true });
      execFileSync("npm", ["init", "-y"], { cwd: targetDir, stdio: "pipe" });
      execFileSync("npm", ["install", source.package], { cwd: targetDir, stdio: "pipe" });
      break;
    }
    default:
      throw new Error(`Unknown source type: ${(source as MarketplaceExternalSource).type}`);
  }
}

// ── Plugin Removal ──

export function removePlugin(name: string): void {
  if (!isValidPluginName(name)) {
    throw new Error(`Invalid plugin name "${name}". Names must start with an alphanumeric character and contain only alphanumeric characters, hyphens, and underscores.`);
  }
  const targetDir = join(PLUGINS_DIR, name);
  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true, force: true });
  }

  removePluginEntry(name);
}

// ── Plugin Update ──

export async function updatePlugin(name: string): Promise<UpdateResult> {
  if (!isValidPluginName(name)) {
    throw new Error(`Invalid plugin name "${name}". Names must start with an alphanumeric character and contain only alphanumeric characters, hyphens, and underscores.`);
  }
  const config = getConfig();
  const plugins = config.plugins;

  if (!plugins?.[name]) {
    throw new Error(`Plugin "${name}" is not installed.`);
  }

  const pluginEntry = plugins[name]!;
  const sourceStr = pluginEntry.source as string | undefined;

  if (!sourceStr) {
    return { name, updated: false, message: "No source information found" };
  }

  // Parse "pluginName@marketplaceName" format
  const atIndex = sourceStr.lastIndexOf("@");
  const marketplaceName = atIndex > 0 ? sourceStr.substring(atIndex + 1) : undefined;

  if (!marketplaceName) {
    return { name, updated: false, message: "Cannot determine marketplace for plugin" };
  }

  // Refresh marketplace cache
  await refreshMarketplaceCache(marketplaceName);

  // Find plugin in manifest
  const marketplaces = getRegisteredMarketplaces();
  const marketplace = marketplaces.find((m) => m.name === marketplaceName);
  if (!marketplace) {
    return { name, updated: false, message: `Marketplace "${marketplaceName}" not found` };
  }

  let manifest: MarketplaceManifest;
  try {
    manifest = await fetchMarketplaceManifest(marketplace);
  } catch {
    return { name, updated: false, message: `Failed to fetch marketplace "${marketplaceName}"` };
  }

  const pluginManifest = manifest.plugins.find((p) => p.name === name);
  if (!pluginManifest) {
    return { name, updated: false, message: `Plugin "${name}" no longer in marketplace` };
  }

  const oldVersion = (pluginEntry.version as string | undefined) ?? "unknown";
  const newVersion = pluginManifest.version ?? "unknown";
  const targetDir = join(PLUGINS_DIR, name);

  if (isExternalSource(pluginManifest.source)) {
    // For external sources with github type, git pull
    if (pluginManifest.source.type === "github" && existsSync(join(targetDir, ".git"))) {
      execFileSync("git", ["-C", targetDir, "pull"], { stdio: "pipe" });
    } else {
      // Re-install: remove and clone again
      if (existsSync(targetDir)) {
        rmSync(targetDir, { recursive: true, force: true });
      }
      resolveExternalSource(pluginManifest.source, targetDir);
    }
  } else {
    const source = pluginManifest.source;
    if (source.startsWith("./") || source.startsWith("../")) {
      // Re-copy from marketplace cache
      const cacheDir = join(MARKETPLACE_CACHE_DIR, marketplaceName);
      const sourcePath = join(cacheDir, source);

      if (existsSync(targetDir)) {
        rmSync(targetDir, { recursive: true, force: true });
      }
      ensureDir(targetDir);
      cpSync(sourcePath, targetDir, { recursive: true });
    } else if (existsSync(join(targetDir, ".git"))) {
      execFileSync("git", ["-C", targetDir, "pull"], { stdio: "pipe" });
    }
  }

  // Re-install dependencies if needed
  if (existsSync(join(targetDir, "package.json"))) {
    try {
      execFileSync("bun", ["install"], { cwd: targetDir, stdio: "pipe" });
    } catch {
      try {
        execFileSync("npm", ["install"], { cwd: targetDir, stdio: "pipe" });
      } catch {
        console.warn(
          `Warning: Failed to install dependencies for plugin "${name}". The plugin may not work correctly.`,
        );
      }
    }
  }

  // Update config version
  setPluginEntry(name, {
    ...pluginEntry,
    version: newVersion,
  });

  const updated = oldVersion !== newVersion;
  return {
    name,
    updated,
    oldVersion,
    newVersion,
    message: updated
      ? `Updated from ${oldVersion} to ${newVersion}`
      : "Already at latest version",
  };
}

export async function updateAllPlugins(): Promise<UpdateResult[]> {
  const config = getConfig();
  const plugins = config.plugins;
  if (!plugins) return [];

  const results: UpdateResult[] = [];
  for (const name of Object.keys(plugins)) {
    try {
      const result = await updatePlugin(name);
      results.push(result);
    } catch (err) {
      results.push({
        name,
        updated: false,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return results;
}

// ── Cache Management ──

export async function refreshMarketplaceCache(name?: string): Promise<void> {
  const marketplaces = getRegisteredMarketplaces();

  const targets = name
    ? marketplaces.filter((m) => m.name === name)
    : marketplaces;

  for (const marketplace of targets) {
    const github = parseGitHubSource(marketplace.source);
    if (!github) continue;

    const cacheDir = join(MARKETPLACE_CACHE_DIR, marketplace.name);

    if (existsSync(cacheDir)) {
      try {
        execFileSync("git", ["-C", cacheDir, "pull"], { stdio: "pipe" });
      } catch {
        // Network error — use existing cache
      }
    } else {
      try {
        execFileSync(
          "git",
          ["clone", `https://github.com/${github.user}/${github.repo}.git`, cacheDir],
          { stdio: "pipe" },
        );
      } catch {
        // Clone failed — skip
      }
    }
  }
}

// ── Enable / Disable ──

export function enablePlugin(name: string): void {
  const config = getConfig();
  const plugins = config.plugins;
  if (!plugins?.[name]) {
    throw new Error(`Plugin "${name}" is not installed.`);
  }

  const entry = plugins[name]!;
  // Remove the enabled: false flag (enabled by default)
  const { enabled: _enabled, ...rest } = entry;
  setPluginEntry(name, rest);
}

export function disablePlugin(name: string): void {
  const config = getConfig();
  const plugins = config.plugins;
  if (!plugins?.[name]) {
    throw new Error(`Plugin "${name}" is not installed.`);
  }

  setPluginEntry(name, { ...plugins[name]!, enabled: false });
}
