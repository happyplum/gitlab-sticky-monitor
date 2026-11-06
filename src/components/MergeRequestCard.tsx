import type { MergeRequest } from "../types/gitlab";
import { formatTimeAgo, openUrl } from "../utils";
import { Icon } from "./Icon";
import { StatusBadge } from "./StatusBadge";

function statusTone(mr: MergeRequest): string {
  if (mr.draft) return "draft";
  if (mr.head_pipeline?.status === "success") return "success";
  if (mr.head_pipeline?.status === "failed") return "failed";
  return "opened";
}

interface MergeRequestCardProps {
  mr: MergeRequest;
}

export function MergeRequestCard({ mr }: MergeRequestCardProps) {
  return (
    <button
      type="button"
      className="item-card"
      onClick={() => openUrl(mr.web_url)}
      data-state={statusTone(mr)}
    >
      <span className="item-header">
        <span className="item-icon">
          <Icon name="merge" />
        </span>
        <span className="item-title" title={mr.title}>
          {mr.draft ? <span className="label-badge">草稿</span> : null}{" "}
          {mr.title}
        </span>
      </span>
      <span className="item-meta">
        <span className="item-id">!{mr.iid}</span>
        <span className="item-author">
          <Icon name="user" /> @{mr.author.username}
        </span>
        <span className="item-time">{formatTimeAgo(mr.updated_at)}</span>
      </span>
      <span className="item-meta">
        <StatusBadge status={mr.head_pipeline?.status ?? "unavailable"} />
        <span
          className="item-branch"
          title={`${mr.source_branch} → ${mr.target_branch}`}
        >
          <Icon name="branch" />
          <span>{mr.source_branch}</span>
        </span>
      </span>
      {mr.reviewers.length > 0 && (
        <span className="item-reviewers">
          <Icon name="eye" />
          <span>{mr.reviewers.map((r) => `@${r.username}`).join(", ")}</span>
        </span>
      )}
    </button>
  );
}
