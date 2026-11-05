use crate::gitlab::client::GitLabClient;
use crate::gitlab::types::*;

async fn resolve_client(source_id: Option<&str>) -> Result<GitLabClient, String> {
    let clients = super::get_clients().read().await;
    if let Some(id) = source_id {
        if !id.is_empty() {
            if let Some(client) = clients.get(id) {
                return Ok(client.clone());
            }
        }
    }
    // Fallback to the first available client
    if let Some((_, client)) = clients.iter().next() {
        return Ok(client.clone());
    }
    Err("未配置或未找到对应的 GitLab 源，请先在设置中配置有效源".to_string())
}

#[tauri::command]
pub async fn test_connection(base_url: String, token: String) -> Result<GitLabUser, String> {
    let client = GitLabClient::new(&base_url, &token);
    client.test_connection().await
}

#[tauri::command]
pub async fn get_current_user(source_id: Option<String>) -> Result<GitLabUser, String> {
    let client = resolve_client(source_id.as_deref()).await?;
    client.test_connection().await
}

#[tauri::command]
pub async fn get_projects(source_id: Option<String>, query: String) -> Result<Vec<Project>, String> {
    let client = resolve_client(source_id.as_deref()).await?;
    client.search_projects(&query).await
}

#[tauri::command]
pub async fn get_issues(
    source_id: Option<String>,
    project_id: u64,
    state: Option<String>,
    assignee: Option<String>,
    labels: Option<String>,
) -> Result<Vec<Issue>, String> {
    let client = resolve_client(source_id.as_deref()).await?;
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
    source_id: Option<String>,
    project_id: u64,
    state: Option<String>,
    reviewer: Option<String>,
) -> Result<Vec<MergeRequest>, String> {
    let client = resolve_client(source_id.as_deref()).await?;
    client
        .get_merge_requests(project_id, state.as_deref(), reviewer.as_deref())
        .await
}

#[tauri::command]
pub async fn get_todos(source_id: Option<String>, project_id: Option<u64>) -> Result<Vec<Todo>, String> {
    let client = resolve_client(source_id.as_deref()).await?;
    client.get_todos(project_id).await
}

#[tauri::command]
pub async fn add_comment(
    source_id: Option<String>,
    project_id: u64,
    target_type: String,
    target_iid: u64,
    body: String,
) -> Result<NoteComment, String> {
    let client = resolve_client(source_id.as_deref()).await?;
    client
        .add_note(project_id, &target_type, target_iid, &body)
        .await
}

