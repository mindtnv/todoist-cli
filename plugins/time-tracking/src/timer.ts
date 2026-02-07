import type { PluginStorage } from "../../../src/plugins/types.ts";
import { formatDuration } from "./format.ts";

export interface TimeEntry {
  taskId: string;
  start: number;
  end: number;
  duration: number;
}

interface ActiveTimer {
  taskId: string;
  start: number;
  paused: boolean;
  accumulated: number;
}

const MAX_CACHE_SIZE = 200;

export class TimerService {
  private storage: PluginStorage;
  private active: ActiveTimer | null = null;
  private totalCache = new Map<string, number>();

  constructor(storage: PluginStorage) {
    this.storage = storage;
  }

  async start(taskId: string): Promise<void> {
    // If paused for the same task — resume
    if (this.active && this.active.taskId === taskId && this.active.paused) {
      this.active.start = Date.now();
      this.active.paused = false;
      await this.storage.set("active-timer", this.active);
      await this.trackTask(taskId);
      return;
    }

    // If there's an active (running or paused) timer for a different task — stop it first
    if (this.active) {
      await this.stopActive();
    }

    this.active = { taskId, start: Date.now(), paused: false, accumulated: 0 };
    await this.storage.set("active-timer", this.active);
    await this.trackTask(taskId);
  }

  async pause(taskId: string): Promise<void> {
    if (!this.active || this.active.taskId !== taskId || this.active.paused) return;

    const elapsed = Date.now() - this.active.start;
    this.active.accumulated += elapsed;
    this.active.paused = true;
    this.active.start = 0;
    await this.storage.set("active-timer", this.active);
  }

  async stop(taskId: string): Promise<number> {
    if (!this.active || this.active.taskId !== taskId) return 0;

    let duration: number;
    if (this.active.paused) {
      duration = this.active.accumulated;
    } else {
      duration = this.active.accumulated + (Date.now() - this.active.start);
    }

    const now = Date.now();
    const entry: TimeEntry = {
      taskId,
      start: now - duration,
      end: now,
      duration,
    };

    // Save entry FIRST to prevent data loss
    const entries = (await this.storage.getTaskData<TimeEntry[]>(taskId, "entries")) ?? [];
    entries.push(entry);
    await this.storage.setTaskData(taskId, "entries", entries);

    // Update total
    const total = entries.reduce((s, e) => s + e.duration, 0);
    await this.storage.setTaskData(taskId, "total", total);
    this.touchCache(taskId, total);

    // Clear active timer AFTER successful save
    this.active = null;
    await this.storage.delete("active-timer");

    return duration;
  }

  async stopActive(): Promise<number> {
    if (!this.active) return 0;
    return this.stop(this.active.taskId);
  }

  async restoreState(): Promise<void> {
    try {
      this.active = await this.storage.get<ActiveTimer>("active-timer");
    } catch (err) {
      console.error("[time-tracking] Failed to restore timer state:", err);
      this.active = null;
      return;
    }

    // Migrate legacy state shape (no paused/accumulated fields)
    if (this.active && this.active.paused === undefined) {
      this.active.paused = false;
      this.active.accumulated = 0;
    }

    // Detect stale timer after crash (>24h elapsed)
    if (this.active && !this.active.paused) {
      const elapsed = this.active.accumulated + (Date.now() - this.active.start);
      const STALE_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours
      if (elapsed > STALE_THRESHOLD) {
        console.warn("[time-tracking] Stale timer detected (>24h), auto-stopped");
        await this.saveStaleTimerEntry(this.active.accumulated);
      }
    }

    // Also detect stale paused timers (>24h accumulated)
    if (this.active && this.active.paused) {
      const STALE_THRESHOLD = 24 * 60 * 60 * 1000;
      if (this.active.accumulated > STALE_THRESHOLD) {
        console.warn("[time-tracking] Stale paused timer detected (>24h accumulated), auto-stopped");
        await this.saveStaleTimerEntry(this.active.accumulated);
      }
    }
  }

  /** Save accumulated time from a stale timer as an entry and clear the active timer. */
  private async saveStaleTimerEntry(duration: number): Promise<void> {
    if (!this.active) return;
    const taskId = this.active.taskId;
    if (duration > 0) {
      const now = Date.now();
      const entry: TimeEntry = {
        taskId,
        start: now - duration,
        end: now,
        duration,
      };
      const entries = (await this.storage.getTaskData<TimeEntry[]>(taskId, "entries")) ?? [];
      entries.push(entry);
      await this.storage.setTaskData(taskId, "entries", entries);
      const total = entries.reduce((s, e) => s + e.duration, 0);
      await this.storage.setTaskData(taskId, "total", total);
      this.touchCache(taskId, total);
    }
    this.active = null;
    await this.storage.delete("active-timer");
  }

  async persistState(): Promise<void> {
    if (this.active) {
      await this.storage.set("active-timer", this.active);
    }
  }

  async isRunning(taskId: string): Promise<boolean> {
    return this.active?.taskId === taskId && !this.active.paused;
  }

  // Sync versions for render functions (no await)
  isRunningSync(taskId: string): boolean {
    return this.active?.taskId === taskId && !this.active.paused;
  }

  isPausedSync(taskId: string): boolean {
    return this.active?.taskId === taskId && this.active.paused === true;
  }

