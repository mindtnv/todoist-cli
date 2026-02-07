import React from "react";
import { Box, Text, useInput } from "ink";

interface ViewShellProps {
  title: string;
  onBack: () => void;
  footer?: React.ReactNode;
  loading?: boolean;
  error?: string | null;
  children: React.ReactNode;
  /** Set to false to disable built-in Esc/q key handling (for views with custom key handlers). Defaults to true. */
  handleKeys?: boolean;
}

export function ViewShell({ title, onBack, footer, loading, error, children, handleKeys = true }: ViewShellProps) {
  useInput((input, key) => {
    if (!handleKeys) return;
    if (key.escape || input === "q") {
      onBack();
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" width="100%" height="100%">
        <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="cyan" paddingX={2} paddingY={1}>
          <Text bold color="cyan">{title}</Text>
          <Box marginTop={1}>
            <Text color="gray">Loading...</Text>
          </Box>
        </Box>
        <Box borderStyle="single" borderColor="gray" paddingX={1}>
          <Text color="gray">[Esc]</Text><Text> back</Text>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" width="100%" height="100%">
        <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="cyan" paddingX={2} paddingY={1}>
          <Text bold color="cyan">{title}</Text>
          <Box marginTop={1}>
            <Text color="red">Error: {error}</Text>
          </Box>
        </Box>
        <Box borderStyle="single" borderColor="gray" paddingX={1}>
          <Text color="gray">[Esc]</Text><Text> back</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="cyan" paddingX={2} paddingY={1}>
        {children}
      </Box>
      {footer !== undefined ? footer : (
        <Box borderStyle="single" borderColor="gray" paddingX={1}>
          <Text color="gray">[Esc]</Text><Text> back</Text>
        </Box>
      )}
    </Box>
  );
}
