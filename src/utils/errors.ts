import chalk from "chalk";

export const EXIT_OK = 0;
export const EXIT_USAGE = 2;
export const EXIT_AUTH = 3;
export const EXIT_NETWORK = 4;
export const EXIT_NOT_FOUND = 5;

export enum ErrorCode {
  AUTH_FAILED = "AUTH_FAILED",
  RATE_LIMITED = "RATE_LIMITED",
  NOT_FOUND = "NOT_FOUND",
  VALIDATION = "VALIDATION",
  NETWORK = "NETWORK",
  UNKNOWN = "UNKNOWN",
}

let DEBUG = false;

export function setDebug(value: boolean): void {
  DEBUG = value;
}

export function isDebug(): boolean {
  return DEBUG;
}

export function debug(...args: unknown[]): void {
  if (DEBUG) console.error("[debug]", ...args);
}

export class CliError extends Error {
  code: number;
  errorCode: ErrorCode;
  suggestion?: string;
  helpUrl?: string;

  constructor(message: string, opts: { code: number; errorCode?: ErrorCode; suggestion?: string; helpUrl?: string }) {
    super(message);
    this.name = "CliError";
    this.code = opts.code;
    this.errorCode = opts.errorCode ?? ErrorCode.UNKNOWN;
    this.suggestion = opts.suggestion;
    this.helpUrl = opts.helpUrl;
  }
}

export function wrapApiError(err: unknown): CliError {
  const message = err instanceof Error ? err.message : String(err);

  debug("wrapApiError called with:", message);

  // Check for HTTP status codes in the error message
  const statusMatch = message.match(/\b(4\d{2}|5\d{2})\b/);
  const statusCode = statusMatch ? parseInt(statusMatch[1]!, 10) : null;

  if (message.includes("Authentication failed") || message.includes("401") || message.includes("403") || statusCode === 401 || statusCode === 403) {
    return new CliError("Authentication failed. Run `todoist auth` to set your API token.", {
      code: EXIT_AUTH,
      errorCode: ErrorCode.AUTH_FAILED,
      suggestion: "Run `todoist auth` to set a valid API token.",
    });
  }

  if (message.includes("Rate limit") || message.includes("429") || statusCode === 429) {
    return new CliError("Rate limit exceeded. Please wait a moment and try again.", {
      code: EXIT_NETWORK,
      errorCode: ErrorCode.RATE_LIMITED,
      suggestion: "Wait a moment and try again. Todoist allows ~450 requests per 15 minutes.",
    });
  }

  if (message.includes("404") || message.includes("not found") || statusCode === 404) {
    return new CliError("Resource not found. The task/project may have been deleted.", {
      code: EXIT_NOT_FOUND,
      errorCode: ErrorCode.NOT_FOUND,
      suggestion: "Check the ID and try again. The resource may have been deleted or moved.",
    });
  }

  if (statusCode && statusCode >= 500) {
    return new CliError("Todoist API is experiencing issues. Try again later.", {
      code: EXIT_NETWORK,
      errorCode: ErrorCode.NETWORK,
      suggestion: "The Todoist servers are having problems. Check https://status.todoist.com for updates.",
    });
  }

  if (message.includes("fetch") || message.includes("ECONNREFUSED") || message.includes("ENOTFOUND") || message.includes("ETIMEDOUT")) {
    return new CliError("Network error — could not reach the Todoist API.", {
      code: EXIT_NETWORK,
      errorCode: ErrorCode.NETWORK,
      suggestion: "Check your internet connection and try again.",
    });
  }

  return new CliError(message, { code: 1, errorCode: ErrorCode.UNKNOWN });
}

export function formatCliError(err: CliError): string {
  let out = chalk.red(`Error: ${err.message}`);
  if (DEBUG) {
    out += `\n${chalk.dim(`[${err.errorCode}] exit code: ${err.code}`)}`;
    if (err.stack) {
      out += `\n${chalk.dim(err.stack)}`;
    }
  }
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
  debug("handleError:", cliErr.errorCode, cliErr.message);
  console.error(formatCliError(cliErr));
  process.exit(cliErr.code);
}
