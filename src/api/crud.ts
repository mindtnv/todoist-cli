import { api, stripUndefined } from "./client.ts";

export interface CrudModule<T, C, U> {
  getAll(params?: Record<string, string>): Promise<T[]>;
  getOne(id: string): Promise<T>;
  create(body: C): Promise<T>;
  update(id: string, body: U): Promise<T>;
  remove(id: string): Promise<void>;
}

export function createCrudModule<T, C, U>(basePath: string): CrudModule<T, C, U> {
  return {
    getAll(params?: Record<string, string>) {
      return api.get<T[]>(basePath, params);
    },
    getOne(id: string) {
      return api.get<T>(`${basePath}/${id}`);
    },
    create(body: C) {
      return api.post<T>(basePath, stripUndefined(body as unknown as Record<string, unknown>));
    },
    update(id: string, body: U) {
      return api.patch<T>(`${basePath}/${id}`, stripUndefined(body as Record<string, unknown>));
    },
    remove(id: string) {
      return api.del(`${basePath}/${id}`);
    },
  };
}
