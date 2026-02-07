export const SIDEBAR_MIN_WIDTH = 24;
export const SIDEBAR_MAX_WIDTH = 38;
export const SIDEBAR_WIDTH_RATIO = 0.25;
export const MIN_VIEW_HEIGHT = 5;
export const DEFAULT_TERMINAL_ROWS = 24;
export const DEFAULT_TERMINAL_COLS = 80;

export function computeSidebarWidth(termWidth: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.floor(termWidth * SIDEBAR_WIDTH_RATIO)));
}
