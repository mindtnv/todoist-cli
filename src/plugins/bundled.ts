import { join, dirname } from "path";
import { existsSync, readdirSync, symlinkSync, readFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { getConfig, setPluginEntry } from "../config/index.ts";

const PLUGINS_DIR = join(
  process.env.HOME ?? process.env.USERPROFILE ?? "",
  ".config",
  "todoist-cli",
  "plugins",
);

/**
 * Find the bundled plugins directory shipped with the npm package.
 * Layout: dist/index.js -> go up one level to find plugins/
 */
function findBundledPluginsDir(): string | null {
  try {
    // Works for both ESM (import.meta) and bundled (fileURLToPath)
    const currentFile = typeof __filename !== "undefined"
      ? __filename
      : fileURLToPath(import.meta.url);
    const packageRoot = dirname(dirname(currentFile)); // up from dist/index.js
    const bundledDir = join(packageRoot, "plugins");
    if (existsSync(bundledDir)) return bundledDir;
  } catch {
    // Fallback: try relative to process.argv[1]
  }

  // Dev mode: plugins/ in project root
  const devDir = join(process.cwd(), "plugins");
  if (existsSync(devDir)) return devDir;

  return null;
}

/**
 * Set up bundled plugins on first run.
 * Creates symlinks from ~/.config/todoist-cli/plugins/<name> -> bundled source,
 * and registers them in config with enabled: false.
 */
export function setupBundledPlugins(): void {
  const bundledDir = findBundledPluginsDir();
  if (!bundledDir) return;

  let pluginNames: string[];
  try {
    pluginNames = readdirSync(bundledDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return;
  }

  const config = getConfig();

  for (const name of pluginNames) {
    const targetDir = join(PLUGINS_DIR, name);

    // Skip if already installed (directory or symlink exists)
    if (existsSync(targetDir)) continue;

    const sourcePath = join(bundledDir, name);

    // Read manifest for display name
    let displayName = name;
    const manifestPath = join(sourcePath, "plugin.json");
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
        if (manifest.name) displayName = manifest.name;
      } catch {
        // ignore
      }
    }

    // Create symlink
    try {
      mkdirSync(PLUGINS_DIR, { recursive: true });
      symlinkSync(sourcePath, targetDir, "dir");
    } catch {
      // Symlink failed (permissions, Windows, etc.) — skip silently
      continue;
    }

    // Register in config as disabled if not already present
    if (!config.plugins?.[displayName]) {
      setPluginEntry(displayName, { source: `bundled:${name}`, enabled: false });
    }
  }
}
