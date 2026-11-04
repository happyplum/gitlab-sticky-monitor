interface StatusBadgeProps {
  status: string;
  count?: number;
}

export function StatusBadge({ status, count }: StatusBadgeProps) {
  const statusMap: Record<string, { color: string; label: string }> = {
    opened: { color: "#22C55E", label: "Open" },
    closed: { color: "#EF4444", label: "Closed" },
    merged: { color: "#8B5CF6", label: "Merged" },
    success: { color: "#10B981", label: "Passed" },
    failed: { color: "#EF4444", label: "Failed" },
    running: { color: "#F59E0B", label: "Running" },
    pending: { color: "#9CA3AF", label: "Pending" },
  };

  const info = statusMap[status] || { color: "#6B7280", label: status };

  return (
    <span
      className="status-badge"
      style={{ backgroundColor: info.color + "20", color: info.color }}
    >
      {info.label}
      {count !== undefined && ` (${count})`}
    </span>
  );
}
