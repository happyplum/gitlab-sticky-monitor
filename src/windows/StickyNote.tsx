import { useEffect, useState, useRef, type CSSProperties } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import type { SerializedEditorState } from "lexical";
import { useGitLabAPI } from "../hooks/useGitLabAPI";
import { Icon } from "../components/Icon";
import { NoteSettingsPanel } from "../components/NoteSettingsPanel";
import { RichTextEditor } from "../components/RichTextEditor";
import { IssueCard } from "../components/IssueCard";
import { MergeRequestCard } from "../components/MergeRequestCard";
import { NOTE_FEEDS } from "../constants";
import type { NoteConfig, NoteFilters, GitLabUpdate, GitLabUser, Issue, MergeRequest, Todo } from "../types/gitlab";
import { openUrl } from "../utils";
import { createNoteSaver, type SaveStatus } from "./noteSaver";
import "../styles/sticky-note.css";

export function StickyNote({ noteId }: { noteId: string }) {
  const [note, setNote] = useState<NoteConfig | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    invoke<NoteConfig | null>("get_note_config", { noteId }).then(value => {
      if (!live) return;
      if (value) setNote(value); else setError("便笺不存在");
    }).catch(error => { if (live) setError(String(error)); });
    return () => { live = false; };
  }, [noteId]);
  if (!note) return <div className="note-loading" role={error ? "alert" : "status"}>{error || "正在打开便笺…"}</div>;
  return <NoteWindow key={note.id} initialNote={note} />;
}

