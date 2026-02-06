import chalk from "chalk";

export const EXIT_OK = 0;
export const EXIT_USAGE = 2;
export const EXIT_AUTH = 3;
export const EXIT_NETWORK = 4;
export const EXIT_NOT_FOUND = 5;

export class CliError extends Error {
  code: number;
  suggestion?: string;
  helpUrl?: string;

  constructor(message: string, opts: { code: number; suggestion?: string; helpUrl?: string }) {
    super(message);
    this.name = "CliError";
    this.code = opts.code;
    this.suggestion = opts.suggestion;
    this.helpUrl = opts.helpUrl;
  }
}

export function wrapApiError(err: unknown): CliError {
  const message = err instanceof Error ? err.message : String(err);

  if (message.includes("Authentication failed") || message.includes("401")) {
    return new CliError("Authentication failed.", {
      code: EXIT_AUTH,
      suggestion: "Run `todoist auth` to set a valid API token.",
    });
  }

  if (message.includes("Rate limit") || message.includes("429")) {
    return new CliError("Rate limit exceeded.", {
      code: EXIT_NETWORK,
      suggestion: "Wait a moment and try again.",
    });
  }

  if (message.includes("404") || message.includes("not found")) {
    return new CliError("Resource not found.", {
      code: EXIT_NOT_FOUND,
      suggestion: "Check the ID and try again.",
    });
  }

  if (message.includes("fetch") || message.includes("ECONNREFUSED") || message.includes("ENOTFOUND")) {
    return new CliError("Network error — could not reach the Todoist API.", {
      code: EXIT_NETWORK,
      suggestion: "Check your internet connection and try again.",
    });
  }

  return new CliError(message, { code: 1 });
}

export function formatCliError(err: CliError): string {
  let out = chalk.red(`Error: ${err.message}`);
  if (err.suggestion) {
    out += `\n${chalk.yellow("Hint:")} ${err.suggestion}`;
  }
  if (err.helpUrl) {
    out += `\n${chalk.dim("More info:")} ${err.helpUrl}`;
  }
  return out;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);

  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }

  return dp[m]![n]!;
}

export function didYouMean(input: string, candidates: string[]): string | null {
  let bestMatch: string | null = null;
  let bestDist = Infinity;

  for (const c of candidates) {
    const dist = levenshtein(input.toLowerCase(), c.toLowerCase());
    if (dist < bestDist && dist <= 3) {
      bestDist = dist;
      bestMatch = c;
    }
  }

  return bestMatch;
}

export function handleError(err: unknown): never {
  const cliErr = err instanceof CliError ? err : wrapApiError(err);
  console.error(formatCliError(cliErr));
  process.exit(cliErr.code);
}
