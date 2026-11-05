use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitLabUser {
    pub id: u64,
    pub username: String,
    pub name: String,
    pub avatar_url: Option<String>,
    pub web_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Issue {
    pub id: u64,
    pub iid: u64,
    pub title: String,
    pub description: Option<String>,
    pub state: String,
    pub web_url: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub labels: Vec<String>,
    pub author: GitLabUser,
    pub assignees: Vec<GitLabUser>,
    pub user_notes_count: Option<u32>,
    pub upvotes: Option<u32>,
    pub downvotes: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineInfo {
    pub id: u64,
    pub status: String,
    pub web_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeRequest {
    pub id: u64,
    pub iid: u64,
    pub title: String,
    pub description: Option<String>,
    pub state: String,
    pub web_url: String,
    pub source_branch: String,
    pub target_branch: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub labels: Vec<String>,
    pub author: GitLabUser,
    pub assignees: Vec<GitLabUser>,
    pub reviewers: Vec<GitLabUser>,
    pub draft: Option<bool>,
    pub user_notes_count: Option<u32>,
    pub head_pipeline: Option<PipelineInfo>,
    pub merge_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Todo {
    pub id: u64,
    pub action_name: String,
    pub target_type: String,
    pub target_url: String,
    pub body: String,
    pub state: String,
    pub created_at: DateTime<Utc>,
    pub author: GitLabUser,
    pub project: TodoProject,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TodoProject {
    pub id: u64,
    pub name: String,
    pub path_with_namespace: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: u64,
    pub name: String,
    pub path_with_namespace: String,
    pub web_url: String,
    pub description: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteComment {
    pub id: u64,
    pub body: String,
    pub author: GitLabUser,
    pub created_at: DateTime<Utc>,
}

/// Data payload emitted to frontend via Tauri events
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitLabUpdate {
    #[serde(default)]
    pub source_id: String,
    pub repo_id: String,
    pub repo_name: String,
    pub issues: Vec<Issue>,
    pub merge_requests: Vec<MergeRequest>,
    pub my_todos: Vec<Todo>,
    pub timestamp: DateTime<Utc>,
}