function NoteWindow({ initialNote }: { initialNote: NoteConfig }) {
  const api = useGitLabAPI();
  const [note, setNote] = useState(initialNote);
  const [appWindow] = useState(getCurrentWindow);
  const [focused, setFocused] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const activity = useRef({ closing: false, exiting: false });
  const closingTask = useRef<Promise<void> | null>(null);
  const resizingTask = useRef<Promise<void>>(Promise.resolve());
  const [error, setError] = useState("");
  const editorFailed = useRef(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ state: "saved" });
  const [sourceName, setSourceName] = useState("");
  const [updated, setUpdated] = useState("");
  const [refresh, setRefresh] = useState(0);
  const geometry = useRef({ position: initialNote.position, size: initialNote.size });
  const [draft] = useState(() => createNoteSaver<SerializedEditorState>(
    document => api.saveNoteDocument(initialNote.id, document), setSaveStatus));
  const [geometrySaver] = useState(() => createNoteSaver<typeof geometry.current>(async value => {
    await invoke("update_note_position", { noteId: initialNote.id, ...value.position });
    await invoke("update_note_size", { noteId: initialNote.id, ...value.size });
  }, status => { if (status.state === "error") setError(status.error || "位置保存失败"); }));

  function freeze(reason: "closing" | "exiting", value: boolean) {
    activity.current[reason] = value;
    setBusy(activity.current.closing || activity.current.exiting);
  }
  async function flush() {
    if (editorFailed.current) throw Error("文字编辑器发生错误，尚未保存，请保留窗口中的内容");
    await draft.flush();
    await resizingTask.current;
    await geometrySaver.flush();
  }
  function close() {
    if (activity.current.closing || activity.current.exiting) return;
    freeze("closing", true);
    closingTask.current = (async () => {
      try { await flush(); await api.hideNote(note.id); setError(""); }
      catch (error) { setError(String(error)); }
      finally { freeze("closing", false); }
    })();
    return closingTask.current;
  }

  useEffect(() => {
    const listeners = [
      appWindow.onFocusChanged(({ payload }) => { setFocused(payload); if (!payload) setShowSettings(false); }),
      appWindow.onMoved(({ payload }) => {
        geometry.current = { ...geometry.current, position: { x: payload.x, y: payload.y } };
        geometrySaver.set(geometry.current);
      }),
      appWindow.onResized(({ payload }) => {
        const resize = async () => {
          const size = payload.toLogical(await appWindow.scaleFactor());
          geometry.current = { ...geometry.current, size: { w: size.width, h: size.height } };
          geometrySaver.set(geometry.current);
        };
        // Keep conversions ordered and include the last pending resize in close/exit flushes.
        resizingTask.current = resizingTask.current.then(resize, resize);
        void resizingTask.current.catch(error => setError(String(error)));
      }),
      listen("request-note-close", () => { void close(); }),
      listen<string>("prepare-exit", async ({ payload }) => {
        freeze("exiting", true);
        let failure: string | null = null;
        try { await closingTask.current; await flush(); } catch (error) { failure = String(error); setError(failure); }
        await invoke("acknowledge_exit", { requestId: payload, error: failure });
      }),
      listen<string>("exit-cancelled", ({ payload }) => { freeze("exiting", false); setError(payload); }),
    ];
    appWindow.isFocused().then(setFocused).catch(error => setError(String(error)));
    return () => { listeners.forEach(listener => { void listener.then(unlisten => unlisten()); }); };
  }, [appWindow, draft, geometrySaver]);

  useEffect(() => {
    if (note.kind !== "gitlab") return;
    const sourceId = note.source_id;
    api.getSources().then(sources => setSourceName(sources.find(source => source.id === sourceId)?.name || "源已移除"))
      .catch(error => setError(String(error)));
  }, [note.kind === "gitlab" ? note.source_id : null]);

  async function update(params: { color?: string; alwaysOnTop?: boolean; onlyAssignedToMe?: boolean; labels?: string[] }) {
    try {
      await api.updateNoteConfig({ noteId: note.id, ...params });
      const saved = await api.getNoteConfig(note.id);
      if (saved) setNote(saved);
      setError("");
    } catch (error) { setError(String(error)); }
  }
  const title = note.kind === "custom" ? "自定义便笺" : `${NOTE_FEEDS[note.feed]} · ${note.repo_name}`;
  const changeFilters = (filters: NoteFilters) => { void update({ onlyAssignedToMe: filters.only_assigned_to_me, labels: filters.labels }); };

  return <div className={`sticky-note ${focused ? "is-focused" : ""}`} style={{ "--note-color": note.color } as CSSProperties}
    onPointerDown={() => setFocused(true)} onFocusCapture={() => setFocused(true)}>
    <div className="note-header" data-tauri-drag-region>
      <span className="note-title" title={title} data-tauri-drag-region>{title}</span>
      <div className="note-controls note-tools">
        <button className="note-btn" aria-label="便笺设置" title="便笺设置" disabled={busy} onClick={() => setShowSettings(true)}><Icon name="settings" /></button>
        <button className={`note-btn ${note.always_on_top ? "active" : ""}`} aria-label={note.always_on_top ? "取消置顶" : "置顶"}
          aria-pressed={note.always_on_top} title={note.always_on_top ? "取消置顶" : "置顶"} disabled={busy}
          onClick={() => void update({ alwaysOnTop: !note.always_on_top })}><Icon name="pin" /></button>
        <button className="note-btn close-btn" aria-label="收起便笺" title="收起便笺，内容会保留" disabled={busy} onClick={() => void close()}><Icon name="close" /></button>
      </div>
    </div>
    {note.kind === "custom"
      ? <RichTextEditor initialDocument={note.document} disabled={busy || editorFailed.current}
          status={busy ? "正在保存…" : saveStatus.state === "saving" ? "保存中…" : saveStatus.state === "error" ? "尚未保存" : "已保存"}
          onChange={document => { if (!editorFailed.current) draft.set(document); }}
          onError={error => { editorFailed.current = true; setError(error.message); }} />
      : <GitLabContents note={note} refresh={refresh} onUpdated={setUpdated} />}
    {(error || saveStatus.state === "error") && <div className="note-error" role="alert">
      <span>{error || `尚未保存：${saveStatus.error}`}</span>
      {!editorFailed.current && <button className="btn btn-small" disabled={busy} onClick={() => { void flush().then(() => setError("")).catch(error => setError(String(error))); }}>重试保存</button>}
    </div>}
    {note.kind === "gitlab" && <div className="note-footer">
        <div className="note-context"><span className="note-source" title={sourceName}>{sourceName}</span>
          <span className="note-updated">{updated ? `更新于 ${new Date(updated).toLocaleTimeString()}` : "尚未同步"}</span></div>
        <button className="note-btn note-tools" aria-label="刷新" title="刷新" disabled={busy} onClick={() => setRefresh(value => value + 1)}><Icon name="refresh" /></button>
    </div>}
    {showSettings && focused && <NoteSettingsPanel currentColor={note.color}
      filters={note.kind === "gitlab" && note.feed !== "todos" ? note.filters : undefined}
      onChangeColor={color => void update({ color })} onChangeFilters={changeFilters} onClose={() => setShowSettings(false)} />}
    <div className="resize-handle" title="拖拽调整大小" onPointerDown={() => void appWindow.startResizeDragging("SouthEast").catch(error => setError(String(error)))} />
  </div>;
}

