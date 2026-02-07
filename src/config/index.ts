import { homedir } from "os";
import { join } from "path";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import TOML from "@iarna/toml";
import type { TaskTemplate } from "../api/types.ts";
import { CliError, EXIT_USAGE } from "../utils/errors.ts";

export const CONFIG_DIR =
  process.env.TODOIST_CLI_CONFIG_DIR || join(homedir(), ".config", "todoist-cli");
const CONFIG_PATH = join(CONFIG_DIR, "config.toml");
const TEMPLATES_PATH = join(CONFIG_DIR, "templates.json");

interface Defaults {
  project?: string;
  priority?: number;
  labels?: string[];
}

export type UiTheme = "default" | "minimal" | "compact";
export type DateFormat = "relative" | "absolute" | "iso";

export interface UiConfig {
  theme: UiTheme;
  date_format: DateFormat;
  refresh_interval: number; // seconds for auto-refresh in TUI
}

export interface SyncConfig {
  retry_count: number;  // max API retries
  timeout: number;      // request timeout in seconds
}

export interface MarketplaceConfigEntry {
  source: string;
  auto_update?: boolean;
}

export interface Config {
  auth?: { api_token?: string };
  defaults?: Defaults;
  filters?: Record<string, string>;
  aliases?: Record<string, string>;
  plugins?: Record<string, Record<string, unknown>>;
  ui?: Partial<UiConfig>;
  sync?: Partial<SyncConfig>;
  marketplaces?: Record<string, MarketplaceConfigEntry>;
}

const VALID_UI_THEMES: UiTheme[] = ["default", "minimal", "compact"];
const VALID_DATE_FORMATS: DateFormat[] = ["relative", "absolute", "iso"];

const KNOWN_TOP_LEVEL_KEYS = new Set([
  "auth", "defaults", "filters", "aliases", "plugins", "ui", "sync", "marketplaces",
]);

export const DEFAULT_CONFIG: Config = {
  auth: {},
  defaults: {},
  filters: {},
  aliases: {},
  plugins: {},
  ui: {
    theme: "default",
    date_format: "relative",
    refresh_interval: 60,
  },
  sync: {
    retry_count: 3,
    timeout: 30,
  },
  marketplaces: {},
};

/**
 * Deep-merges two objects. User values override defaults.
 * Arrays are replaced, not merged. null/undefined user values don't override defaults.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function deepMerge<T>(defaults: T, userConfig: any): T {
  if (
    typeof defaults !== "object" || defaults === null ||
    typeof userConfig !== "object" || userConfig === null ||
    Array.isArray(defaults) || Array.isArray(userConfig)
  ) {
    // For non-objects or arrays, user value wins (unless null/undefined handled by caller)
    return userConfig as T;
  }

  const result = { ...defaults } as Record<string, unknown>;
  const user = userConfig as Record<string, unknown>;

  for (const key of Object.keys(user)) {
    const userVal = user[key];
    const defaultVal = result[key];

    // null/undefined user values don't override defaults
    if (userVal === null || userVal === undefined) {
      continue;
    }

    // Arrays are replaced, not merged
    if (Array.isArray(userVal)) {
      result[key] = userVal;
      continue;
    }

    // Recursively merge plain objects
    if (
      typeof userVal === "object" &&
      typeof defaultVal === "object" &&
      defaultVal !== null &&
      !Array.isArray(defaultVal)
    ) {
      result[key] = deepMerge(defaultVal, userVal);
      continue;
    }

    // Primitive values: user overrides default
    result[key] = userVal;
  }

  return result as T;
}

/**
 * Validates a raw parsed config object and returns a typed Config.
 * Collects all validation errors and throws a single CliError with all problems.
 * Warns on stderr for unknown top-level keys but does not fail.
 */
