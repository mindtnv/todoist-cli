import type { HookEvent, HookContextMap, HookHandler, HookRegistry } from "./types.ts";

// Internal handler type that accepts any hook context.
// Type safety is enforced at call sites via the generic HookRegistry interface;
// internally we must erase the per-event generic to store handlers in a single Map.
type AnyHookHandler = (ctx: HookContextMap[HookEvent]) => Promise<{ message?: string } | void>;

export function createHookRegistry(): HookRegistry {
  const handlers = new Map<HookEvent, Set<AnyHookHandler>>();

  function on<E extends HookEvent>(event: E, handler: HookHandler<E>): void {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event)!.add(handler as AnyHookHandler);
  }

  function off<E extends HookEvent>(event: E, handler: HookHandler<E>): void {
    handlers.get(event)?.delete(handler as AnyHookHandler);
  }

  async function emit<E extends HookEvent>(event: E, ctx: HookContextMap[E]): Promise<string[]> {
    const messages: string[] = [];
    const eventHandlers = handlers.get(event);
    if (!eventHandlers) return messages;

    for (const handler of eventHandlers) {
      try {
        const result = await handler(ctx);
        if (result?.message) messages.push(result.message);
      } catch (err) {
        console.error(`[plugin-hook] Error in ${event} handler:`, err);
      }
    }
    return messages;
  }

  return { on, off, emit };
}
