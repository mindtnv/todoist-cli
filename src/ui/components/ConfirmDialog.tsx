import { Box, Text, useInput } from "ink";

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  useInput((input, key) => {
    if (input === "y" || input === "Y") {
      onConfirm();
    } else if (input === "n" || input === "N" || key.escape || key.return) {
      onCancel();
    }
  });

  return (
    <Box borderStyle="single" borderColor="red" paddingX={1}>
      <Text>
        <Text color="red" bold>⚠ {message}</Text>
        <Text dimColor> [y/</Text>
        <Text bold>N</Text>
        <Text dimColor>]</Text>
      </Text>
    </Box>
  );
}
