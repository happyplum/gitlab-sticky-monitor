use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitLabSource {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default)]
    pub sources: Vec<GitLabSource>,
    #[serde(default = "default_polling_interval")]
    pub polling_interval_secs: u64,
    #[serde(default)]
    pub notes: Vec<NoteConfig>,
    #[serde(default)]
    pub watched_repos: Vec<WatchedRepo>,
    #[serde(default)]
    pub gitlab: Option<GitLabConfig>, // legacy support for backward compatibility
}

fn default_polling_interval() -> u64 {
    300
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitLabConfig {
    pub base_url: String,
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteConfig {
    pub id: String,
    #[serde(default)]
    pub source_id: String,
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
    #[serde(default)]
    pub source_id: String,
    pub project_id: u64,
    pub name: String,
    pub path: String,
    pub web_url: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            sources: Vec::new(),
            polling_interval_secs: 300,
            notes: Vec::new(),
            watched_repos: Vec::new(),
            gitlab: None,
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
    let mut config: AppConfig = if path.exists() {
        let data = fs::read_to_string(&path).unwrap_or_default();
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        AppConfig::default()
    };

    // Auto-migration: if sources is empty, but legacy gitlab config has token/url
    let mut migrated = false;
    if config.sources.is_empty() {
        if let Some(ref legacy) = config.gitlab {
            if !legacy.token.is_empty() || !legacy.base_url.is_empty() {
                config.sources.push(GitLabSource {
                    id: "default".to_string(),
                    name: "默认源".to_string(),
                    base_url: if legacy.base_url.is_empty() {
                        "https://gitlab.com".to_string()
                    } else {
                        legacy.base_url.clone()
                    },
                    token: legacy.token.clone(),
                });
                migrated = true;
            }
        }
    }

    // Ensure watched_repos and notes have source_id fallback to first source if empty
    let default_source_id = config
        .sources
        .first()
        .map(|s| s.id.clone())
        .unwrap_or_else(|| "default".to_string());

    for repo in &mut config.watched_repos {
        if repo.source_id.is_empty() {
            repo.source_id = default_source_id.clone();
            migrated = true;
        }
    }
    for note in &mut config.notes {
        if note.source_id.is_empty() {
            note.source_id = default_source_id.clone();
            migrated = true;
        }
    }

    if migrated {
        let _ = save_config(&config);
    }

    config
}

pub fn save_config(config: &AppConfig) -> Result<(), String> {
    let path = config_path();
    let data = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(&path, data).map_err(|e| e.to_string())
}
