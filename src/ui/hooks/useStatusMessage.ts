import { useState, useEffect } from "react";

interface UseStatusMessageOptions {
  initialMessage?: string;
  autoClearMs?: number;
  onInitialClear?: () => void;
}

export function useStatusMessage({
  initialMessage,
  autoClearMs = 3000,
  onInitialClear,
}: UseStatusMessageOptions = {}) {
  const [message, setMessage] = useState("");

  // Pick up initial status from parent (e.g. after detail view action)
  useEffect(() => {
    if (initialMessage) {
      setMessage(initialMessage);
      onInitialClear?.();
    }
  }, [initialMessage, onInitialClear]);

  // Auto-clear status message
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), autoClearMs);
    return () => clearTimeout(timer);
  }, [message, autoClearMs]);

  return { message, show: setMessage, clear: () => setMessage("") };
}
