use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub gitlab: GitLabConfig,
    pub polling_interval_secs: u64,
    pub notes: Vec<NoteConfig>,
    pub watched_repos: Vec<WatchedRepo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitLabConfig {
    pub base_url: String,
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteConfig {
    pub id: String,
    pub repo_id: u64,
    pub repo_name: String,
    pub color: String,
    pub position: Position,
    pub size: Size,
    pub always_on_top: bool,
    pub filters: NoteFilters,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Size {
    pub w: f64,
    pub h: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteFilters {
    pub show_issues: bool,
    pub show_mrs: bool,
    pub only_assigned_to_me: bool,
    pub labels: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchedRepo {
    pub project_id: u64,
    pub name: String,
    pub path: String,
    pub web_url: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            gitlab: GitLabConfig {
                base_url: "https://gitlab.com".to_string(),
                token: String::new(),
            },
            polling_interval_secs: 300,
            notes: Vec::new(),
            watched_repos: Vec::new(),
        }
    }
}

impl Default for NoteFilters {
    fn default() -> Self {
        Self {
            show_issues: true,
            show_mrs: true,
            only_assigned_to_me: false,
            labels: Vec::new(),
        }
    }
}

fn config_path() -> PathBuf {
    let mut path = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("gitlab-sticky-monitor");
    fs::create_dir_all(&path).ok();
    path.push("config.json");
    path
}

pub fn load_config() -> AppConfig {
    let path = config_path();
    if path.exists() {
        let data = fs::read_to_string(&path).unwrap_or_default();
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        AppConfig::default()
    }
}

pub fn save_config(config: &AppConfig) -> Result<(), String> {
    let path = config_path();
    let data = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(&path, data).map_err(|e| e.to_string())
}
