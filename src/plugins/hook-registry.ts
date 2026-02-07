import type { HookEvent, HookContextMap, HookHandler, HookRegistry } from "./types.ts";

// Internal handler type that accepts any hook context.
// Type safety is enforced at call sites via the generic HookRegistry interface;
// internally we must erase the per-event generic to store handlers in a single Map.
type AnyHookHandler = (ctx: HookContextMap[HookEvent]) => Promise<{ message?: string } | void>;

export function createHookRegistry(): HookRegistry {
  const handlers = new Map<HookEvent, Set<AnyHookHandler>>();
  /** Track which plugin registered each handler for removeAllForPlugin */
  const handlerPluginMap = new Map<AnyHookHandler, string>();

  function on<E extends HookEvent>(event: E, handler: HookHandler<E>, pluginName?: string): void {
    if (!handlers.has(event)) handlers.set(event, new Set());
    const castHandler = handler as AnyHookHandler;
    handlers.get(event)!.add(castHandler);
    if (pluginName) {
      handlerPluginMap.set(castHandler, pluginName);
    }
  }

  function off<E extends HookEvent>(event: E, handler: HookHandler<E>): void {
    const castHandler = handler as AnyHookHandler;
    handlers.get(event)?.delete(castHandler);
    handlerPluginMap.delete(castHandler);
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

  function removeAllForPlugin(pluginName: string): void {
    for (const [_event, handlerSet] of handlers) {
      for (const handler of handlerSet) {
        if (handlerPluginMap.get(handler) === pluginName) {
          handlerSet.delete(handler);
          handlerPluginMap.delete(handler);
        }
      }
    }
  }

  return { on, off, emit, removeAllForPlugin };
}
