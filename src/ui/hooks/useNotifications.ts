import { useState, useCallback, useRef, useEffect } from "react";

export interface Notification {
  id: number;
  message: string;
  level: "info" | "success" | "warning" | "error";
  persistent?: boolean;
}

interface NotifyOptions {
  level?: "info" | "success" | "warning" | "error";
  duration?: number;
  persistent?: boolean;
}

export function useNotifications(maxVisible = 3) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const nextId = useRef(1);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    for (const timer of timersRef.current.values()) {
      clearTimeout(timer);
    }
    timersRef.current.clear();
    setNotifications([]);
  }, []);

  const notify = useCallback(
    (message: string, opts?: NotifyOptions) => {
      const id = nextId.current++;
      const level = opts?.level ?? "info";
      const persistent = opts?.persistent ?? false;
      const duration = opts?.duration ?? 3000;

      const notification: Notification = { id, message, level, persistent };

      setNotifications((prev) => {
        const next = [...prev, notification];
        // Remove oldest non-persistent notifications when exceeding maxVisible
        while (next.length > maxVisible) {
          const oldestIdx = next.findIndex((n) => !n.persistent);
          if (oldestIdx === -1) break; // all persistent, can't evict
          const evicted = next[oldestIdx]!;
          const timer = timersRef.current.get(evicted.id);
          if (timer) {
            clearTimeout(timer);
            timersRef.current.delete(evicted.id);
          }
          next.splice(oldestIdx, 1);
        }
        return next;
      });

      if (!persistent) {
        const timer = setTimeout(() => {
          timersRef.current.delete(id);
          setNotifications((prev) => prev.filter((n) => n.id !== id));
        }, duration);
        timersRef.current.set(id, timer);
      }

      return id;
    },
    [maxVisible],
  );

  return { notifications, notify, dismiss, dismissAll };
}
