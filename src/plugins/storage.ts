import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import type { PluginStorage } from "./types.ts";

export interface PluginStorageWithClose extends PluginStorage {
  close(): void;
}

export function createPluginStorage(dataDir: string): PluginStorageWithClose {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = join(dataDir, "data.db");
  const db = new Database(dbPath);

  db.run("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS task_data (task_id TEXT, key TEXT, value TEXT, PRIMARY KEY (task_id, key))");

  const getStmt = db.prepare("SELECT value FROM kv WHERE key = ?");
  const setStmt = db.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)");
  const delStmt = db.prepare("DELETE FROM kv WHERE key = ?");
  const listStmt = db.prepare("SELECT key FROM kv WHERE key LIKE ? ESCAPE '\\'");

  const getTaskStmt = db.prepare("SELECT value FROM task_data WHERE task_id = ? AND key = ?");
  const setTaskStmt = db.prepare("INSERT OR REPLACE INTO task_data (task_id, key, value) VALUES (?, ?, ?)");

  return {
    async get<T>(key: string): Promise<T | null> {
      const row = getStmt.get(key) as { value: string } | null;
      if (!row) return null;
      try {
        return JSON.parse(row.value) as T;
      } catch {
        console.warn("[plugin-storage] Corrupted data for key:", key);
        return null;
      }
    },

    async set<T>(key: string, value: T): Promise<void> {
      const serialized = JSON.stringify(value);
      setStmt.run(key, serialized);
    },

    async delete(key: string): Promise<void> {
      delStmt.run(key);
    },

    async list(prefix?: string): Promise<string[]> {
      // Escape SQL LIKE wildcards in the prefix to prevent unintended pattern matching
      const escapedPrefix = prefix
        ? prefix.replace(/[%_\\]/g, (ch) => `\\${ch}`)
        : "";
      const pattern = prefix ? `${escapedPrefix}%` : "%";
      const rows = listStmt.all(pattern) as Array<{ key: string }>;
      return rows.map(r => r.key);
    },

    async getTaskData<T>(taskId: string, key: string): Promise<T | null> {
      const row = getTaskStmt.get(taskId, key) as { value: string } | null;
      if (!row) return null;
      try {
        return JSON.parse(row.value) as T;
      } catch {
        console.warn("[plugin-storage] Corrupted data for key:", `${taskId}:${key}`);
        return null;
      }
    },

    async setTaskData<T>(taskId: string, key: string, value: T): Promise<void> {
      const serialized = JSON.stringify(value);
      setTaskStmt.run(taskId, key, serialized);
    },

    close() {
      db.close();
    },
  };
}
