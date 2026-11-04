import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useGitLabAPI } from "../hooks/useGitLabAPI";
import type {
  GitLabUser,
  Project,
  WatchedRepo,
  NoteConfig,
  SettingsResponse,
} from "../types/gitlab";
import "../styles/global.css";

import { NOTE_COLORS } from "../constants";

export function ManagerWindow() {
  const api = useGitLabAPI();
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [baseUrl, setBaseUrl] = useState("https://gitlab.com");
  const [token, setToken] = useState("");
  const [pollingInterval, setPollingInterval] = useState(300);
  const [user, setUser] = useState<GitLabUser | null>(null);
  const [connectError, setConnectError] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  const [watchedRepos, setWatchedRepos] = useState<WatchedRepo[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Project[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [notes, setNotes] = useState<NoteConfig[]>([]);
  const [selectedColor, setSelectedColor] = useState(NOTE_COLORS[0].value);

  const [activeSection, setActiveSection] = useState<
    "settings" | "repos" | "notes"
  >("settings");

  // Load initial data
  useEffect(() => {
    loadSettings();
    loadRepos();
    loadNotes();
  }, []);

  const loadSettings = async () => {
    try {
      const s = await api.getSettings();
      setSettings(s);
      setBaseUrl(s.base_url);
      setPollingInterval(s.polling_interval_secs);
    } catch {
      /* first run */
    }
  };

  const loadRepos = async () => {
    try {
      const repos = await api.getWatchedRepos();
      setWatchedRepos(repos);
    } catch {
      /* no repos yet */
    }
  };

  const loadNotes = async () => {
    try {
      const n = await invoke<NoteConfig[]>("get_all_notes");
      setNotes(n);
    } catch {
      /* no notes yet */
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    setConnectError("");
    try {
      const u = await api.testConnection(baseUrl, token);
      setUser(u);
      await api.saveSettings(baseUrl, token, pollingInterval);
      await loadSettings();
    } catch (e) {
      setConnectError(String(e));
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await api.searchProjects(searchQuery);
      setSearchResults(results);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddRepo = async (project: Project) => {
    try {
      await api.addWatchedRepo({
        project_id: project.id,
        name: project.name,
        path: project.path_with_namespace,
        web_url: project.web_url,
      });
      await loadRepos();
      setSearchResults([]);
      setSearchQuery("");
    } catch (e) {
      alert(String(e));
    }
  };

  const handleRemoveRepo = async (projectId: number) => {
    try {
      await api.removeWatchedRepo(projectId);
      await loadRepos();
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateNote = async (repo: WatchedRepo) => {
    try {
      await invoke("create_note", {
        repoId: repo.project_id,
        repoName: repo.name,
        color: selectedColor,
      });
      await loadNotes();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveNote = async (noteId: string) => {
    try {
      await invoke("remove_note", { noteId });
      await loadNotes();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="manager">
      <header className="manager-header">
        <h1>🦊 GitLab 便笺监控</h1>
        {user && (
          <span className="user-info">
            已连接: {user.name} (@{user.username})
          </span>
        )}
      </header>

      <nav className="manager-nav">
        <button
          className={activeSection === "settings" ? "active" : ""}
          onClick={() => setActiveSection("settings")}
        >
          ⚙️ 设置
        </button>
        <button
          className={activeSection === "repos" ? "active" : ""}
          onClick={() => setActiveSection("repos")}
        >
          📂 仓库
        </button>
        <button
          className={activeSection === "notes" ? "active" : ""}
          onClick={() => setActiveSection("notes")}
        >
          📝 便笺
        </button>
      </nav>

      <main className="manager-content">
        {activeSection === "settings" && (
          <section className="section">
            <h2>⚙️ GitLab 连接配置</h2>
            <div className="form-group">
              <label>GitLab URL</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://gitlab.com"
              />
            </div>
            <div className="form-group">
              <label>Personal Access Token</label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="glpat-xxxxxxxxxxxx"
              />
              <small>
                需要 <code>read_api</code> 权限，如需评论则需要 <code>api</code>{" "}
                权限
              </small>
            </div>
            <div className="form-group">
              <label>轮询间隔（秒）</label>
              <input
                type="number"
                value={pollingInterval}
                onChange={(e) => setPollingInterval(parseInt(e.target.value))}
                min={60}
                max={3600}
              />
            </div>
            <button
              className="btn btn-primary"
              onClick={handleConnect}
              disabled={isConnecting}
            >
              {isConnecting ? "连接中..." : "测试并保存连接"}
            </button>
            {connectError && <div className="error-msg">{connectError}</div>}
            {user && !connectError && (
              <div className="success-msg">
                ✅ 连接成功！欢迎, {user.name}
              </div>
            )}
            {settings?.has_token && !user && (
              <div className="info-msg">ℹ️ 已有保存的配置</div>
            )}
          </section>
        )}

        {activeSection === "repos" && (
          <section className="section">
            <h2>📂 监听仓库管理</h2>

            <div className="search-bar">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="搜索项目名称..."
              />
              <button
                className="btn btn-primary"
                onClick={handleSearch}
                disabled={isSearching}
              >
                {isSearching ? "搜索中..." : "🔍 搜索"}
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="search-results">
                <h3>搜索结果</h3>
                {searchResults.map((project) => (
                  <div key={project.id} className="search-result-item">
                    <div>
                      <strong>{project.name}</strong>
                      <small>{project.path_with_namespace}</small>
                      {project.description && (
                        <p>{project.description.slice(0, 80)}</p>
                      )}
                    </div>
                    <button
                      className="btn btn-small"
                      onClick={() => handleAddRepo(project)}
                      disabled={watchedRepos.some(
                        (r) => r.project_id === project.id
                      )}
                    >
                      {watchedRepos.some((r) => r.project_id === project.id)
                        ? "已添加"
                        : "+ 添加"}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="watched-repos">
              <h3>已监听的仓库 ({watchedRepos.length})</h3>
              {watchedRepos.length === 0 ? (
                <div className="empty-state">
                  还没有监听任何仓库，请使用上方搜索添加
                </div>
              ) : (
                watchedRepos.map((repo) => (
                  <div key={repo.project_id} className="repo-item">
                    <div className="repo-info">
                      <strong>📦 {repo.name}</strong>
                      <small>{repo.path}</small>
                    </div>
                    <div className="repo-actions">
                      <button
                        className="btn btn-small btn-primary"
                        onClick={() => handleCreateNote(repo)}
                      >
                        📝 创建便笺
                      </button>
                      <button
                        className="btn btn-small btn-danger"
                        onClick={() => handleRemoveRepo(repo.project_id)}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {activeSection === "notes" && (
          <section className="section">
            <h2>📝 便笺管理</h2>

            <div className="color-picker">
              <label>默认便笺颜色：</label>
              <div className="color-options">
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c.value}
                    className={`color-swatch ${selectedColor === c.value ? "selected" : ""}`}
                    style={{ backgroundColor: c.value }}
                    onClick={() => setSelectedColor(c.value)}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            <div className="notes-list">
              <h3>活动便笺 ({notes.length})</h3>
              {notes.length === 0 ? (
                <div className="empty-state">
                  还没有创建便笺，请前往「仓库」页面为仓库创建便笺
                </div>
              ) : (
                notes.map((note) => (
                  <div
                    key={note.id}
                    className="note-list-item"
                    style={{ borderLeftColor: note.color }}
                  >
                    <div>
                      <strong>{note.repo_name}</strong>
                      <small>
                        {note.filters.show_issues ? "Issues " : ""}
                        {note.filters.show_mrs ? "MR " : ""}
                      </small>
                    </div>
                    <button
                      className="btn btn-small btn-danger"
                      onClick={() => handleRemoveNote(note.id)}
                    >
                      ✕ 关闭
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
