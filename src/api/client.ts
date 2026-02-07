import { requireToken, getSyncConfig } from "../config/index.ts";

const BASE_URL = "https://api.todoist.com/api/v1";

/** Remove keys with undefined values from an object before sending to the API. */
export function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}

const BASE_BACKOFF_MS = 1000;
const RATE_LIMIT_BASE_BACKOFF_MS = 5000;
const JITTER_FACTOR = 0.25;

interface PaginatedResponse<T> {
  results: T[];
  next_cursor: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Add ±25% jitter to a delay value. */
function addJitter(ms: number): number {
  const jitter = ms * JITTER_FACTOR * (2 * Math.random() - 1);
  return Math.max(0, ms + jitter);
}

/** Check if an error is a network/connectivity error worth retrying. */
function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof Error && err.message.includes("fetch failed")) return true;
  return false;
}

/** Check if an error is a timeout abort. */
function isTimeoutError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  return false;
}

export class ApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly body: string;
  readonly url: string;
  readonly retryable: boolean;

  constructor(opts: { status: number; statusText: string; body: string; url: string }) {
    super(`API error ${opts.status}: ${opts.statusText}`);
    this.name = "ApiError";
    this.status = opts.status;
    this.statusText = opts.statusText;
    this.body = opts.body;
    this.url = opts.url;
    this.retryable = opts.status >= 500 || opts.status === 429;
  }
}

export class RetryExhaustedError extends Error {
  constructor(
    public readonly url: string,
    public readonly attempts: number,
    public readonly lastError: Error,
  ) {
    super(`Request to ${url} failed after ${attempts} attempts: ${lastError.message}`);
    this.name = "RetryExhaustedError";
  }
}

