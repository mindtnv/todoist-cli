import { useState, useEffect, useRef } from "react";
import { Box, Text, useInput } from "ink";
import React from "react";

interface InputPromptProps {
  prompt: string;
  defaultValue?: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  onCtrlE?: () => void;
  onPreview?: (value: string) => React.ReactNode;
  footer?: React.ReactNode;
}

export function InputPrompt({ prompt, defaultValue = "", placeholder, onSubmit, onCancel, onCtrlE, onPreview, footer }: InputPromptProps) {
  const [value, setValue] = useState(defaultValue);
  const [cursor, setCursor] = useState(defaultValue.length);
  const [flash, setFlash] = useState("");
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.ctrl && input === "e" && onCtrlE) {
      onCtrlE();
      return;
    }
    if (key.return) {
      if (value.trim()) {
        onSubmit(value.trim());
        setValue("");
        setCursor(0);
        setFlash("Created!");
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlash(""), 1500);
      }
      return;
    }
    if (key.backspace || key.delete) {
      if (cursor > 0) {
        setValue((v) => v.slice(0, cursor - 1) + v.slice(cursor));
        setCursor((c) => c - 1);
      }
      return;
    }
    if (key.leftArrow) {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.rightArrow) {
      setCursor((c) => Math.min(value.length, c + 1));
      return;
    }
    // Home / Ctrl-A: move cursor to start
    if ((key.ctrl && input === "a") || (key.meta && key.leftArrow)) {
      setCursor(0);
      return;
    }
    // End / Ctrl-E (when no onCtrlE): move cursor to end
    if ((key.ctrl && input === "e" && !onCtrlE) || (key.meta && key.rightArrow)) {
      setCursor(value.length);
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      setValue((v) => v.slice(0, cursor) + input + v.slice(cursor));
      setCursor((c) => c + input.length);
    }
  });

  const before = value.slice(0, cursor);
  const cursorChar = value[cursor] ?? " ";
  const after = value.slice(cursor + 1);

  const showPlaceholder = !value && placeholder;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="yellow" paddingX={1}>
      <Box>
        <Text>
          <Text color="yellow">{prompt}: </Text>
          {flash ? <Text color="green" bold>{flash} </Text> : null}
          {showPlaceholder ? (
            <Text dimColor>{placeholder}</Text>
          ) : (
            <>
              <Text>{before}</Text>
              <Text backgroundColor="white" color="black">{cursorChar}</Text>
              <Text>{after}</Text>
            </>
          )}
        </Text>
      </Box>
      {onPreview && value.trim() && (
        <Box flexDirection="column" marginTop={1}>
          {onPreview(value)}
        </Box>
      )}
      {footer && (
        <Box marginTop={onPreview && value.trim() ? 0 : 1}>
          {footer}
        </Box>
      )}
    </Box>
  );
}
