import { Box, Text } from "ink";

interface BreadcrumbProps {
  segments: Array<{ label: string; color?: string }>;
}

export function Breadcrumb({ segments }: BreadcrumbProps) {
  return (
    <Box>
      {segments.map((seg, i) => (
        <Text key={seg.label}>
          {i > 0 && <Text color="gray"> / </Text>}
          <Text color={seg.color ?? "white"} bold={i === segments.length - 1}>{seg.label}</Text>
        </Text>
      ))}
    </Box>
  );
}
