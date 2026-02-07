import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import { Database } from "bun:sqlite";
import type { PluginStorage } from "./types.ts";

export interface PluginStorageWithClose extends PluginStorage {
  close(): void;
}

export function createPluginStorage(dataDir: string): PluginStorageWithClose {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const db = new Database(join(dataDir, "data.db"));
  db.exec("PRAGMA journal_mode=WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_data (
      task_id TEXT,
      key TEXT,
      value TEXT,
      PRIMARY KEY (task_id, key)
    )
  `);

  // Prepared statements
  const kvGet = db.prepare("SELECT value FROM kv WHERE key = ?");
  const kvSet = db.prepare(
    "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
  );
  const kvDelete = db.prepare("DELETE FROM kv WHERE key = ?");
  const kvListAll = db.prepare("SELECT key FROM kv");
  const kvListPrefix = db.prepare("SELECT key FROM kv WHERE key LIKE ?");

  const tdGet = db.prepare(
    "SELECT value FROM task_data WHERE task_id = ? AND key = ?",
  );
  const tdSet = db.prepare(
    "INSERT OR REPLACE INTO task_data (task_id, key, value) VALUES (?, ?, ?)",
  );

  return {
    async get<T>(key: string): Promise<T | null> {
      const row = kvGet.get(key) as { value: string } | null;
      if (!row) return null;
      try {
        return JSON.parse(row.value) as T;
      } catch {
        return null;
      }
    },

    async set<T>(key: string, value: T): Promise<void> {
      kvSet.run(key, JSON.stringify(value));
    },

    async delete(key: string): Promise<void> {
      kvDelete.run(key);
    },

    async list(prefix?: string): Promise<string[]> {
      if (!prefix) {
        const rows = kvListAll.all() as { key: string }[];
        return rows.map((r) => r.key);
      }
      // Escape % and _ in the prefix for LIKE, then append %
      const escaped = prefix.replace(/%/g, "\\%").replace(/_/g, "\\_");
      const rows = kvListPrefix.all(`${escaped}%`) as { key: string }[];
      return rows.map((r) => r.key);
    },

    async getTaskData<T>(taskId: string, key: string): Promise<T | null> {
      const row = tdGet.get(taskId, key) as { value: string } | null;
      if (!row) return null;
      try {
        return JSON.parse(row.value) as T;
      } catch {
        return null;
      }
    },

    async setTaskData<T>(
      taskId: string,
      key: string,
      value: T,
    ): Promise<void> {
      tdSet.run(taskId, key, JSON.stringify(value));
    },

    close() {
      db.close();
    },
  };
}