class TodoistClient {
  private get authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${requireToken()}` };
  }

  private get jsonHeaders(): Record<string, string> {
    return { ...this.authHeaders, "Content-Type": "application/json" };
  }

  private get retryConfig() {
    const config = getSyncConfig();
    return { maxRetries: config.retry_count, timeoutMs: config.timeout * 1000 };
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const baseParams = { ...params };
    let url = this.buildUrl(path, baseParams);
    const res = await this.fetchWithRetry(url, { headers: this.authHeaders });
    const data = await this.handleResponse<T | PaginatedResponse<unknown>>(res);

    if (data && typeof data === "object" && "results" in data && "next_cursor" in data) {
      const paginated = data as PaginatedResponse<unknown>;
      const allResults = [...paginated.results];
      let cursor = paginated.next_cursor;
      while (cursor) {
        const nextUrl = this.buildUrl(path, { ...baseParams, cursor });
        const nextRes = await this.fetchWithRetry(nextUrl, { headers: this.authHeaders });
        const nextData = await this.handleResponse<PaginatedResponse<unknown>>(nextRes);
        allResults.push(...nextData.results);
        cursor = nextData.next_cursor;
      }
      return allResults as T;
    }
    return data as T;
  }

  async getRaw<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = this.buildUrl(path, params);
    const res = await this.fetchWithRetry(url, { headers: this.authHeaders });
    return this.handleResponse<T>(res);
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    let url = `${BASE_URL}${path}`;
    if (params) {
      const query = new URLSearchParams(params).toString();
      if (query) url += `?${query}`;
    }
    return url;
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    const res = await this.fetchWithRetry(`${BASE_URL}${path}`, {
      method: "POST",
      headers: this.jsonHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });
    return this.handleResponse<T>(res);
  }

  async patch<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    const res = await this.fetchWithRetry(`${BASE_URL}${path}`, {
      method: "PATCH",
      headers: this.jsonHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });
    return this.handleResponse<T>(res);
  }

  async postForm<T>(path: string, body: URLSearchParams, baseUrl?: string): Promise<T> {
    const url = `${baseUrl ?? BASE_URL}${path}`;
    const res = await this.fetchWithRetry(url, {
      method: "POST",
      headers: {
        ...this.authHeaders,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    return this.handleResponse<T>(res);
  }

  async del(path: string): Promise<void> {
    const res = await this.fetchWithRetry(`${BASE_URL}${path}`, {
      method: "DELETE",
      headers: this.authHeaders,
    });
    if (!res.ok) await this.throwError(res);
  }

  /**
   * Fetch with retry, exponential backoff, rate-limit handling, and timeout.
   * Retries on: network errors, timeouts, 5xx responses, and 429 rate limits.
   * Does NOT retry on 4xx errors (except 429).
   */
  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    const { maxRetries, timeoutMs } = this.retryConfig;
    let lastError: Error | undefined;
    let lastRetryAfter: number | undefined;
    let skipNextBackoff = false;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Wait before retrying (skip delay on first attempt and after 429 which has its own delay)
      if (attempt > 0 && !skipNextBackoff) {
        const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
        const delay = addJitter(backoff);
        process.stderr.write(
          `[todoist-cli] Retry ${attempt}/${maxRetries} in ${Math.round(delay)}ms...\n`,
        );
        await sleep(delay);
      }
      skipNextBackoff = false;

      // Set up per-request timeout via AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const fetchInit: RequestInit = {
        ...init,
        signal: controller.signal,
      };

      let res: Response;
      try {
        res = await fetch(url, fetchInit);
      } catch (err) {
        clearTimeout(timeoutId);

        if (isTimeoutError(err)) {
          lastError = new Error(`Request timed out after ${timeoutMs / 1000}s`);
          continue; // retry on timeout
        }

        if (isNetworkError(err)) {
          lastError = new Error(
            "Network error: unable to reach Todoist API. Check your connection.",
          );
          continue; // retry on network error
        }

        throw err; // unknown error, don't retry
      } finally {
        clearTimeout(timeoutId);
      }

      // Success — return response
      if (res.ok) {
        return res;
      }

      // 429 Rate Limit — retry with Retry-After header or rate-limit backoff
      if (res.status === 429) {
        const retryAfterHeader = res.headers.get("Retry-After");
        let waitMs: number;

        if (retryAfterHeader) {
          const retryAfterSec = parseInt(retryAfterHeader, 10);
          waitMs = (Number.isNaN(retryAfterSec) ? RATE_LIMIT_BASE_BACKOFF_MS / 1000 : retryAfterSec) * 1000;
        } else {
          waitMs = RATE_LIMIT_BASE_BACKOFF_MS * Math.pow(2, attempt);
        }

        lastRetryAfter = Math.ceil(waitMs / 1000);

        if (attempt < maxRetries) {
          const delay = addJitter(waitMs);
          process.stderr.write(
            `[todoist-cli] Rate limited (429). Retry ${attempt + 1}/${maxRetries} in ${Math.round(delay)}ms...\n`,
          );
          await sleep(delay);
          skipNextBackoff = true; // already waited with rate-limit-specific delay
          continue;
        }

        throw new Error(
          `Rate limit exceeded. Retried ${maxRetries} times. Try again in ${lastRetryAfter} seconds.`,
        );
      }

      // 5xx Server Error — retry
      if (res.status >= 500) {
        lastError = new Error(`API error ${res.status}: ${res.statusText}`);
        continue;
      }

      // 4xx Client Error (non-429) — do NOT retry, return for throwError handling
      return res;
    }

    // All retries exhausted
    throw new RetryExhaustedError(url, maxRetries + 1, lastError ?? new Error("Unknown failure"));
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) await this.throwError(res);
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  private async throwError(res: Response): Promise<never> {
    let bodyText = "";
    try {
      bodyText = await res.text();
    } catch {
      // use empty body as fallback
    }

    // Parse body for a more descriptive statusText
    let detail = res.statusText;
    if (bodyText) {
      try {
        const parsed = JSON.parse(bodyText);
        if (parsed.error) detail = parsed.error;
        else detail = bodyText;
      } catch {
        detail = bodyText;
      }
    }

    if (res.status === 401) {
      throw new ApiError({
        status: 401,
        statusText: "Authentication failed. Run `todoist auth` to set a valid API token.",
        body: bodyText,
        url: res.url,
      });
    }

    throw new ApiError({
      status: res.status,
      statusText: detail,
      body: bodyText,
      url: res.url,
    });
  }
}

export const api = new TodoistClient();
