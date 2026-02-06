import { homedir } from "os";
import { join } from "path";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import TOML from "@iarna/toml";
import type { TaskTemplate } from "../api/types.ts";

const CONFIG_DIR = join(homedir(), ".config", "todoist-cli");
const CONFIG_PATH = join(CONFIG_DIR, "config.toml");
const TEMPLATES_PATH = join(CONFIG_DIR, "templates.json");

interface Defaults {
  project?: string;
  priority?: number;
  labels?: string[];
}

interface Config {
  auth?: { api_token?: string };
  defaults?: Defaults;
  filters?: Record<string, string>;
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
