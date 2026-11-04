import type { MergeRequest } from "../types/gitlab";
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

function pipelineIcon(mr: MergeRequest): string {
  if (!mr.head_pipeline) return "⚪";
  switch (mr.head_pipeline.status) {
    case "success":
      return "✅";
    case "failed":
      return "❌";
    case "running":
      return "⏳";
    case "pending":
      return "🟡";
    case "canceled":
      return "⛔";
    default:
      return "⚪";
  }
}

function statusColor(mr: MergeRequest): string {
  if (mr.draft) return "#9CA3AF";
  if (mr.head_pipeline?.status === "success") return "#10B981";
  if (mr.head_pipeline?.status === "failed") return "#EF4444";
  return "#3B82F6";
}

interface MergeRequestCardProps {
  mr: MergeRequest;
}

export function MergeRequestCard({ mr }: MergeRequestCardProps) {
  return (
    <div
      className="item-card"
      onClick={() => openUrl(mr.web_url)}
      style={{ borderLeftColor: statusColor(mr) }}
    >
      <div className="item-header">
        <span className="item-icon">{pipelineIcon(mr)}</span>
        <span className="item-id">!{mr.iid}</span>
        <span className="item-title" title={mr.title}>
          {mr.draft ? <em>[Draft] </em> : null}
          {mr.title}
        </span>
      </div>
      <div className="item-meta">
        <span className="item-author">👤 @{mr.author.username}</span>
        <span className="item-time">{timeAgo(mr.updated_at)}</span>
        <span className="item-branch" title={`${mr.source_branch} → ${mr.target_branch}`}>
          🔀 {mr.source_branch.length > 15 ? mr.source_branch.slice(0, 15) + '…' : mr.source_branch}
        </span>
      </div>
      {mr.reviewers.length > 0 && (
        <div className="item-reviewers">
          👁 {mr.reviewers.map((r) => `@${r.username}`).join(", ")}
        </div>
      )}
    </div>
  );
}