  getActiveTaskId(): string | null {
    return this.active?.taskId ?? null;
  }

  getElapsedSync(taskId: string): number {
    if (!this.active || this.active.taskId !== taskId) return 0;
    if (this.active.paused) return this.active.accumulated;
    return this.active.accumulated + (Date.now() - this.active.start);
  }

  getTotalSync(taskId: string): number {
    return this.totalCache.get(taskId) ?? 0;
  }

  hasActiveTimer(): boolean {
    return this.active !== null && !this.active.paused;
  }

  hasPausedTimer(): boolean {
    return this.active !== null && this.active.paused;
  }

  getActive(): { taskId: string; elapsed: number; paused: boolean } | null {
    if (!this.active) return null;
    let elapsed: number;
    if (this.active.paused) {
      elapsed = this.active.accumulated;
    } else {
      elapsed = this.active.accumulated + (Date.now() - this.active.start);
    }
    return {
      taskId: this.active.taskId,
      elapsed,
      paused: this.active.paused,
    };
  }

  getActiveFormatted(): string {
    if (!this.active) return "";
    const state = this.getActive()!;
    const icon = state.paused ? "\u23F8" : "\u25B6";
    const taskShort = state.taskId.slice(0, 8);
    return `${icon} ${formatDuration(state.elapsed)} [${taskShort}]`;
  }

  async getTotal(taskId: string): Promise<number> {
    const cached = this.totalCache.get(taskId);
    if (cached !== undefined) {
      // Touch for LRU
      this.touchCache(taskId, cached);
      return cached;
    }
    const total = (await this.storage.getTaskData<number>(taskId, "total")) ?? 0;
    this.touchCache(taskId, total);
    return total;
  }

  async getEntries(taskId: string): Promise<TimeEntry[]> {
    return (await this.storage.getTaskData<TimeEntry[]>(taskId, "entries")) ?? [];
  }

  async deleteEntry(taskId: string, entryIndex: number): Promise<void> {
    const entries = (await this.storage.getTaskData<TimeEntry[]>(taskId, "entries")) ?? [];
    if (entryIndex < 0 || entryIndex >= entries.length) {
      throw new Error(`Entry index ${entryIndex} out of range (0-${entries.length - 1})`);
    }
    entries.splice(entryIndex, 1);
    await this.storage.setTaskData(taskId, "entries", entries);

    const total = entries.reduce((s, e) => s + e.duration, 0);
    await this.storage.setTaskData(taskId, "total", total);
    this.touchCache(taskId, total);
  }

  async editEntryDuration(taskId: string, entryIndex: number, durationMs: number): Promise<void> {
    const entries = (await this.storage.getTaskData<TimeEntry[]>(taskId, "entries")) ?? [];
    if (entryIndex < 0 || entryIndex >= entries.length) {
      throw new Error(`Entry index ${entryIndex} out of range (0-${entries.length - 1})`);
    }
    const entry = entries[entryIndex]!;
    entry.duration = durationMs;
    entry.end = entry.start + durationMs;
    await this.storage.setTaskData(taskId, "entries", entries);

    const total = entries.reduce((s, e) => s + e.duration, 0);
    await this.storage.setTaskData(taskId, "total", total);
    this.touchCache(taskId, total);
  }

  async addManualEntry(taskId: string, durationMs: number): Promise<void> {
    const now = Date.now();
    const entry: TimeEntry = {
      taskId,
      start: now - durationMs,
      end: now,
      duration: durationMs,
    };

    await this.trackTask(taskId);

    const entries = (await this.storage.getTaskData<TimeEntry[]>(taskId, "entries")) ?? [];
    entries.push(entry);
    await this.storage.setTaskData(taskId, "entries", entries);

    const total = entries.reduce((s, e) => s + e.duration, 0);
    await this.storage.setTaskData(taskId, "total", total);
    this.touchCache(taskId, total);
  }

  async getAllEntries(days: number = 7): Promise<TimeEntry[]> {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const trackedTasks = (await this.storage.get<string[]>("tracked-tasks")) ?? [];
    const allEntries: TimeEntry[] = [];

    for (const taskId of trackedTasks) {
      const entries = (await this.storage.getTaskData<TimeEntry[]>(taskId, "entries")) ?? [];
      allEntries.push(...entries.filter(e => e.start >= since));
    }

    return allEntries.sort((a, b) => b.start - a.start);
  }

  // Track that a task has time entries (for getAllEntries scanning)
  private async trackTask(taskId: string): Promise<void> {
    const tracked = (await this.storage.get<string[]>("tracked-tasks")) ?? [];
    if (!tracked.includes(taskId)) {
      tracked.push(taskId);
      await this.storage.set("tracked-tasks", tracked);
    }
  }

  // LRU cache management: delete and re-insert to move to end (most recent)
  private touchCache(taskId: string, value: number): void {
    this.totalCache.delete(taskId);
    this.totalCache.set(taskId, value);

    // Evict oldest entries if over limit
    while (this.totalCache.size > MAX_CACHE_SIZE) {
      const firstKey = this.totalCache.keys().next().value;
      if (firstKey === undefined) break;
      this.totalCache.delete(firstKey);
    }
  }

  // Enhanced start that also tracks
  async startTracking(taskId: string): Promise<void> {
    await this.trackTask(taskId);
    await this.start(taskId);
  }
}
