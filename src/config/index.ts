import { homedir } from "os";
import { join } from "path";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import TOML from "@iarna/toml";
import type { TaskTemplate } from "../api/types.ts";

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
  plugins?: Record<string, Record<string, unknown>>;
  ui?: Partial<UiConfig>;
  sync?: Partial<SyncConfig>;
  marketplaces?: Record<string, MarketplaceConfigEntry>;
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function getConfig(): Config {
  ensureConfigDir();
  if (!existsSync(CONFIG_PATH)) return {};
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  return TOML.parse(raw) as unknown as Config;
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
    console.error("Not authenticated. Run `todoist auth` first.");
    process.exit(1);
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

const UI_DEFAULTS: UiConfig = {
  theme: "default",
  date_format: "relative",
  refresh_interval: 60,
};

export function getUiConfig(): UiConfig {
  const config = getConfig();
  return {
    theme: config.ui?.theme ?? UI_DEFAULTS.theme,
    date_format: config.ui?.date_format ?? UI_DEFAULTS.date_format,
    refresh_interval: config.ui?.refresh_interval ?? UI_DEFAULTS.refresh_interval,
  };
}

// Sync config

const SYNC_DEFAULTS: SyncConfig = {
  retry_count: 3,
  timeout: 30,
};

export function getSyncConfig(): SyncConfig {
  const config = getConfig();
  return {
    retry_count: config.sync?.retry_count ?? SYNC_DEFAULTS.retry_count,
    timeout: config.sync?.timeout ?? SYNC_DEFAULTS.timeout,
  };
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
