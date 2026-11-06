pub mod gitlab;
pub mod notes;
pub mod settings;

use std::collections::HashMap;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::RwLock;

use crate::gitlab::client::GitLabClient;
use crate::gitlab::poller::Poller;
use crate::storage;

// Global shared state
static CLIENTS: std::sync::OnceLock<Arc<RwLock<HashMap<String, GitLabClient>>>> = std::sync::OnceLock::new();
static CONFIG: std::sync::OnceLock<Arc<RwLock<storage::AppConfig>>> = std::sync::OnceLock::new();

pub fn get_clients() -> &'static Arc<RwLock<HashMap<String, GitLabClient>>> {
    CLIENTS.get_or_init(|| Arc::new(RwLock::new(HashMap::new())))
}

pub async fn get_client_for_source(source_id: &str) -> Option<GitLabClient> {
    let clients = get_clients().read().await;
    clients.get(source_id).cloned()
}

pub fn get_config() -> &'static Arc<RwLock<storage::AppConfig>> {
    CONFIG.get().expect("configuration is initialized before commands are registered")
}

pub fn init_config() -> Result<(), String> {
    CONFIG.set(Arc::new(RwLock::new(storage::load_config()?)))
        .map_err(|_| "配置已经初始化".to_string())
}

pub async fn reload_clients() {
    let config = get_config().read().await;
    let mut clients = get_clients().write().await;
    clients.clear();
    for source in &config.sources {
        if !source.token.is_empty() {
            clients.insert(source.id.clone(), GitLabClient::new(&source.base_url, &source.token));
        }
    }
}

pub async fn init_polling(app: AppHandle) -> Result<(), String> {
    let config = get_config().clone();
    let clients = get_clients().clone();

    // Initialize clients from saved config
    {
        let cfg = config.read().await;
        let mut c = clients.write().await;
        c.clear();
        for source in &cfg.sources {
            if !source.token.is_empty() {
                c.insert(source.id.clone(), GitLabClient::new(&source.base_url, &source.token));
            }
        }
    }

    // Restore saved notes windows
    let notes = {
        let cfg = config.read().await;
        cfg.notes.clone()
    };
    for note in &notes {
        if note.is_open { notes::restore_note_window(&app, note)?; }
    }

    // Start the poller
    let poller = Poller::new(app, clients, config);
    poller.start().await;

    Ok(())
}

