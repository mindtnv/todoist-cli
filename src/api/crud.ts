import { api, stripUndefined, type TodoistClient } from "./client.ts";

export interface CrudModule<T, C, U> {
  getAll(params?: Record<string, string>): Promise<T[]>;
  getOne(id: string): Promise<T>;
  create(body: C): Promise<T>;
  update(id: string, body: U): Promise<T>;
  remove(id: string): Promise<void>;
}

export function createCrudModule<T, C, U>(basePath: string, client: TodoistClient = api): CrudModule<T, C, U> {
  return {
    getAll(params?: Record<string, string>) {
      return client.get<T[]>(basePath, params);
    },
    getOne(id: string) {
      return client.get<T>(`${basePath}/${id}`);
    },
    create(body: C) {
      return client.post<T>(basePath, stripUndefined(body as unknown as Record<string, unknown>));
    },
    update(id: string, body: U) {
      return client.patch<T>(`${basePath}/${id}`, stripUndefined(body as Record<string, unknown>));
    },
    remove(id: string) {
      return client.del(`${basePath}/${id}`);
    },
  };
}
