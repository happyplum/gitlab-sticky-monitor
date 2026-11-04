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
    client: Arc<RwLock<Option<GitLabClient>>>,
    config: Arc<RwLock<AppConfig>>,
}

impl Poller {
    pub fn new(
        app: AppHandle,
        client: Arc<RwLock<Option<GitLabClient>>>,
        config: Arc<RwLock<AppConfig>>,
    ) -> Self {
        Self { app, client, config }
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
        let client_guard = self.client.read().await;
        let client = match client_guard.as_ref() {
            Some(c) => c,
            None => {
                log::debug!("No GitLab client configured, skipping poll");
                return;
            }
        };

        let repos: Vec<WatchedRepo> = {
            let cfg = self.config.read().await;
            cfg.watched_repos.clone()
        };

        for repo in &repos {
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
                repo_id: repo.project_id.to_string(),
                repo_name: repo.name.clone(),
                issues,
                merge_requests: mrs,
                my_todos: todos,
                timestamp: Utc::now(),
            };

            let _ = self.app.emit("gitlab-update", &update);
            log::debug!("Emitted update for repo {}", repo.name);
        }
    }
}
