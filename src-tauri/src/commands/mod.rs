pub mod gitlab;
pub mod notes;
pub mod settings;

use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::RwLock;

use crate::gitlab::client::GitLabClient;
use crate::gitlab::poller::Poller;
use crate::storage;

// Global shared state
static CLIENT: std::sync::OnceLock<Arc<RwLock<Option<GitLabClient>>>> = std::sync::OnceLock::new();
static CONFIG: std::sync::OnceLock<Arc<RwLock<storage::AppConfig>>> = std::sync::OnceLock::new();

pub fn get_client() -> &'static Arc<RwLock<Option<GitLabClient>>> {
    CLIENT.get_or_init(|| Arc::new(RwLock::new(None)))
}

pub fn get_config() -> &'static Arc<RwLock<storage::AppConfig>> {
    CONFIG.get_or_init(|| Arc::new(RwLock::new(storage::load_config())))
}

pub async fn init_polling(app: AppHandle) -> Result<(), String> {
    let config = get_config().clone();
    let client = get_client().clone();

    // Initialize client from saved config
    {
        let cfg = config.read().await;
        if !cfg.gitlab.token.is_empty() {
            let mut c = client.write().await;
            *c = Some(GitLabClient::new(&cfg.gitlab.base_url, &cfg.gitlab.token));
        }
    }

    // Restore saved notes windows
    let notes = {
        let cfg = config.read().await;
        cfg.notes.clone()
    };
    for note in &notes {
        let _ = notes::restore_note_window(&app, note);
    }

    // Start the poller
    let poller = Poller::new(app, client, config);
    poller.start().await;

    Ok(())
}
