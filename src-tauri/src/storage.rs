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
    pub version: u32,
    #[serde(default)]
    pub sources: Vec<GitLabSource>,
    #[serde(default = "default_polling_interval")]
    pub polling_interval_secs: u64,
    #[serde(default)]
    pub notes: Vec<NoteConfig>,
    #[serde(default)]
    pub watched_repos: Vec<WatchedRepo>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub app_updates: Option<AppUpdatesConfig>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AppUpdatesConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub endpoint: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto_check: Option<bool>,
}

/// 默认更新源：公开 release 仓固定 stable tag 的 latest.json（Gitea 无 latest 重定向）。
/// 权威源在此，前端经 updater_current_version 获取，不另存副本。
pub const DEFAULT_UPDATE_ENDPOINT: &str =
    "https://s.happyplum.cn:8888/tools/gitlab-sticky-monitor-releases/releases/download/stable/latest.json";

impl AppUpdatesConfig {
    pub fn effective_endpoint(&self) -> String {
        self.endpoint
            .as_deref()
            .map(str::trim)
            .filter(|endpoint| !endpoint.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| DEFAULT_UPDATE_ENDPOINT.to_string())
    }

    pub fn effective_token(&self) -> Option<String> {
        self.token
            .as_deref()
            .map(str::trim)
            .filter(|token| !token.is_empty())
            .map(str::to_string)
    }

    pub fn auto_check_enabled(&self) -> bool {
        self.auto_check.unwrap_or(true)
    }
}

