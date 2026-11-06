import type { Issue } from "../types/gitlab";
import { formatTimeAgo, openUrl } from "../utils";
import { Icon } from "./Icon";

function priorityTone(labels: string[]): string {
  const lower = labels.map((l) => l.toLowerCase());
  if (lower.some((l) => l.includes("critical") || l.includes("urgent")))
    return "critical";
  if (lower.some((l) => l.includes("high"))) return "high";
  if (lower.some((l) => l.includes("medium"))) return "medium";
  return "normal";
}

interface IssueCardProps {
  issue: Issue;
}

export function IssueCard({ issue }: IssueCardProps) {
  return (
    <button
      type="button"
      className="item-card"
      onClick={() => openUrl(issue.web_url)}
    >
      <span className="item-header">
        <span className="item-icon" data-priority={priorityTone(issue.labels)}>
          <Icon name="issue" />
        </span>
        <span className="item-title" title={issue.title}>
          {issue.title}
        </span>
      </span>
      <span className="item-meta">
        <span className="item-id">#{issue.iid}</span>
        <span className="item-author">
          <Icon name="user" /> @{issue.author.username}
        </span>
        <span className="item-time">{formatTimeAgo(issue.updated_at)}</span>
        {issue.user_notes_count ? (
          <span
            className="item-comments"
            aria-label={`${issue.user_notes_count} 条评论`}
          >
            <Icon name="message" /> {issue.user_notes_count}
          </span>
        ) : null}
      </span>
      {issue.labels.length > 0 && (
        <span className="item-labels">
          {issue.labels.slice(0, 3).map((label) => (
            <span key={label} className="label-badge">
              {label}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}
