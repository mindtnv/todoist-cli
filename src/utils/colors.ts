/** Maps Todoist API color names to terminal-compatible color strings. */
export const todoistColorMap: Record<string, string> = {
  berry_red: "red",
  red: "red",
  orange: "yellow",
  yellow: "yellow",
  olive_green: "green",
  lime_green: "green",
  green: "green",
  mint_green: "green",
  teal: "cyan",
  sky_blue: "cyan",
  light_blue: "blue",
  blue: "blue",
  grape: "magenta",
  violet: "magenta",
  lavender: "magenta",
  magenta: "magenta",
  salmon: "red",
  charcoal: "gray",
  grey: "gray",
  taupe: "gray",
};

export function mapTodoistColor(color: string): string {
  return todoistColorMap[color] ?? "cyan";
}