function GitLabContents({ note, refresh, onUpdated }: {
  note: Extract<NoteConfig, { kind: "gitlab" }>;
  refresh: number;
  onUpdated: (time: string) => void;
}) {
  const api = useGitLabAPI();
  const [data, setData] = useState<{ issues: Issue[]; mrs: MergeRequest[]; todos: Todo[] }>({ issues: [], mrs: [], todos: [] });
  const [user, setUser] = useState<GitLabUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { source_id: sourceId, repo_id: repoId, feed, filters } = note;
  useEffect(() => {
    let live = true;
    let generation = 0;
    const load = async () => {
      const request = ++generation;
      setLoading(true);
      try {
        if (feed === "issues") {
          const items = await api.getIssues(repoId, "opened", undefined, undefined, sourceId);
          if (live && request === generation) setData({ issues: items, mrs: [], todos: [] });
        } else if (feed === "mrs") {
          const items = await api.getMergeRequests(repoId, "opened", undefined, sourceId);
          if (live && request === generation) setData({ issues: [], mrs: items, todos: [] });
        } else {
          const items = await api.getTodos(repoId, sourceId);
          if (live && request === generation) setData({ issues: [], mrs: [], todos: items });
        }
        if (live && request === generation) { onUpdated(new Date().toISOString()); setError(""); }
      } catch (error) { if (live && request === generation) setError(String(error)); }
      finally { if (live && request === generation) setLoading(false); }
    };
    void load();
    const events = [
      listen<GitLabUpdate>("gitlab-update", ({ payload }) => {
        if (payload.source_id !== sourceId || payload.repo_id !== String(repoId)) return;
        generation++;
        setData({ issues: payload.issues, mrs: payload.merge_requests, todos: payload.my_todos });
        onUpdated(payload.timestamp);
        setLoading(false);
        setError("");
      }),
      listen("force-refresh", () => { void load(); }),
    ];
    return () => { live = false; events.forEach(event => { void event.then(unlisten => unlisten()); }); };
  }, [sourceId, repoId, feed, refresh, onUpdated]);
  useEffect(() => {
    if (!filters.only_assigned_to_me || feed === "todos") return;
    let live = true;
    api.getCurrentUser(sourceId).then(user => { if (live) setUser(user); }).catch(error => { if (live) setError(String(error)); });
    return () => { live = false; };
  }, [sourceId, feed, filters.only_assigned_to_me]);

  const matches = (item: Issue | MergeRequest) => {
    if (filters.only_assigned_to_me) {
      if (!user) return false;
      const name = user.username.toLowerCase();
      if (item.author.username.toLowerCase() !== name && !item.assignees.some(person => person.username.toLowerCase() === name)
        && !("reviewers" in item && item.reviewers.some(person => person.username.toLowerCase() === name))) return false;
    }
    return !filters.labels.length || filters.labels.some(label => item.labels.some(value => value.toLowerCase().includes(label.toLowerCase())));
  };
  const issues = data.issues.filter(matches), mrs = data.mrs.filter(matches);
  const count = feed === "issues" ? issues.length : feed === "mrs" ? mrs.length : data.todos.length;
  return <div className="note-content">
    {error && <div className="note-error" role="alert">{error}</div>}
    {loading ? <div className="loading" role="status">加载中…</div> : count === 0
      ? <div className="empty">暂无符合条件的{NOTE_FEEDS[feed]}</div>
      : feed === "issues" ? issues.slice(0, 15).map(issue => <IssueCard key={issue.id} issue={issue} />)
      : feed === "mrs" ? mrs.slice(0, 15).map(mr => <MergeRequestCard key={mr.id} mr={mr} />)
      : data.todos.slice(0, 15).map(todo => <button type="button" key={todo.id} className="todo-item" onClick={() => void openUrl(todo.target_url)}>
          <span className="todo-body">{todo.body}</span>
        </button>)}
  </div>;
}
