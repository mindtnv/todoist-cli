import { Box, Text } from "ink";
import type { Notification } from "../hooks/useNotifications.ts";

const LEVEL_COLORS: Record<Notification["level"], string> = {
  info: "cyan",
  success: "green",
  warning: "yellow",
  error: "red",
};

interface NotificationStackProps {
  notifications: Notification[];
}

export function NotificationStack({ notifications }: NotificationStackProps) {
  if (notifications.length === 0) return null;

  return (
    <Box flexDirection="column">
      {notifications.map((n) => (
        <Text key={n.id} color={LEVEL_COLORS[n.level]}>
          {n.persistent ? "\u2022 " : ""}{n.message}
        </Text>
      ))}
    </Box>
  );
}
