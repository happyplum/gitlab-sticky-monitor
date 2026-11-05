import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useGitLabAPI } from "../hooks/useGitLabAPI";
import type {
  GitLabSource,
  Project,
  WatchedRepo,
  NoteConfig,
} from "../types/gitlab";
import "../styles/global.css";

import { NOTE_COLORS } from "../constants";

export function ManagerWindow() {
  const api = useGitLabAPI();
  const [sources, setSources] = useState<GitLabSource[]>([]);
  const [activeSourceId, setActiveSourceId] = useState<string>("");

  // Form for adding / editing a source
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("https://gitlab.com");
  const [formToken, setFormToken] = useState("");
  const [isTestingSource, setIsTestingSource] = useState(false);
  const [sourceTestMsg, setSourceTestMsg] = useState("");
  const [sourceTestError, setSourceTestError] = useState("");

  // Polling interval
  const [pollingInterval, setPollingInterval] = useState(300);

  // Repositories
  const [watchedRepos, setWatchedRepos] = useState<WatchedRepo[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Project[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Notes
  const [notes, setNotes] = useState<NoteConfig[]>([]);
  const [selectedColor, setSelectedColor] = useState(NOTE_COLORS[0].value);

  const [activeSection, setActiveSection] = useState<
    "settings" | "repos" | "notes"
  >("settings");

  // Load initial data
  useEffect(() => {
    loadSources();
    loadRepos();
    loadNotes();
  }, []);

  const loadSources = async () => {
    try {
      const s = await api.getSettings();
      setSources(s.sources);
      setPollingInterval(s.polling_interval_secs);
      if (s.sources.length > 0 && !activeSourceId) {
        setActiveSourceId(s.sources[0].id);
      }
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

  const handleTestSource = async (baseUrl: string, token: string) => {
    setIsTestingSource(true);
    setSourceTestMsg("");
    setSourceTestError("");
    try {
      const user = await api.testSourceConnection(baseUrl, token);
      setSourceTestMsg(`✅ 连接成功！欢迎, ${user.name} (@${user.username})`);
    } catch (e) {
      setSourceTestError(`❌ 连接失败: ${String(e)}`);
    } finally {
      setIsTestingSource(false);
    }
  };

  const handleSaveSource = async () => {
    if (!formUrl.trim()) {
      alert("请输入 GitLab 地址");
      return;
    }
    try {
      const saved = await api.saveSource({
        id: editingId || "",
        name: formName.trim() || formUrl.trim(),
        base_url: formUrl.trim(),
        token: formToken.trim(),
      });
      await loadSources();
      if (!activeSourceId) {
        setActiveSourceId(saved.id);
      }
      // Reset form
      setEditingId(null);
      setFormName("");
      setFormUrl("https://gitlab.com");
      setFormToken("");
      setSourceTestMsg("");
      setSourceTestError("");
    } catch (e) {
      alert(String(e));
    }
  };

  const handleEditSource = (source: GitLabSource) => {
    setEditingId(source.id);
    setFormName(source.name);
    setFormUrl(source.base_url);
    setFormToken(source.token);
    setSourceTestMsg("");
    setSourceTestError("");
  };

  const handleDeleteSource = async (sourceId: string) => {
    if (!confirm("确定要删除该 GitLab 源吗？该源下监听的仓库也将被移除。")) {
      return;
    }
    try {
      await api.deleteSource(sourceId);
      await loadSources();
      await loadRepos();
      if (activeSourceId === sourceId) {
        setActiveSourceId(sources.find((s) => s.id !== sourceId)?.id || "");
      }
    } catch (e) {
      alert(String(e));
    }
  };

  const handleSaveInterval = async () => {
    try {
      await api.saveSettings(pollingInterval);
      alert("轮询间隔设置已保存！");
    } catch (e) {
      alert(String(e));
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() || !activeSourceId) return;
    setIsSearching(true);
    try {
      const results = await api.searchProjects(searchQuery, activeSourceId);
      setSearchResults(results);
    } catch (e) {
      alert(`搜索失败: ${String(e)}`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddRepo = async (project: Project) => {
    if (!activeSourceId) {
      alert("请先选择对应的 GitLab 源");
      return;
    }
    try {
      await api.addWatchedRepo({
        source_id: activeSourceId,
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

  const handleRemoveRepo = async (sourceId: string, projectId: number) => {
    try {
      await api.removeWatchedRepo(sourceId, projectId);
      await loadRepos();
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateNote = async (repo: WatchedRepo) => {
    try {
      await invoke("create_note", {
        sourceId: repo.source_id,
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

  const getSourceName = (sourceId: string) => {
    const s = sources.find((item) => item.id === sourceId);
    return s ? s.name : "默认源";
  };

  return (
    <div className="manager">
      <header className="manager-header">
        <h1>🦊 GitLab 便笺监控</h1>
        <span className="user-info">
          已配置源数: {sources.length} | 监听仓库: {watchedRepos.length}
        </span>
      </header>

      <nav className="manager-nav">
        <button
          className={activeSection === "settings" ? "active" : ""}
          onClick={() => setActiveSection("settings")}
        >
          ⚙️ 源设置
        </button>
        <button
          className={activeSection === "repos" ? "active" : ""}
          onClick={() => setActiveSection("repos")}
        >
          📂 仓库管理
        </button>
        <button
          className={activeSection === "notes" ? "active" : ""}
          onClick={() => setActiveSection("notes")}
        >
          📝 便笺管理
        </button>
      </nav>

      <main className="manager-content">
        {activeSection === "settings" && (
          <section className="section">
            <h2>⚙️ GitLab 多源配置</h2>

            {/* List of existing sources */}
            <div style={{ marginBottom: "24px" }}>
              <h3>已配置的 GitLab 源 ({sources.length})</h3>
              {sources.length === 0 ? (
                <div className="empty-state">
                  尚未配置任何 GitLab 源，请在下方添加第一个源
                </div>
              ) : (
                sources.map((s) => (
                  <div key={s.id} className="source-card">
                    <div className="source-card-info">
                      <strong>🏷️ {s.name}</strong>
                      <small>🌐 {s.base_url}</small>
                      <small>
                        🔑 Token: {s.token ? `${s.token.slice(0, 8)}...` : "(未设置)"}
                      </small>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        className="btn btn-small btn-primary"
                        onClick={() => handleTestSource(s.base_url, s.token)}
                        disabled={isTestingSource}
                      >
                        测试连接
                      </button>
                      <button
                        className="btn btn-small"
                        onClick={() => handleEditSource(s)}
                      >
                        编辑
                      </button>
                      <button
                        className="btn btn-small btn-danger"
                        onClick={() => handleDeleteSource(s.id)}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Form to add or edit source */}
            <div
              style={{
                background: "var(--bg-card)",
                padding: "16px",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                marginBottom: "24px",
              }}
            >
              <h3>{editingId ? "✏️ 编辑 GitLab 源" : "➕ 添加新 GitLab 源"}</h3>
              <div className="form-group">
                <label>源名称（如：公司内网 GitLab、个人开源）</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="例如: 公司内网 GitLab"
                />
              </div>
              <div className="form-group">
                <label>GitLab URL</label>
                <input
                  type="text"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://gitlab.com 或 https://gitlab.company.com"
                />
              </div>
              <div className="form-group">
                <label>Personal Access Token</label>
                <input
                  type="password"
                  value={formToken}
                  onChange={(e) => setFormToken(e.target.value)}
                  placeholder="glpat-xxxxxxxxxxxx"
                />
                <small>
                  需要 <code>read_api</code> 权限，如需评论则需要 <code>api</code> 权限
                </small>
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  className="btn btn-primary"
                  onClick={handleSaveSource}
                >
                  {editingId ? "保存修改" : "添加源"}
                </button>
                <button
                  className="btn"
                  onClick={() => handleTestSource(formUrl, formToken)}
                  disabled={isTestingSource}
                >
                  {isTestingSource ? "连接测试中..." : "测试连接"}
                </button>
                {editingId && (
                  <button
                    className="btn"
                    onClick={() => {
                      setEditingId(null);
                      setFormName("");
                      setFormUrl("https://gitlab.com");
                      setFormToken("");
                      setSourceTestMsg("");
                      setSourceTestError("");
                    }}
                  >
                    取消编辑
                  </button>
                )}
              </div>

              {sourceTestMsg && <div className="success-msg">{sourceTestMsg}</div>}
              {sourceTestError && <div className="error-msg">{sourceTestError}</div>}
            </div>

            {/* Polling Interval */}
            <div
              style={{
                background: "var(--bg-card)",
                padding: "16px",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
              }}
            >
              <h3>⏱️ 轮询同步配置</h3>
              <div className="form-group">
                <label>全局后台轮询间隔（秒）</label>
                <input
                  type="number"
                  value={pollingInterval}
                  onChange={(e) => setPollingInterval(parseInt(e.target.value) || 60)}
                  min={10}
                  max={3600}
                />
              </div>
              <button className="btn btn-primary" onClick={handleSaveInterval}>
                保存轮询间隔
              </button>
            </div>
          </section>
        )}

        {activeSection === "repos" && (
          <section className="section">
            <h2>📂 监听仓库管理（精准隔离）</h2>

            {sources.length === 0 ? (
              <div className="empty-state">
                请先前往「源设置」添加至少一个 GitLab 源
              </div>
            ) : (
              <>
                <div className="source-selector">
                  <label>
                    <strong>当前操作的 GitLab 源：</strong>
                  </label>
                  <select
                    value={activeSourceId}
                    onChange={(e) => {
                      setActiveSourceId(e.target.value);
                      setSearchResults([]);
                    }}
                  >
                    {sources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.base_url})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="search-bar">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder={`在 [${getSourceName(activeSourceId)}] 中搜索项目...`}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={handleSearch}
                    disabled={isSearching}
                  >
                    {isSearching ? "搜索中..." : "🔍 搜索项目"}
                  </button>
                </div>

                {searchResults.length > 0 && (
                  <div className="search-results">
                    <h3>搜索结果</h3>
                    {searchResults.map((project) => {
                      const isWatched = watchedRepos.some(
                        (r) =>
                          r.source_id === activeSourceId &&
                          r.project_id === project.id
                      );
                      return (
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
                            disabled={isWatched}
                          >
                            {isWatched ? "已监听" : "+ 监听此仓库"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="watched-repos">
                  <h3>已监听的固定仓库 ({watchedRepos.length})</h3>
                  {watchedRepos.length === 0 ? (
                    <div className="empty-state">
                      还没有监听任何仓库，请使用上方搜索框添加
                    </div>
                  ) : (
                    watchedRepos.map((repo) => (
                      <div
                        key={`${repo.source_id}-${repo.project_id}`}
                        className="repo-item"
                      >
                        <div className="repo-info">
                          <div>
                            <span className="source-badge">
                              {getSourceName(repo.source_id)}
                            </span>
                            <strong>📦 {repo.name}</strong>
                          </div>
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
                            onClick={() =>
                              handleRemoveRepo(repo.source_id, repo.project_id)
                            }
                            title="取消监听该仓库"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {activeSection === "notes" && (
          <section className="section">
            <h2>📝 便笺管理</h2>

            <div className="color-picker">
              <label>默认新建便笺颜色：</label>
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
              <h3>活动桌面便笺 ({notes.length})</h3>
              {notes.length === 0 ? (
                <div className="empty-state">
                  还没有创建便笺，请前往「仓库管理」页面为特定仓库创建便笺
                </div>
              ) : (
                notes.map((note) => (
                  <div
                    key={note.id}
                    className="note-list-item"
                    style={{ borderLeftColor: note.color }}
                  >
                    <div>
                      <div>
                        <span className="source-badge">
                          {getSourceName(note.source_id)}
                        </span>
                        <strong>{note.repo_name}</strong>
                      </div>
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
