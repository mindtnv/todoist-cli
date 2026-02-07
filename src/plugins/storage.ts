import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { PluginStorage } from "./types.ts";

export interface PluginStorageWithClose extends PluginStorage {
  close(): void;
}

function loadJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function saveJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

export function createPluginStorage(dataDir: string): PluginStorageWithClose {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const kvPath = join(dataDir, "kv.json");
  const taskDataPath = join(dataDir, "task-data.json");

  let kv: Record<string, unknown> = loadJson(kvPath, {});
  let taskData: Record<string, Record<string, unknown>> = loadJson(taskDataPath, {});

  return {
    async get<T>(key: string): Promise<T | null> {
      const value = kv[key];
      return value !== undefined ? (value as T) : null;
    },

    async set<T>(key: string, value: T): Promise<void> {
      kv[key] = value;
      saveJson(kvPath, kv);
    },

    async delete(key: string): Promise<void> {
      delete kv[key];
      saveJson(kvPath, kv);
    },

    async list(prefix?: string): Promise<string[]> {
      const keys = Object.keys(kv);
      if (!prefix) return keys;
      return keys.filter((k) => k.startsWith(prefix));
    },

    async getTaskData<T>(taskId: string, key: string): Promise<T | null> {
      const value = taskData[taskId]?.[key];
      return value !== undefined ? (value as T) : null;
    },

    async setTaskData<T>(taskId: string, key: string, value: T): Promise<void> {
      if (!taskData[taskId]) taskData[taskId] = {};
      taskData[taskId][key] = value;
      saveJson(taskDataPath, taskData);
    },

    close() {
      // No-op — JSON files are written synchronously on each mutation
    },
  };
}
