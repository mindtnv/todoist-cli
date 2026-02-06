import chalk from "chalk";
import type { Priority } from "../api/types.ts";

export const ID_WIDTH = 18;
export const PRI_WIDTH = 6;
export const LABEL_WIDTH = 10;

export function getContentWidth(): number {
  const cols = process.stdout.columns || 80;
  // Fixed columns: ID + Pri + Due + Labels + 4 spaces between columns
  const fixed = ID_WIDTH + 1 + PRI_WIDTH + 1 + 1 + LABEL_WIDTH;
  const remaining = cols - fixed;
  // Split remaining between content and due (roughly 3:1)
  return Math.max(20, Math.floor(remaining * 0.7));
}

export function getDueWidth(): number {
  const cols = process.stdout.columns || 80;
  const fixed = ID_WIDTH + 1 + PRI_WIDTH + 1 + 1 + LABEL_WIDTH;
  const remaining = cols - fixed;
  const contentWidth = Math.max(20, Math.floor(remaining * 0.7));
  return Math.max(10, remaining - contentWidth);
}

export function padEnd(str: string, len: number): string {
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, "");
  const pad = Math.max(0, len - stripped.length);
  return str + " ".repeat(pad);
}

export function priorityColor(p: Priority): (text: string) => string {
  switch (p) {
    case 1: return chalk.white;
    case 2: return chalk.blue;
    case 3: return chalk.yellow;
    case 4: return chalk.red;
  }
}

export function priorityLabel(p: Priority): string {
  return priorityColor(p)(`p${p}`);
}

export function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen - 1) + "..." : str;
}
