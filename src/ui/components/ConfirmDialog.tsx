import { Box, Text, useInput } from "ink";

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  useInput((input, key) => {
    if (input === "y" || input === "Y" || key.return) {
      onConfirm();
    } else if (input === "n" || input === "N" || key.escape) {
      onCancel();
    }
  });

  return (
    <Box borderStyle="single" borderColor="red" paddingX={1}>
      <Text>
        <Text color="red">{message}</Text>
        <Text> [y/n]</Text>
      </Text>
    </Box>
  );
}
