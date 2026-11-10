import type { MergeRequest } from "../types/gitlab";
import { openUrl } from "../utils";

interface MergeRequestCardProps {
  mr: MergeRequest;
}

export function MergeRequestCard({ mr }: MergeRequestCardProps) {
  return (
    <button
      type="button"
      className="item-card"
      onClick={() => openUrl(mr.web_url)}
    >
      <span className="item-title">
        <span className="item-id">!{mr.iid}</span>{" "}
        {mr.draft && !/^Draft:/i.test(mr.title) ? "草稿 · " : ""}{mr.title}
      </span>
    </button>
  );
}
