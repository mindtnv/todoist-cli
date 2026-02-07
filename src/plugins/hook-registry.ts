import type { HookEvent, HookRegistry } from "./types.ts";

// Internal handler type — the generic on/off/emit signatures ensure type safety at call sites
type AnyHookHandler = (ctx: never) => Promise<{ message?: string } | void>;

export function createHookRegistry(): HookRegistry {
  const handlers = new Map<HookEvent, Set<AnyHookHandler>>();

  function on(event: HookEvent, handler: AnyHookHandler) {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event)!.add(handler);
  }

  function off(event: HookEvent, handler: AnyHookHandler) {
    handlers.get(event)?.delete(handler);
  }

  async function emit(event: HookEvent, ctx: unknown): Promise<string[]> {
    const messages: string[] = [];
    const eventHandlers = handlers.get(event);
    if (!eventHandlers) return messages;

    for (const handler of eventHandlers) {
      try {
        const result = await (handler as (ctx: unknown) => Promise<{ message?: string } | void>)(ctx);
        if (result?.message) messages.push(result.message);
      } catch (err) {
        console.error(`[plugin-hook] Error in ${event} handler:`, err);
      }
    }
    return messages;
  }

  // Type safety is enforced at call sites via generic HookRegistry interface
  return { on, off, emit } as unknown as HookRegistry;
}