export function validateConfig(raw: unknown): Config {
  const errors: string[] = [];

  if (raw === null || raw === undefined) {
    return deepMerge(DEFAULT_CONFIG, {});
  }

  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new CliError("Config error: configuration must be an object", {
      code: EXIT_USAGE,
    });
  }

  const obj = raw as Record<string, unknown>;

  // Warn about unknown top-level keys
  for (const key of Object.keys(obj)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      console.error(`Config warning: unknown top-level key "${key}" will be ignored`);
    }
  }

  // Validate auth section
  if (obj.auth !== undefined) {
    if (typeof obj.auth !== "object" || obj.auth === null || Array.isArray(obj.auth)) {
      errors.push('Config error: auth must be an object');
    } else {
      const auth = obj.auth as Record<string, unknown>;
      if (auth.api_token !== undefined && typeof auth.api_token !== "string") {
        errors.push(`Config error: auth.api_token must be a string, got ${JSON.stringify(auth.api_token)}`);
      }
    }
  }

  // Validate defaults section
  if (obj.defaults !== undefined) {
    if (typeof obj.defaults !== "object" || obj.defaults === null || Array.isArray(obj.defaults)) {
      errors.push('Config error: defaults must be an object');
    } else {
      const defaults = obj.defaults as Record<string, unknown>;
      if (defaults.priority !== undefined) {
        if (typeof defaults.priority !== "number" || !Number.isInteger(defaults.priority) || defaults.priority < 1 || defaults.priority > 4) {
          errors.push(`Config error: defaults.priority must be 1-4, got ${JSON.stringify(defaults.priority)}`);
        }
      }
      if (defaults.project !== undefined && typeof defaults.project !== "string") {
        errors.push(`Config error: defaults.project must be a string, got ${JSON.stringify(defaults.project)}`);
      }
      if (defaults.labels !== undefined) {
        if (!Array.isArray(defaults.labels) || !defaults.labels.every((l: unknown) => typeof l === "string")) {
          errors.push(`Config error: defaults.labels must be an array of strings, got ${JSON.stringify(defaults.labels)}`);
        }
      }
    }
  }

  // Validate ui section
  if (obj.ui !== undefined) {
    if (typeof obj.ui !== "object" || obj.ui === null || Array.isArray(obj.ui)) {
      errors.push('Config error: ui must be an object');
    } else {
      const ui = obj.ui as Record<string, unknown>;
      if (ui.theme !== undefined) {
        if (typeof ui.theme !== "string" || !VALID_UI_THEMES.includes(ui.theme as UiTheme)) {
          errors.push(`Config error: ui.theme must be one of ${VALID_UI_THEMES.join(", ")}, got ${JSON.stringify(ui.theme)}`);
        }
      }
      if (ui.date_format !== undefined) {
        if (typeof ui.date_format !== "string" || !VALID_DATE_FORMATS.includes(ui.date_format as DateFormat)) {
          errors.push(`Config error: ui.date_format must be one of ${VALID_DATE_FORMATS.join(", ")}, got ${JSON.stringify(ui.date_format)}`);
        }
      }
      if (ui.refresh_interval !== undefined) {
        if (typeof ui.refresh_interval !== "number" || ui.refresh_interval <= 0) {
          errors.push(`Config error: ui.refresh_interval must be a positive number, got ${JSON.stringify(ui.refresh_interval)}`);
        }
      }
    }
  }

  // Validate sync section
  if (obj.sync !== undefined) {
    if (typeof obj.sync !== "object" || obj.sync === null || Array.isArray(obj.sync)) {
      errors.push('Config error: sync must be an object');
    } else {
      const sync = obj.sync as Record<string, unknown>;
      if (sync.retry_count !== undefined) {
        if (typeof sync.retry_count !== "number" || !Number.isInteger(sync.retry_count) || sync.retry_count <= 0) {
          errors.push(`Config error: sync.retry_count must be a positive integer, got ${JSON.stringify(sync.retry_count)}`);
        }
      }
      if (sync.timeout !== undefined) {
        if (typeof sync.timeout !== "number" || !Number.isInteger(sync.timeout) || sync.timeout <= 0) {
          errors.push(`Config error: sync.timeout must be a positive integer, got ${JSON.stringify(sync.timeout)}`);
        }
      }
    }
  }

  // Validate plugins section
  if (obj.plugins !== undefined) {
    if (typeof obj.plugins !== "object" || obj.plugins === null || Array.isArray(obj.plugins)) {
      errors.push('Config error: plugins must be an object');
    } else {
      const plugins = obj.plugins as Record<string, unknown>;
      for (const [name, value] of Object.entries(plugins)) {
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
          errors.push(`Config error: plugins.${name} must be an object, got ${JSON.stringify(value)}`);
        }
      }
    }
  }

  // Validate filters section
  if (obj.filters !== undefined) {
    if (typeof obj.filters !== "object" || obj.filters === null || Array.isArray(obj.filters)) {
      errors.push('Config error: filters must be an object');
    } else {
      const filters = obj.filters as Record<string, unknown>;
      for (const [name, value] of Object.entries(filters)) {
        if (typeof value !== "string") {
          errors.push(`Config error: filters.${name} must be a string, got ${JSON.stringify(value)}`);
        }
      }
    }
  }

  // Validate aliases section
  if (obj.aliases !== undefined) {
    if (typeof obj.aliases !== "object" || obj.aliases === null || Array.isArray(obj.aliases)) {
      errors.push('Config error: aliases must be an object');
    } else {
      const aliases = obj.aliases as Record<string, unknown>;
      for (const [name, value] of Object.entries(aliases)) {
        if (typeof name !== "string" || typeof value !== "string") {
          errors.push(`Config error: aliases.${name} must be a string, got ${JSON.stringify(value)}`);
        }
      }
    }
  }

  // Validate marketplaces section
  if (obj.marketplaces !== undefined) {
    if (typeof obj.marketplaces !== "object" || obj.marketplaces === null || Array.isArray(obj.marketplaces)) {
      errors.push('Config error: marketplaces must be an object');
    } else {
      const marketplaces = obj.marketplaces as Record<string, unknown>;
      for (const [name, value] of Object.entries(marketplaces)) {
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
          errors.push(`Config error: marketplaces.${name} must be an object, got ${JSON.stringify(value)}`);
        } else {
          const entry = value as Record<string, unknown>;
          if (typeof entry.source !== "string") {
            errors.push(`Config error: marketplaces.${name}.source must be a string, got ${JSON.stringify(entry.source)}`);
          }
          if (entry.auto_update !== undefined && typeof entry.auto_update !== "boolean") {
            errors.push(`Config error: marketplaces.${name}.auto_update must be a boolean, got ${JSON.stringify(entry.auto_update)}`);
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new CliError(errors.join("\n"), { code: EXIT_USAGE });
  }

  // Deep-merge user config over defaults
  return deepMerge(DEFAULT_CONFIG, obj as Partial<Config>);
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function getConfig(): Config {
  ensureConfigDir();
  if (!existsSync(CONFIG_PATH)) return deepMerge(DEFAULT_CONFIG, {});
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  const parsed = TOML.parse(raw);
  return validateConfig(parsed);
}

export function saveConfig(config: Config): void {
  ensureConfigDir();
  const raw = TOML.stringify(config as unknown as TOML.JsonMap);
  writeFileSync(CONFIG_PATH, raw, "utf-8");
}

export function getToken(): string | null {
  const config = getConfig();
  return config.auth?.api_token ?? null;
}

export function setToken(token: string): void {
  const config = getConfig();
  config.auth = { ...config.auth, api_token: token };
  saveConfig(config);
}

export function requireToken(): string {
  const token = getToken();
  if (!token) {
    throw new Error("Not authenticated. Run `todoist auth` first.");
  }
  return token;
}

export function getTemplates(): TaskTemplate[] {
  ensureConfigDir();
  if (!existsSync(TEMPLATES_PATH)) return [];
  const raw = readFileSync(TEMPLATES_PATH, "utf-8");
  return JSON.parse(raw) as TaskTemplate[];
}

export function saveTemplates(templates: TaskTemplate[]): void {
  ensureConfigDir();
  writeFileSync(TEMPLATES_PATH, JSON.stringify(templates, null, 2), "utf-8");
}

export function addTemplate(template: TaskTemplate): void {
  const templates = getTemplates();
  const existing = templates.findIndex((t) => t.name === template.name);
  if (existing !== -1) {
    templates[existing] = template;
  } else {
    templates.push(template);
  }
  saveTemplates(templates);
}

export function removeTemplate(name: string): boolean {
  const templates = getTemplates();
  const filtered = templates.filter((t) => t.name !== name);
  if (filtered.length === templates.length) return false;
  saveTemplates(filtered);
  return true;
}

// Defaults

export function getDefaults(): Defaults {
  const config = getConfig();
  return config.defaults ?? {};
}

// UI config

export function getUiConfig(): UiConfig {
  const config = getConfig();
  // Config is already deep-merged with DEFAULT_CONFIG, so ui fields are guaranteed
  return config.ui as UiConfig;
}

// Sync config

export function getSyncConfig(): SyncConfig {
  const config = getConfig();
  // Config is already deep-merged with DEFAULT_CONFIG, so sync fields are guaranteed
  return config.sync as SyncConfig;
}

// Saved filters

export function getFilters(): Record<string, string> {
  const config = getConfig();
  return config.filters ?? {};
}

export function saveFilter(name: string, query: string): void {
  const config = getConfig();
  config.filters = { ...config.filters, [name]: query };
  saveConfig(config);
}

export function removeFilter(name: string): boolean {
  const config = getConfig();
  if (!config.filters || !(name in config.filters)) return false;
  delete config.filters[name];
  saveConfig(config);
  return true;
}

// Aliases

export function getAliases(): Record<string, string> {
  const config = getConfig();
  return config.aliases ?? {};
}

export function setAlias(name: string, command: string): void {
  const config = getConfig();
  config.aliases = { ...config.aliases, [name]: command };
  saveConfig(config);
}

export function removeAlias(name: string): boolean {
  const config = getConfig();
  if (!config.aliases || !(name in config.aliases)) return false;
  delete config.aliases[name];
  saveConfig(config);
  return true;
}

export function getPluginConfig(): Record<string, Record<string, unknown>> {
  const config = getConfig();
  return config.plugins ?? {};
}

export function setPluginEntry(name: string, entry: Record<string, unknown>): void {
  const config = getConfig();
  if (!config.plugins) config.plugins = {};
  config.plugins[name] = entry;
  saveConfig(config);
}

export function removePluginEntry(name: string): void {
  const config = getConfig();
  if (config.plugins) {
    delete config.plugins[name];
  }
  saveConfig(config);
}

export function getPluginDir(): string {
  return join(CONFIG_DIR, "plugins");
}

// Marketplace config

export function getMarketplaces(): Record<string, MarketplaceConfigEntry> {
  const config = getConfig();
  const rawConfig = config as Record<string, unknown>;
  const marketplaces = rawConfig.marketplaces as Record<string, MarketplaceConfigEntry> | undefined;
  return marketplaces ?? {};
}

export function setMarketplace(name: string, entry: MarketplaceConfigEntry): void {
  const config = getConfig();
  const rawConfig = config as Record<string, unknown>;
  if (!rawConfig.marketplaces) {
    rawConfig.marketplaces = {};
  }
  const marketplaces = rawConfig.marketplaces as Record<string, MarketplaceConfigEntry>;
  marketplaces[name] = entry;
  saveConfig(config);
}

export function removeMarketplace(name: string): void {
  const config = getConfig();
  const rawConfig = config as Record<string, unknown>;
  const marketplaces = rawConfig.marketplaces as Record<string, MarketplaceConfigEntry> | undefined;
  if (marketplaces) {
    delete marketplaces[name];
  }
  saveConfig(config);
}
