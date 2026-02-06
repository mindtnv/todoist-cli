import { requireToken } from "../config/index.ts";

const BASE_URL = "https://api.todoist.com/api/v1";

interface PaginatedResponse<T> {
  results: T[];
  next_cursor: string | null;
}

class TodoistClient {
  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${requireToken()}`,
      "Content-Type": "application/json",
    };
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    let url = `${BASE_URL}${path}`;
    if (params) {
      const query = new URLSearchParams(params).toString();
      if (query) url += `?${query}`;
    }
    const res = await this.safeFetch(url, { headers: this.headers });
    const data = await this.handleResponse<T | PaginatedResponse<unknown>>(res);
    if (data && typeof data === "object" && "results" in data && "next_cursor" in data) {
      return (data as PaginatedResponse<unknown>).results as T;
    }
    return data as T;
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    const res = await this.safeFetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    return this.handleResponse<T>(res);
  }

  async del(path: string): Promise<void> {
    const res = await this.safeFetch(`${BASE_URL}${path}`, {
      method: "DELETE",
      headers: this.headers,
    });
    if (!res.ok) await this.throwError(res);
    await res.text();
  }

  private async safeFetch(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (err) {
      if (err instanceof TypeError) {
        throw new Error(
          "Network error: could not reach Todoist API. Check your internet connection and try again.",
        );
      }
      throw err;
    }
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) await this.throwError(res);
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  private async throwError(res: Response): Promise<never> {
    if (res.status === 401) {
      throw new Error("Authentication failed. Run `todoist auth` to set a valid API token.");
    }
    if (res.status === 429) {
      throw new Error("Rate limit exceeded. Please wait and try again.");
    }
    let detail = res.statusText;
    try {
      const body = await res.text();
      if (body) {
        try {
          const parsed = JSON.parse(body);
          if (parsed.error) detail = parsed.error;
          else detail = body;
        } catch {
          detail = body;
        }
      }
    } catch {
      // use statusText as fallback
    }
    throw new Error(`API error ${res.status}: ${detail}`);
  }
}

export const api = new TodoistClient();
