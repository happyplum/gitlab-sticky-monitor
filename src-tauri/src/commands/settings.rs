use crate::gitlab::client::GitLabClient;
use crate::gitlab::types::GitLabUser;
use crate::storage::{self, GitLabSource, WatchedRepo};
use super::{get_config, reload_clients};

#[derive(serde::Serialize, serde::Deserialize)]
pub struct SettingsResponse {
    pub sources: Vec<GitLabSource>,
    pub polling_interval_secs: u64,
}

#[tauri::command]
pub async fn get_settings() -> Result<SettingsResponse, String> {
    let cfg = get_config().read().await;
    Ok(SettingsResponse {
        sources: cfg.sources.clone(),
        polling_interval_secs: cfg.polling_interval_secs,
    })
}

#[tauri::command]
pub async fn get_sources() -> Result<Vec<GitLabSource>, String> {
    let cfg = get_config().read().await;
    Ok(cfg.sources.clone())
}

#[tauri::command]
pub async fn save_source(mut source: GitLabSource) -> Result<GitLabSource, String> {
    if source.base_url.trim().is_empty() {
        return Err("GitLab URL 不能为空".to_string());
    }
    // Normalize base_url (remove trailing slash)
    source.base_url = source.base_url.trim().trim_end_matches('/').to_string();

    if source.id.is_empty() {
        source.id = format!("src-{}", uuid::Uuid::new_v4().to_string().split('-').next().unwrap());
    }

    if source.name.trim().is_empty() {
        source.name = source.base_url.clone();
    }

    {
        let mut cfg = get_config().write().await;
        storage::update_config(&mut cfg, |cfg| {
            if let Some(existing) = cfg.sources.iter_mut().find(|s| s.id == source.id) {
                *existing = source.clone();
            } else { cfg.sources.push(source.clone()); }
            Ok(())
        })?;
    }

    reload_clients().await;
    Ok(source)
}

#[tauri::command]
pub async fn delete_source(source_id: String) -> Result<(), String> {
    {
        let mut cfg = get_config().write().await;
        storage::update_config(&mut cfg, |cfg| {
            cfg.sources.retain(|s| s.id != source_id);
            cfg.watched_repos.retain(|r| r.source_id != source_id);
            Ok(())
        })?;
    }

    reload_clients().await;
    Ok(())
}

#[tauri::command]
pub async fn test_source_connection(base_url: String, token: String) -> Result<GitLabUser, String> {
    let client = GitLabClient::new(&base_url, &token);
    client.test_connection().await
}

#[tauri::command]
pub async fn save_settings(
    polling_interval_secs: Option<u64>,
) -> Result<(), String> {
    let mut cfg = get_config().write().await;
    storage::update_config(&mut cfg, |cfg| {
        if let Some(p) = polling_interval_secs { cfg.polling_interval_secs = p; }
        Ok(())
    })
}

#[tauri::command]
pub async fn get_watched_repos() -> Result<Vec<WatchedRepo>, String> {
    let cfg = get_config().read().await;
    Ok(cfg.watched_repos.clone())
}

#[tauri::command]
pub async fn add_watched_repo(
    source_id: String,
    project_id: u64,
    name: String,
    path: String,
    web_url: String,
) -> Result<(), String> {
    let mut cfg = get_config().write().await;
    // Check composite key (source_id, project_id) to avoid duplicates
    if cfg
        .watched_repos
        .iter()
        .any(|r| r.source_id == source_id && r.project_id == project_id)
    {
        return Err("该源下的该仓库已被监听".to_string());
    }

    storage::update_config(&mut cfg, |cfg| {
        cfg.watched_repos.push(WatchedRepo { source_id, project_id, name, path, web_url });
        Ok(())
    })
}

#[tauri::command]
pub async fn remove_watched_repo(source_id: String, project_id: u64) -> Result<(), String> {
    let mut cfg = get_config().write().await;
    storage::update_config(&mut cfg, |cfg| {
        cfg.watched_repos.retain(|r| !(r.source_id == source_id && r.project_id == project_id));
        Ok(())
    })
}

