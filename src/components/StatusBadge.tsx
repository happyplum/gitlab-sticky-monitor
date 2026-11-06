interface StatusBadgeProps {
  status: string;
  count?: number;
}

export function StatusBadge({ status, count }: StatusBadgeProps) {
  const statusMap: Record<string, string> = {
    opened: "开放",
    closed: "关闭",
    merged: "已合并",
    success: "CI 通过",
    failed: "CI 失败",
    running: "CI 运行中",
    pending: "CI 等待中",
    canceled: "CI 已取消",
    unavailable: "暂无流水线",
  };

  return (
    <span className="status-badge" data-status={status}>
      {statusMap[status] || status}
      {count !== undefined && ` (${count})`}
    </span>
  );
}
