import { useState, useCallback } from "react";
import type { Key } from "ink";

export interface FormField {
  value: string;
  setValue: (v: string) => void;
  cursor: number;
  setCursor: (c: number) => void;
  handleInput: (input: string, key: Key) => void;
}

export function useFormField(initial: string): FormField {
  const [value, setValue] = useState(initial);
  const [cursor, setCursor] = useState(initial.length);

  const handleInput = useCallback(
    (input: string, key: Key) => {
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
      if (input && !key.ctrl && !key.meta) {
        setValue((v) => v.slice(0, cursor) + input + v.slice(cursor));
        setCursor((c) => c + input.length);
      }
    },
    [value, cursor],
  );

  return { value, setValue, cursor, setCursor, handleInput };
}
