import type { Issue } from "../types/gitlab";
import { openUrl } from "../utils";

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
      <span className="item-title">
        <span className="item-id">#{issue.iid}</span>{" "}{issue.title}
      </span>
    </button>
  );
}
