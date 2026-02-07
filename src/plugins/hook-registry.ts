import type { HookEvent, HookContextMap, HookHandler, HookRegistry, EmitResult } from "./types.ts";
import { getLogger } from "../utils/logger.ts";

const log = getLogger("hooks");

// Internal handler type that accepts any hook context.
// Type safety is enforced at call sites via the generic HookRegistry interface;
// internally we must erase the per-event generic to store handlers in a single Map.
type AnyHookHandler = (ctx: HookContextMap[HookEvent]) => Promise<{ message?: string; params?: Record<string, unknown>; cancel?: boolean; reason?: string } | void>;

/** Returns true if the event name represents a "before" hook (ends with "ing"). */
function isBeforeHook(event: string): boolean {
  // Match task.creating, task.completing, task.updating, task.deleting,
  // project.creating, label.updating, comment.deleting, app.unloading, etc.
  return event.endsWith("ing");
}

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

  async function emit<E extends HookEvent>(event: E, ctx: HookContextMap[E]): Promise<EmitResult> {
    const messages: string[] = [];
    const eventHandlers = handlers.get(event);
    if (!eventHandlers) return { messages };

    const isBefore = isBeforeHook(event);

    // For "before" hooks, use a mutable copy of the context so handlers
    // can progressively modify params (waterfall pattern).
    let currentCtx: HookContextMap[E] = isBefore ? { ...ctx } : ctx;

    for (const handler of eventHandlers) {
      try {
        const result = await handler(currentCtx);
        if (result?.message) messages.push(result.message);

        if (isBefore && result) {
          // Cancellation: stop processing and return immediately
          if (result.cancel) {
            return {
              messages,
              cancelled: true,
              reason: result.reason,
              params: (currentCtx as unknown as Record<string, unknown>).params as Record<string, unknown> | undefined,
            };
          }

          // Waterfall: merge returned params into the context for the next handler
          if (result.params && "params" in currentCtx) {
            const merged = { ...(currentCtx as unknown as Record<string, unknown>).params as Record<string, unknown>, ...result.params };
            currentCtx = { ...currentCtx, params: merged } as HookContextMap[E];
          }
        }
      } catch (err) {
        log.error(`Error in ${event} handler`, err);
      }
    }

    // Return the potentially-modified params from the waterfall
    const emitResult: EmitResult = { messages };
    if (isBefore && "params" in currentCtx) {
      emitResult.params = (currentCtx as unknown as Record<string, unknown>).params as Record<string, unknown>;
    }
    return emitResult;
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
