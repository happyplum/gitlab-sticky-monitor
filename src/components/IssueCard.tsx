import type { Issue } from "../types/gitlab";
import { openUrl } from "../utils";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function priorityIcon(labels: string[]): string {
  const lower = labels.map((l) => l.toLowerCase());
  if (lower.some((l) => l.includes("critical") || l.includes("urgent")))
    return "🔴";
  if (lower.some((l) => l.includes("high"))) return "🟠";
  if (lower.some((l) => l.includes("medium"))) return "🟡";
  return "🔵";
}

interface IssueCardProps {
  issue: Issue;
}

export function IssueCard({ issue }: IssueCardProps) {
  return (
    <div className="item-card" onClick={() => openUrl(issue.web_url)}>
      <div className="item-header">
        <span className="item-icon">{priorityIcon(issue.labels)}</span>
        <span className="item-id">#{issue.iid}</span>
        <span className="item-title" title={issue.title}>
          {issue.title}
        </span>
      </div>
      <div className="item-meta">
        <span className="item-author">👤 @{issue.author.username}</span>
        <span className="item-time">{timeAgo(issue.updated_at)}</span>
        {issue.user_notes_count ? (
          <span className="item-comments">💬 {issue.user_notes_count}</span>
        ) : null}
      </div>
      {issue.labels.length > 0 && (
        <div className="item-labels">
          {issue.labels.slice(0, 3).map((label) => (
            <span key={label} className="label-badge">
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
