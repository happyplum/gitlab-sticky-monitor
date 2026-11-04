use crate::gitlab::client::GitLabClient;
use crate::gitlab::types::*;
use super::{get_client, get_config};
use crate::storage;

#[tauri::command]
pub async fn test_connection(base_url: String, token: String) -> Result<GitLabUser, String> {
    let client = GitLabClient::new(&base_url, &token);
    let user = client.test_connection().await?;

    // Save config and update shared client
    {
        let mut cfg = get_config().write().await;
        cfg.gitlab.base_url = base_url.clone();
        cfg.gitlab.token = token.clone();
        storage::save_config(&cfg)?;
    }
    {
        let mut c = get_client().write().await;
        *c = Some(client);
    }

    Ok(user)
}

#[tauri::command]
pub async fn get_current_user() -> Result<GitLabUser, String> {
    let client_guard = get_client().read().await;
    let client = client_guard.as_ref().ok_or("GitLab not configured")?;
    client.test_connection().await
}

#[tauri::command]
pub async fn get_projects(query: String) -> Result<Vec<Project>, String> {
    let client_guard = get_client().read().await;
    let client = client_guard.as_ref().ok_or("GitLab not configured")?;
    client.search_projects(&query).await
}

#[tauri::command]
pub async fn get_issues(
    project_id: u64,
    state: Option<String>,
    assignee: Option<String>,
    labels: Option<String>,
) -> Result<Vec<Issue>, String> {
    let client_guard = get_client().read().await;
    let client = client_guard.as_ref().ok_or("GitLab not configured")?;
    client
        .get_issues(
            project_id,
            state.as_deref(),
            assignee.as_deref(),
            labels.as_deref(),
        )
        .await
}

#[tauri::command]
pub async fn get_merge_requests(
    project_id: u64,
    state: Option<String>,
    reviewer: Option<String>,
) -> Result<Vec<MergeRequest>, String> {
    let client_guard = get_client().read().await;
    let client = client_guard.as_ref().ok_or("GitLab not configured")?;
    client
        .get_merge_requests(project_id, state.as_deref(), reviewer.as_deref())
        .await
}

#[tauri::command]
pub async fn get_todos(project_id: Option<u64>) -> Result<Vec<Todo>, String> {
    let client_guard = get_client().read().await;
    let client = client_guard.as_ref().ok_or("GitLab not configured")?;
    client.get_todos(project_id).await
}

#[tauri::command]
pub async fn add_comment(
    project_id: u64,
    target_type: String,
    target_iid: u64,
    body: String,
) -> Result<NoteComment, String> {
    let client_guard = get_client().read().await;
    let client = client_guard.as_ref().ok_or("GitLab not configured")?;
    client
        .add_note(project_id, &target_type, target_iid, &body)
        .await
}
