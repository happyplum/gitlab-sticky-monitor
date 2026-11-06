import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useGitLabAPI } from "../hooks/useGitLabAPI";
import { Icon } from "../components/Icon";
import type {
  GitLabSource,
  Project,
  WatchedRepo,
  NoteConfig,
  NoteFeed,
} from "../types/gitlab";
import "../styles/global.css";

import { NOTE_COLORS, NOTE_FEEDS } from "../constants";

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
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteError, setNoteError] = useState("");

  const [activeSection, setActiveSection] = useState<
    "settings" | "repos" | "notes"
  >("settings");

  // Load initial data
  useEffect(() => {
    loadSources();
    loadRepos();
    loadNotes();
    const events = [
      listen("notes-changed", () => { void loadNotes(); }),
      listen<string>("navigate", ({ payload }) => { if (payload === "new-note") setActiveSection("notes"); }),
      listen<string>("exit-cancelled", ({ payload }) => setNoteError(payload)),
    ];
    return () => { events.forEach(event => { void event.then(unlisten => unlisten()); }); };
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
      const n = await api.getAllNotes();
      setNotes(n);
    } catch (error) {
      setNoteError(String(error));
    }
  };

  const handleTestSource = async (baseUrl: string, token: string) => {
    setIsTestingSource(true);
    setSourceTestMsg("");
    setSourceTestError("");
    try {
      const user = await api.testSourceConnection(baseUrl, token);
      setSourceTestMsg(`连接成功！欢迎，${user.name} (@${user.username})`);
    } catch (e) {
      setSourceTestError(`连接失败: ${String(e)}`);
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

  const handleCreateNote = async (repo: WatchedRepo, feed: NoteFeed) => {
    setNoteBusy(true);
    try {
      await api.createNote(repo.source_id, repo.project_id, feed, selectedColor);
      await loadNotes();
      setNoteError("");
    } catch (e) {
      setNoteError(String(e));
    } finally { setNoteBusy(false); }
  };

  const handleRemoveNote = async (noteId: string) => {
    if (!confirm("永久删除这张便笺及其内容？此操作无法撤销。")) return;
    setNoteBusy(true);
    try {
      await api.removeNote(noteId);
      await loadNotes();
      setNoteError("");
    } catch (e) {
      setNoteError(String(e));
    } finally { setNoteBusy(false); }
  };

  const handleOpenNote = async (noteId?: string) => {
    setNoteBusy(true);
    try {
      if (noteId) await api.openNote(noteId); else await api.createCustomNote(selectedColor);
      setNoteError("");
      await loadNotes();
    } catch (error) { setNoteError(String(error)); }
    finally { setNoteBusy(false); }
  };

  const getSourceName = (sourceId: string) => {
    const s = sources.find((item) => item.id === sourceId);
    return s ? s.name : "默认源";
  };

  return (
    <div className="manager">
      <aside className="manager-sidebar">
        <header className="manager-brand">
          <span className="brand-mark">
            <Icon name="note" />
          </span>
          <div>
            <h1>GitLab 便笺</h1>
            <span>你的桌面工作空间</span>
          </div>
        </header>
        <nav className="manager-nav" aria-label="主导航">
          <button
            className={activeSection === "settings" ? "active" : ""}
            aria-current={activeSection === "settings" ? "page" : undefined}
            onClick={() => setActiveSection("settings")}
          >
            <Icon name="settings" /> 源设置
          </button>
          <button
            className={activeSection === "repos" ? "active" : ""}
            aria-current={activeSection === "repos" ? "page" : undefined}
            onClick={() => setActiveSection("repos")}
          >
            <Icon name="layers" /> 仓库管理
          </button>
          <button
            className={activeSection === "notes" ? "active" : ""}
            aria-current={activeSection === "notes" ? "page" : undefined}
            onClick={() => setActiveSection("notes")}
          >
            <Icon name="note" /> 桌面便笺
          </button>
        </nav>
        <div className="manager-summary">
          <span>{sources.length} 个 GitLab 源</span>
          <span>
            {watchedRepos.length} 个监听仓库 · {notes.length} 个便笺
          </span>
        </div>
      </aside>

      <main className="manager-content">
        {noteError && <div className="error-msg" role="alert">{noteError}</div>}
        {activeSection === "settings" && (
          <section className="section">
            <div className="section-heading">
              <h2>源设置</h2>
              <p>连接你的 GitLab，管理访问凭据与同步间隔。</p>
            </div>

            {/* List of existing sources */}
            <div className="source-list">
              <h3>
                已配置的连接{" "}
                <span className="section-count">{sources.length}</span>
              </h3>
              {sources.length === 0 ? (
                <div className="empty-state">
                  尚未配置任何 GitLab 源，请在下方添加第一个源
                </div>
              ) : (
                sources.map((s) => (
                  <div key={s.id} className="source-card">
                    <span className="entity-icon">
                      <Icon name="server" />
                    </span>
                    <div className="source-card-info">
                      <strong>{s.name}</strong>
                      <small>{s.base_url}</small>
                      <small>访问令牌：{s.token ? "已设置" : "未设置"}</small>
                    </div>
                    <div className="action-row">
                      <button
                        className="btn btn-small"
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
            <div className="settings-section">
              <h3>{editingId ? "编辑 GitLab 源" : "添加 GitLab 源"}</h3>
              <div className="form-group">
                <label htmlFor="source-name">源名称</label>
                <input
                  id="source-name"
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="例如: 公司内网 GitLab"
                />
              </div>
              <div className="form-group">
                <label htmlFor="source-url">GitLab 地址</label>
                <input
                  id="source-url"
                  type="text"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://gitlab.com 或 https://gitlab.company.com"
                />
              </div>
              <div className="form-group">
                <label htmlFor="source-token">
                  访问令牌（Personal Access Token）
                </label>
                <input
                  id="source-token"
                  type="password"
                  value={formToken}
                  onChange={(e) => setFormToken(e.target.value)}
                  placeholder="glpat-xxxxxxxxxxxx"
                />
                <small>
                  需要 <code>read_api</code> 权限，如需评论则需要{" "}
                  <code>api</code> 权限
                </small>
              </div>

              <div className="action-row">
                <button className="btn btn-primary" onClick={handleSaveSource}>
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

              {sourceTestMsg && (
                <div className="success-msg" role="status">
                  <Icon name="check" />
                  {sourceTestMsg}
                </div>
              )}
              {sourceTestError && (
                <div className="error-msg" role="alert">
                  <Icon name="issue" />
                  {sourceTestError}
                </div>
              )}
            </div>

            {/* Polling Interval */}
            <div className="settings-section">
              <h3>后台同步</h3>
              <div className="form-group">
                <label htmlFor="polling-interval">轮询间隔（秒）</label>
                <input
                  id="polling-interval"
                  type="number"
                  value={pollingInterval}
                  onChange={(e) =>
                    setPollingInterval(parseInt(e.target.value) || 60)
                  }
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
            <div className="section-heading">
              <h2>仓库管理</h2>
              <p>选择要关注的项目，为它们创建桌面便笺。</p>
            </div>

            {sources.length === 0 ? (
              <div className="empty-state">
                请先前往「源设置」添加至少一个 GitLab 源
              </div>
            ) : (
              <>
                <div className="source-selector">
                  <label htmlFor="repo-source">GitLab 源</label>
                  <select
                    id="repo-source"
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
                    aria-label="搜索项目"
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
                    <Icon name="search" />
                    {isSearching ? "搜索中..." : "搜索项目"}
                  </button>
                </div>

                {searchResults.length > 0 && (
                  <div className="search-results">
                    <h3>搜索结果</h3>
                    {searchResults.map((project) => {
                      const isWatched = watchedRepos.some(
                        (r) =>
                          r.source_id === activeSourceId &&
                          r.project_id === project.id,
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
                            <Icon name={isWatched ? "check" : "plus"} />
                            {isWatched ? "已监听" : "监听仓库"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="watched-repos">
                  <h3>
                    已监听的仓库{" "}
                    <span className="section-count">{watchedRepos.length}</span>
                  </h3>
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
                        <span className="entity-icon">
                          <Icon name="layers" />
                        </span>
                        <div className="repo-info">
                          <div>
                            <span className="source-badge">
                              {getSourceName(repo.source_id)}
                            </span>
                            <strong>{repo.name}</strong>
                          </div>
                          <small>{repo.path}</small>
                        </div>
                        <div className="repo-actions">
                          {(Object.keys(NOTE_FEEDS) as NoteFeed[]).map((feed) => (
                            <button
                              key={feed}
                              className="btn btn-small"
                              title={`创建 ${NOTE_FEEDS[feed]} 便笺`}
                              aria-label={`创建 ${NOTE_FEEDS[feed]} 便笺`}
                              onClick={() => handleCreateNote(repo, feed)}
                              disabled={noteBusy}
                            >
                              {NOTE_FEEDS[feed]}
                            </button>
                          ))}
                          <button
                            className="btn btn-small btn-danger"
                            onClick={() =>
                              handleRemoveRepo(repo.source_id, repo.project_id)
                            }
                            title="取消监听该仓库"
                            aria-label={`取消监听 ${repo.name}`}
                          >
                            <Icon name="trash" />
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
            <div className="section-heading">
              <h2>桌面便笺</h2>
              <p>把常看的项目放在桌面，随时掌握进展。</p>
            </div>

            <button className="btn btn-primary new-custom-note" disabled={noteBusy} onClick={() => void handleOpenNote()}>
              <Icon name="plus" /> 新建自定义便笺
            </button>

            <div className="color-picker">
              <span className="field-label">新建便笺颜色</span>
              <div className="color-options">
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c.value}
                    className={`color-swatch ${selectedColor === c.value ? "selected" : ""}`}
                    style={{ backgroundColor: c.value }}
                    onClick={() => setSelectedColor(c.value)}
                    title={c.name}
                    aria-label={c.name}
                    aria-pressed={selectedColor === c.value}
                  />
                ))}
              </div>
            </div>

            <div className="notes-list">
              <h3>
                全部便笺 <span className="section-count">{notes.length}</span>
              </h3>
              {notes.length === 0 ? (
                <div className="empty-state">
                  新建一张自定义便笺，或前往「仓库管理」创建 Issues、MR、待办便笺
                </div>
              ) : (
                notes.map((note) => (
                  <div
                    key={note.id}
                    className="note-list-item"
                    style={{ borderLeftColor: note.color }}
                  >
                    <div className="note-list-info">
                      <div>
                        {note.kind === "gitlab" && <span className="source-badge">{getSourceName(note.source_id)}</span>}
                        <strong>{note.kind === "gitlab" ? `${note.repo_name} · ${NOTE_FEEDS[note.feed]}` : "自定义便笺"}</strong>
                      </div>
                      <small>
                        {note.is_open ? "已打开" : "已收起，内容已保留"}
                      </small>
                    </div>
                    <div className="action-row">
                    <button className="btn btn-small" disabled={noteBusy} onClick={() => void handleOpenNote(note.id)}>
                      {note.is_open ? "显示" : "重新打开"}
                    </button>
                    <button
                      className="btn btn-small btn-danger"
                      onClick={() => handleRemoveNote(note.id)}
                      disabled={noteBusy}
                    >
                      <Icon name="trash" /> 删除
                    </button>
                    </div>
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
