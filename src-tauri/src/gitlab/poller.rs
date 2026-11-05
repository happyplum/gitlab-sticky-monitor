use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use chrono::Utc;
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;
use tokio::time::interval;

use super::client::GitLabClient;
use super::types::GitLabUpdate;
use crate::storage::{AppConfig, WatchedRepo};

pub struct Poller {
    app: AppHandle,
    clients: Arc<RwLock<HashMap<String, GitLabClient>>>,
    config: Arc<RwLock<AppConfig>>,
}

impl Poller {
    pub fn new(
        app: AppHandle,
        clients: Arc<RwLock<HashMap<String, GitLabClient>>>,
        config: Arc<RwLock<AppConfig>>,
    ) -> Self {
        Self { app, clients, config }
    }

    pub async fn start(&self) {
        let interval_secs = {
            let cfg = self.config.read().await;
            cfg.polling_interval_secs.max(10)
        };
        let mut ticker = interval(Duration::from_secs(interval_secs));

        loop {
            ticker.tick().await;
            self.poll_all().await;
        }
    }

    pub async fn poll_all(&self) {
        let (repos, clients_map) = {
            let cfg = self.config.read().await;
            let cls = self.clients.read().await;
            (cfg.watched_repos.clone(), cls.clone())
        };

        if clients_map.is_empty() {
            log::debug!("No GitLab clients configured, skipping poll");
            return;
        }

        for repo in &repos {
            // Find client for repo's source_id
            let client = match clients_map.get(&repo.source_id) {
                Some(c) => c,
                None => {
                    log::debug!(
                        "No GitLab client configured for source_id '{}' (repo {}), skipping",
                        repo.source_id,
                        repo.name
                    );
                    continue;
                }
            };

            let issues = client
                .get_issues(repo.project_id, Some("opened"), None, None)
                .await
                .unwrap_or_default();

            let mrs = client
                .get_merge_requests(repo.project_id, Some("opened"), None)
                .await
                .unwrap_or_default();

            let todos = client
                .get_todos(Some(repo.project_id))
                .await
                .unwrap_or_default();

            let update = GitLabUpdate {
                source_id: repo.source_id.clone(),
                repo_id: repo.project_id.to_string(),
                repo_name: repo.name.clone(),
                issues,
                merge_requests: mrs,
                my_todos: todos,
                timestamp: Utc::now(),
            };

            let _ = self.app.emit("gitlab-update", &update);
            log::debug!("Emitted update for repo {} [source {}]", repo.name, repo.source_id);
        }
    }
}

