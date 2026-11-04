export interface GitLabUser {
  id: number;
  username: string;
  name: string;
  avatar_url: string | null;
  web_url: string;
}

export interface Issue {
  id: number;
  iid: number;
  title: string;
  description: string | null;
  state: string;
  web_url: string;
  created_at: string;
  updated_at: string;
  labels: string[];
  author: GitLabUser;
  assignees: GitLabUser[];
  user_notes_count: number | null;
  upvotes: number | null;
  downvotes: number | null;
}

export interface PipelineInfo {
  id: number;
  status: string;
  web_url: string;
}

export interface MergeRequest {
  id: number;
  iid: number;
  title: string;
  description: string | null;
  state: string;
  web_url: string;
  source_branch: string;
  target_branch: string;
  created_at: string;
  updated_at: string;
  labels: string[];
  author: GitLabUser;
  assignees: GitLabUser[];
  reviewers: GitLabUser[];
  draft: boolean | null;
  user_notes_count: number | null;
  head_pipeline: PipelineInfo | null;
  merge_status: string | null;
}

export interface Todo {
  id: number;
  action_name: string;
  target_type: string;
  target_url: string;
  body: string;
  state: string;
  created_at: string;
  author: GitLabUser;
  project: {
    id: number;
    name: string;
    path_with_namespace: string;
  };
}

export interface Project {
  id: number;
  name: string;
  path_with_namespace: string;
  web_url: string;
  description: string | null;
  avatar_url: string | null;
}

export interface WatchedRepo {
  project_id: number;
  name: string;
  path: string;
  web_url: string;
}

export interface NoteConfig {
  id: string;
  repo_id: number;
  repo_name: string;
  color: string;
  position: { x: number; y: number };
  size: { w: number; h: number };
  always_on_top: boolean;
  filters: {
    show_issues: boolean;
    show_mrs: boolean;
    only_assigned_to_me: boolean;
    labels: string[];
  };
}

export interface GitLabUpdate {
  repo_id: string;
  repo_name: string;
  issues: Issue[];
  merge_requests: MergeRequest[];
  my_todos: Todo[];
  timestamp: string;
}

export interface SettingsResponse {
  base_url: string;
  has_token: boolean;
  polling_interval_secs: number;
}