fn default_polling_interval() -> u64 {
    300
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteConfig {
    pub id: String,
    pub color: String,
    pub position: Position,
    pub size: Size,
    pub always_on_top: bool,
    pub is_open: bool,
    #[serde(flatten)]
    pub content: NoteContent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum NoteContent {
    Gitlab {
        source_id: String,
        repo_id: u64,
        repo_name: String,
        feed: NoteFeed,
        filters: NoteFilters,
    },
    Custom { document: serde_json::Value },
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NoteFeed { Issues, Mrs, Todos }

impl NoteConfig {
    pub fn title(&self) -> String {
        match &self.content {
            NoteContent::Gitlab { repo_name, feed, .. } => format!("{} · {}", repo_name, match feed {
                NoteFeed::Issues => "Issues", NoteFeed::Mrs => "MR", NoteFeed::Todos => "待办",
            }),
            NoteContent::Custom { .. } => "自定义便笺".to_string(),
        }
    }
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
            version: 2,
            sources: Vec::new(),
            polling_interval_secs: 300,
            notes: Vec::new(),
            watched_repos: Vec::new(),
            app_updates: None,
        }
    }
}

impl Default for NoteFilters {
    fn default() -> Self {
        Self {
            only_assigned_to_me: false,
            labels: Vec::new(),
        }
    }
}

fn config_path() -> PathBuf {
    #[cfg(debug_assertions)]
    if let Some(path) = std::env::var_os("GITLAB_STICKY_TEST_CONFIG") {
        return PathBuf::from(path);
    }
    let mut path = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("gitlab-sticky-monitor");
    path.push("config.json");
    path
}

pub fn load_config() -> Result<AppConfig, String> { load_from(&config_path()) }

fn load_from(path: &std::path::Path) -> Result<AppConfig, String> {
    let data = match fs::read_to_string(path) {
        Ok(data) => data,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(AppConfig::default()),
        Err(error) => return Err(format!("读取配置失败：{error}")),
    };
    let value: serde_json::Value = serde_json::from_str(&data).map_err(|_| "配置格式无法读取，已保留原文件".to_string())?;
    let legacy = value.get("version").is_none();
    let config = if legacy { migrate_legacy(value)? } else {
        if value["version"] != 2 { return Err("不支持此配置版本，已保留原文件".into()); }
        serde_json::from_value::<AppConfig>(value).map_err(|_| "配置格式无法读取，已保留原文件".to_string())?
    };
    for note in &config.notes {
        if let NoteContent::Custom { document } = &note.content { validate_document(document)?; }
    }
    if legacy { save_to(path, &config)?; }
    Ok(config)
}

fn migrate_legacy(value: serde_json::Value) -> Result<AppConfig, String> {
    #[derive(Deserialize)]
    struct LegacyGitlab { base_url: String, token: String }
    #[derive(Deserialize)]
    struct LegacyFilters { show_issues: bool, show_mrs: bool, only_assigned_to_me: bool, labels: Vec<String> }
    #[derive(Deserialize)]
    struct LegacyNote {
        id: String, #[serde(default)] source_id: String, repo_id: u64, repo_name: String,
        color: String, position: Position, size: Size, always_on_top: bool, filters: LegacyFilters,
    }
    #[derive(Deserialize)]
    struct LegacyConfig {
        #[serde(default)] sources: Vec<GitLabSource>,
        #[serde(default = "default_polling_interval")] polling_interval_secs: u64,
        #[serde(default)] notes: Vec<LegacyNote>,
        #[serde(default)] watched_repos: Vec<WatchedRepo>,
        #[serde(default)] gitlab: Option<LegacyGitlab>,
    }
    let old: LegacyConfig = serde_json::from_value(value).map_err(|_| "旧配置格式无法读取，已保留原文件".to_string())?;
    let mut config = AppConfig { sources: old.sources, polling_interval_secs: old.polling_interval_secs,
        watched_repos: old.watched_repos, ..AppConfig::default() };
    if config.sources.is_empty() {
        if let Some(legacy) = old.gitlab {
            if !legacy.token.is_empty() || !legacy.base_url.is_empty() {
                config.sources.push(GitLabSource { id: "default".into(), name: "默认源".into(),
                    base_url: if legacy.base_url.is_empty() { "https://gitlab.com".into() } else { legacy.base_url }, token: legacy.token });
            }
        }
    }
    let default_source = config.sources.first().map(|s| s.id.clone()).unwrap_or_else(|| "default".into());
    for repo in &mut config.watched_repos {
        if repo.source_id.is_empty() { repo.source_id = default_source.clone(); }
    }
    for old in old.notes {
        let source_id = if old.source_id.is_empty() { default_source.clone() } else { old.source_id };
        let feeds = [(NoteFeed::Issues, old.filters.show_issues), (NoteFeed::Mrs, old.filters.show_mrs), (NoteFeed::Todos, true)];
        for (index, (feed, _)) in feeds.into_iter().filter(|(_, enabled)| *enabled).enumerate() {
            config.notes.push(NoteConfig {
                id: if index == 0 { old.id.clone() } else { format!("note-{}", uuid::Uuid::new_v4()) },
                color: old.color.clone(), position: old.position.clone(), size: old.size.clone(),
                always_on_top: old.always_on_top, is_open: true,
                content: NoteContent::Gitlab { source_id: source_id.clone(), repo_id: old.repo_id, repo_name: old.repo_name.clone(), feed,
                    filters: NoteFilters { only_assigned_to_me: old.filters.only_assigned_to_me, labels: old.filters.labels.clone() } },
            });
        }
    }
    Ok(config)
}

pub fn save_config(config: &AppConfig) -> Result<(), String> { save_to(&config_path(), config) }

fn save_to(path: &std::path::Path, config: &AppConfig) -> Result<(), String> {
    use std::io::Write;
    fs::create_dir_all(path.parent().ok_or("配置目录无效")?).map_err(|e| e.to_string())?;
    let temporary = path.with_extension("json.tmp");
    let result = (|| {
        let data = serde_json::to_vec_pretty(config).map_err(|e| e.to_string())?;
        let mut file = fs::File::create(&temporary).map_err(|e| e.to_string())?;
        file.write_all(&data).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        drop(file);
        fs::rename(&temporary, path).map_err(|e| e.to_string())
    })();
    if result.is_err() { let _ = fs::remove_file(temporary); }
    result.map_err(|error| format!("保存配置失败：{error}"))
}

pub fn update_config<T>(config: &mut AppConfig, change: impl FnOnce(&mut AppConfig) -> Result<T, String>) -> Result<T, String> {
    let mut next = config.clone();
    let result = change(&mut next)?;
    save_config(&next)?;
    *config = next;
    Ok(result)
}

pub fn empty_document() -> serde_json::Value {
    serde_json::json!({"root": {"type":"root", "version":1, "format":"", "indent":0, "direction":null,
        "children":[{"type":"paragraph", "version":1, "format":"", "indent":0, "direction":null,
            "textFormat":0, "textStyle":"", "children":[]}]}})
}

pub fn validate_document(document: &serde_json::Value) -> Result<(), String> {
    fn node(value: &serde_json::Value, level: usize) -> Result<(), String> {
        let kind = value["type"].as_str().ok_or("便笺文档节点无效")?;
        let allowed = match level { 0 => kind == "root", 1 => kind == "paragraph", 2 => matches!(kind, "text" | "linebreak" | "tab"), _ => false };
        if !allowed || value["version"] != 1 { return Err("便笺文档包含不支持的节点".into()); }
        if kind == "text" || kind == "tab" {
            if !value["text"].is_string() || value["style"].as_str().unwrap_or("") != "" {
                return Err("便笺文字格式无效".into());
            }
        }
        if level < 2 {
            if value["indent"].as_u64().is_none() { return Err("便笺缩进格式无效".into()); }
            if value["textStyle"].as_str().unwrap_or("") != "" { return Err("便笺段落样式不受支持".into()); }
            for child in value["children"].as_array().ok_or("便笺段落格式无效")? { node(child, level + 1)?; }
        }
        Ok(())
    }
    node(&document["root"], 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_notes_split_once_and_keep_source_filters_and_geometry() {
        let dir = directory();
        let path = dir.join("config.json");
        let legacy = serde_json::json!({
            "sources":[{"id":"team", "name":"team", "base_url":"https://example.invalid", "token":""}],
            "polling_interval_secs":120,
            "notes":[{"id":"note-old", "source_id":"team", "repo_id":42,"repo_name":"repo",
                "color":"#FFFACD","position":{"x":-250,"y":30},"size":{"w":340,"h":450},"always_on_top":true,
                "filters":{"show_issues":true,"show_mrs":true,"only_assigned_to_me":true,"labels":["bug"]}}]
        });
        fs::write(&path, legacy.to_string()).unwrap();
        let config = load_from(&path).unwrap();
        assert_eq!(config.version, 2);
        assert_eq!(config.notes.len(), 3);
        assert_eq!(config.polling_interval_secs, 120);
        for (note, expected) in config.notes.iter().zip([NoteFeed::Issues, NoteFeed::Mrs, NoteFeed::Todos]) {
            assert!(note.is_open);
            assert_eq!(note.position.x, -250.0);
            assert_eq!(note.size.w, 340.0);
            match &note.content {
                NoteContent::Gitlab { source_id, repo_id, feed, filters, .. } => {
                    assert_eq!(source_id, "team"); assert_eq!(*repo_id, 42); assert_eq!(*feed, expected);
                    assert!(filters.only_assigned_to_me); assert_eq!(filters.labels, ["bug"]);
                },
                _ => panic!("expected GitLab note"),
            }
        }
        let ids: std::collections::HashSet<_> = config.notes.iter().map(|n| &n.id).collect();
        assert_eq!(ids.len(), 3);
        let first = fs::read(&path).unwrap();
        assert_eq!(serde_json::to_value(load_from(&path).unwrap()).unwrap(), serde_json::to_value(config).unwrap());
        assert_eq!(fs::read(&path).unwrap(), first);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn legacy_single_source_and_disabled_feeds_migrate_at_the_boundary() {
        let dir = directory();
        let path = dir.join("config.json");
        let mut legacy = serde_json::json!({"gitlab":{"base_url":"https://example.invalid","token":"synthetic-test-token"},
            "watched_repos":[{"project_id":42,"name":"repo","path":"team/repo","web_url":"https://example.invalid/repo"}],
            "notes":[{"id":"note-old","repo_id":42,"repo_name":"repo","color":"#FFFACD",
                "position":{"x":0,"y":0},"size":{"w":340,"h":450},"always_on_top":false,
                "filters":{"show_issues":false,"show_mrs":false,"only_assigned_to_me":false,"labels":[]}}]});
        fs::write(&path, legacy.to_string()).unwrap();
        let config = load_from(&path).unwrap();
        assert_eq!(config.sources[0].id, "default");
        assert_eq!(config.sources[0].base_url, "https://example.invalid");
        assert_eq!(config.sources[0].token, "synthetic-test-token");
        assert_eq!(config.watched_repos[0].source_id, "default");
        assert_eq!(config.notes.len(), 1);
        assert!(matches!(&config.notes[0].content, NoteContent::Gitlab { source_id, feed: NoteFeed::Todos, .. } if source_id == "default"));
        assert!(serde_json::from_slice::<serde_json::Value>(&fs::read(&path).unwrap()).unwrap().get("gitlab").is_none());
        for (field, expected) in [("show_issues", NoteFeed::Issues), ("show_mrs", NoteFeed::Mrs)] {
            legacy["notes"][0]["filters"]["show_issues"] = false.into();
            legacy["notes"][0]["filters"]["show_mrs"] = false.into();
            legacy["notes"][0]["filters"][field] = true.into();
            fs::write(&path, legacy.to_string()).unwrap();
            let migrated = load_from(&path).unwrap();
            let feeds: Vec<_> = migrated.notes.iter().map(|note| match note.content {
                NoteContent::Gitlab { feed, .. } => feed,
                _ => panic!("expected GitLab note"),
            }).collect();
            assert_eq!(feeds, [expected, NoteFeed::Todos]);
        }
        fs::remove_dir_all(dir).unwrap();
    }

    fn directory() -> PathBuf {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.tmp/note-storage-tests").join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn missing_config_is_empty_but_corrupt_or_unknown_config_is_preserved() {
        let dir = directory();
        let path = dir.join("config.json");
        assert!(load_from(&path).unwrap().notes.is_empty());
        for data in ["{broken", r#"{"version":99,"sources":[],"notes":[]}"#] {
            fs::write(&path, data).unwrap();
            assert!(load_from(&path).is_err());
            assert_eq!(fs::read_to_string(&path).unwrap(), data);
        }
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn replacing_config_preserves_all_note_kinds_and_hidden_content() {
        let dir = directory();
        let path = dir.join("config.json");
        let mut config = AppConfig::default();
        save_to(&path, &config).unwrap();
        let mut document = empty_document();
        document["root"]["children"][0]["indent"] = 2.into();
        document["root"]["children"][0]["children"] = serde_json::json!([
            {"type":"text", "version":1, "text":"保留正文", "format":15, "style":"", "mode":"normal", "detail":0}
        ]);
        for content in [
            NoteContent::Custom { document: document.clone() },
            NoteContent::Gitlab { source_id: "s".into(), repo_id: 1, repo_name: "project".into(), feed: NoteFeed::Issues, filters: NoteFilters::default() },
            NoteContent::Gitlab { source_id: "s".into(), repo_id: 1, repo_name: "project".into(), feed: NoteFeed::Mrs, filters: NoteFilters::default() },
            NoteContent::Gitlab { source_id: "s".into(), repo_id: 1, repo_name: "project".into(), feed: NoteFeed::Todos, filters: NoteFilters::default() },
        ] {
            config.notes.push(NoteConfig { id: uuid::Uuid::new_v4().to_string(), color: "#FFFACD".into(),
                position: Position { x: -300.0, y: 40.0 }, size: Size { w: 340.0, h: 450.0 },
                always_on_top: true, is_open: false, content });
        }
        save_to(&path, &config).unwrap();
        let restored = load_from(&path).unwrap();
        assert_eq!(serde_json::to_value(restored).unwrap(), serde_json::to_value(config).unwrap());
        assert!(!path.with_extension("json.tmp").exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn failed_temporary_write_does_not_truncate_previous_config() {
        let dir = directory();
        let path = dir.join("config.json");
        let original = AppConfig::default();
        save_to(&path, &original).unwrap();
        let before = fs::read(&path).unwrap();
        fs::create_dir(path.with_extension("json.tmp")).unwrap();
        let mut next = original.clone();
        next.polling_interval_secs = 120;
        assert!(save_to(&path, &next).is_err());
        assert_eq!(fs::read(&path).unwrap(), before);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn app_updates_roundtrip_keeps_endpoint_token_and_auto_check() {
        let config = AppConfig {
            app_updates: Some(AppUpdatesConfig {
                endpoint: Some("https://example.invalid/latest.json".into()),
                token: Some("synthetic-test-token".into()),
                auto_check: Some(false),
            }),
            ..AppConfig::default()
        };
        let encoded = serde_json::to_value(&config).unwrap();
        let restored: AppConfig = serde_json::from_value(encoded.clone()).unwrap();
        assert_eq!(serde_json::to_value(restored).unwrap(), encoded);
        assert_eq!(encoded["app_updates"]["endpoint"], "https://example.invalid/latest.json");
        assert_eq!(encoded["app_updates"]["token"], "synthetic-test-token");
        assert_eq!(encoded["app_updates"]["auto_check"], false);
    }

    #[test]
    fn legacy_config_without_app_updates_parses_to_none() {
        let legacy = r#"{"version":2,"sources":[],"polling_interval_secs":300,"notes":[],"watched_repos":[]}"#;
        let config: AppConfig = serde_json::from_str(legacy).unwrap();
        assert_eq!(config.version, 2);
        assert!(config.app_updates.is_none());
        assert!(serde_json::to_value(AppConfig::default()).unwrap().get("app_updates").is_none());
    }

    #[test]
    fn document_boundary_rejects_html_nodes_and_styles() {
        assert!(validate_document(&empty_document()).is_ok());
        let mut document = empty_document();
        document["root"]["children"][0]["children"] = serde_json::json!([{"type":"script","version":1,"text":"not executed"}]);
        assert!(validate_document(&document).is_err());
        document["root"]["children"][0]["children"] = serde_json::json!([{"type":"text","version":1,"text":"test","style":"background:url(https://invalid)"}]);
        assert!(validate_document(&document).is_err());
    }
}
