import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  type CSSProperties,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { useGitLabAPI } from "../hooks/useGitLabAPI";
import { IssueCard } from "../components/IssueCard";
import { MergeRequestCard } from "../components/MergeRequestCard";
import { Icon } from "../components/Icon";
import {
  NoteSettingsPanel,
  type NoteFilterState,
} from "../components/NoteSettingsPanel";
import type {
  Issue,
  MergeRequest,
  Todo,
  GitLabUpdate,
  GitLabUser,
} from "../types/gitlab";
import { formatTimeAgo } from "../utils";
import "../styles/sticky-note.css";

interface StickyNoteProps {
  sourceId?: string;
  repoId: string;
  repoName: string;
  noteColor: string;
  noteId: string;
}

export function StickyNote({
  sourceId,
  repoId,
  repoName,
  noteColor: initialColor,
  noteId,
}: StickyNoteProps) {
  const api = useGitLabAPI();
  const [effectiveSourceId, setEffectiveSourceId] = useState<string>(
    sourceId || "",
  );
  const [sourceName, setSourceName] = useState<string>("");
  const [currentColor, setCurrentColor] = useState(initialColor);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [mergeRequests, setMergeRequests] = useState<MergeRequest[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [isPinned, setIsPinned] = useState(true);
  const [isMiniMode, setIsMiniMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<GitLabUser | null>(null);

  const [filters, setFilters] = useState<NoteFilterState>({
    show_issues: true,
    show_mrs: true,
    only_assigned_to_me: false,
    labels: [],
  });

  const [activeTab, setActiveTab] = useState<"issues" | "mrs" | "todos">(
    "issues",
  );
  const appWindow = getCurrentWindow();
  const prevHeightRef = useRef<number>(450);
  const isMiniModeRef = useRef<boolean>(false);
  const resizeTimerRef = useRef<any>(null);

  isMiniModeRef.current = isMiniMode;

  useEffect(() => {
    if (sourceId) {
      setEffectiveSourceId(sourceId);
    }
  }, [sourceId]);

  // Load user info and note config on mount
  useEffect(() => {
    api
      .getCurrentUser(effectiveSourceId || undefined)
      .then((u) => setCurrentUser(u))
      .catch(() => {});

    api
      .getNoteConfig(noteId)
      .then((cfg) => {
        if (cfg) {
          if (cfg.color) setCurrentColor(cfg.color);
          if (cfg.source_id && !effectiveSourceId) {
            setEffectiveSourceId(cfg.source_id);
          }
          setIsPinned(cfg.always_on_top);
          if (cfg.filters) {
            setFilters({
              show_issues: cfg.filters.show_issues,
              show_mrs: cfg.filters.show_mrs,
              only_assigned_to_me: cfg.filters.only_assigned_to_me,
              labels: cfg.filters.labels || [],
            });
          }
        }
      })
      .catch((err) => {
        console.error("Failed to load note config:", err);
      });
  }, [noteId, effectiveSourceId]);

  // Fetch source name
  useEffect(() => {
    if (effectiveSourceId) {
      api
        .getSources()
        .then((srcs) => {
          const found = srcs.find((s) => s.id === effectiveSourceId);
          if (found) setSourceName(found.name);
        })
        .catch(() => {});
    }
  }, [effectiveSourceId]);

  // Adjust active tab if current tab is hidden by filter
  useEffect(() => {
    if (!filters.show_issues && activeTab === "issues") {
      setActiveTab(filters.show_mrs ? "mrs" : "todos");
    } else if (!filters.show_mrs && activeTab === "mrs") {
      setActiveTab(filters.show_issues ? "issues" : "todos");
    }
  }, [filters.show_issues, filters.show_mrs, activeTab]);

  // Initial data load
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const projectId = parseInt(repoId);
      const [issueData, mrData, todoData] = await Promise.all([
        api.getIssues(
          projectId,
          "opened",
          undefined,
          undefined,
          effectiveSourceId || undefined,
        ),
        api.getMergeRequests(
          projectId,
          "opened",
          undefined,
          effectiveSourceId || undefined,
        ),
        api.getTodos(projectId, effectiveSourceId || undefined),
      ]);
      setIssues(issueData);
      setMergeRequests(mrData);
      setTodos(todoData);
      setLastUpdate(new Date().toISOString());
    } catch (err) {
      console.error("Failed to load data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [repoId, effectiveSourceId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Listen for polling updates
  useEffect(() => {
    const unlisten = listen<GitLabUpdate>("gitlab-update", (event) => {
      const matchRepo = event.payload.repo_id === repoId;
      const matchSource =
        !effectiveSourceId ||
        !event.payload.source_id ||
        event.payload.source_id === effectiveSourceId;

      if (matchRepo && matchSource) {
        setIssues(event.payload.issues);
        setMergeRequests(event.payload.merge_requests);
        setTodos(event.payload.my_todos);
        setLastUpdate(event.payload.timestamp);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [repoId, effectiveSourceId]);

  // Listen for force refresh
  useEffect(() => {
    const unlisten = listen("force-refresh", () => {
      loadData();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadData]);

  const togglePin = async () => {
    const next = !isPinned;
    setIsPinned(next);
    await appWindow.setAlwaysOnTop(next);
    await api.updateNoteConfig({
      noteId,
      alwaysOnTop: next,
    });
  };

  const toggleMiniMode = async () => {
    if (isMiniMode) {
      // Restore expanded size
      const currentSize = await appWindow.innerSize();
      const scale = window.devicePixelRatio || 1;
      const logicalW = Math.round(currentSize.width / scale);
      const targetH = prevHeightRef.current > 120 ? prevHeightRef.current : 450;
      await appWindow.setSize(new LogicalSize(logicalW, targetH));
      setIsMiniMode(false);
    } else {
      // Collapse to mini size
      const currentSize = await appWindow.innerSize();
      const scale = window.devicePixelRatio || 1;
      prevHeightRef.current = Math.round(currentSize.height / scale);
      const logicalW = Math.round(currentSize.width / scale);
      await appWindow.setSize(new LogicalSize(logicalW, 38));
      setIsMiniMode(true);
      setShowSettings(false);
    }
  };

  const handleClose = async () => {
    await invoke("remove_note", { noteId });
  };

  const handleChangeColor = async (color: string) => {
    setCurrentColor(color);
    await api.updateNoteConfig({
      noteId,
      color,
    });
  };

  const handleChangeFilters = async (newFilters: NoteFilterState) => {
    setFilters(newFilters);
    await api.updateNoteConfig({
      noteId,
      showIssues: newFilters.show_issues,
      showMrs: newFilters.show_mrs,
      onlyAssignedToMe: newFilters.only_assigned_to_me,
      labels: newFilters.labels,
    });
  };

  // Save position on move
  useEffect(() => {
    const unlisten = appWindow.onMoved(async (event) => {
      await invoke("update_note_position", {
        noteId,
        x: event.payload.x,
        y: event.payload.y,
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [noteId, appWindow]);

  // Save size on resize (debounced)
  useEffect(() => {
    const unlisten = appWindow.onResized((event) => {
      if (isMiniModeRef.current) return;
      clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(async () => {
        const scale = window.devicePixelRatio || 1;
        const w = Math.round(event.payload.width / scale);
        const h = Math.round(event.payload.height / scale);
        if (w >= 200 && h >= 120) {
          await api.updateNoteSize(noteId, w, h);
        }
      }, 400);
    });
    return () => {
      clearTimeout(resizeTimerRef.current);
      unlisten.then((fn) => fn());
    };
  }, [noteId, appWindow]);

  // Filtered issues calculation
  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      if (filters.only_assigned_to_me && currentUser?.username) {
        const myName = currentUser.username.toLowerCase();
        const isAssignee = issue.assignees?.some(
          (a) => a.username.toLowerCase() === myName,
        );
        const isAuthor = issue.author?.username.toLowerCase() === myName;
        if (!isAssignee && !isAuthor) return false;
      }

      if (filters.labels.length > 0) {
        const matchesLabel = filters.labels.some((lbl) =>
          issue.labels?.some((il) =>
            il.toLowerCase().includes(lbl.toLowerCase()),
          ),
        );
        if (!matchesLabel) return false;
      }

      return true;
    });
  }, [issues, filters, currentUser]);

  // Filtered MRs calculation
  const filteredMergeRequests = useMemo(() => {
    return mergeRequests.filter((mr) => {
      if (filters.only_assigned_to_me && currentUser?.username) {
        const myName = currentUser.username.toLowerCase();
        const isAssignee = mr.assignees?.some(
          (a) => a.username.toLowerCase() === myName,
        );
        const isReviewer = mr.reviewers?.some(
          (r) => r.username.toLowerCase() === myName,
        );
        const isAuthor = mr.author?.username.toLowerCase() === myName;
        if (!isAssignee && !isReviewer && !isAuthor) return false;
      }

      if (filters.labels.length > 0) {
        const matchesLabel = filters.labels.some((lbl) =>
          mr.labels?.some((ml) => ml.toLowerCase().includes(lbl.toLowerCase())),
        );
        if (!matchesLabel) return false;
      }

      return true;
    });
  }, [mergeRequests, filters, currentUser]);

  // Active filter description
  const activeFilterNotice = useMemo(() => {
    const parts: string[] = [];
    if (filters.only_assigned_to_me) parts.push("与我相关");
    if (filters.labels.length > 0)
      parts.push(`标签: ${filters.labels.join(",")}`);
    return parts.join(" | ");
  }, [filters]);

  return (
    <div
      className={`sticky-note ${isMiniMode ? "mini" : ""}`}
      style={{ "--note-color": currentColor } as CSSProperties}
    >
      {/* Title Bar */}
      <div className="note-header" data-tauri-drag-region>
        <div className="note-title-wrap" data-tauri-drag-region>
          <span className="note-title" data-tauri-drag-region title={repoName}>
            {repoName}
          </span>
          {sourceName && (
            <span
              className="note-source-tag"
              data-tauri-drag-region
              title={`所属 GitLab 源: ${sourceName}`}
            >
              {sourceName}
            </span>
          )}
          {isMiniMode && (
            <div className="mini-badges" data-tauri-drag-region>
              {filters.show_issues && (
                <span
                  className={`mini-badge ${filteredIssues.length > 0 ? "has-count" : ""}`}
                  title={`${filteredIssues.length} 个开放 Issues`}
                >
                  I: {filteredIssues.length}
                </span>
              )}
              {filters.show_mrs && (
                <span
                  className={`mini-badge ${filteredMergeRequests.length > 0 ? "has-count" : ""}`}
                  title={`${filteredMergeRequests.length} 个开放 MR`}
                >
                  M: {filteredMergeRequests.length}
                </span>
              )}
              {todos.length > 0 && (
                <span
                  className="mini-badge has-count"
                  title={`${todos.length} 个待办`}
                >
                  T: {todos.length}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="note-controls">
          {!isMiniMode && (
            <button
              className={`note-btn ${showSettings ? "active" : ""}`}
              onClick={() => setShowSettings(!showSettings)}
              title="便笺设置与过滤"
              aria-label="便笺设置与过滤"
              aria-expanded={showSettings}
            >
              <Icon name="settings" />
            </button>
          )}
          <button
            className="note-btn"
            onClick={toggleMiniMode}
            title={isMiniMode ? "展开便笺" : "折叠为小条"}
            aria-label={isMiniMode ? "展开便笺" : "折叠为小条"}
            aria-expanded={!isMiniMode}
          >
            <Icon name={isMiniMode ? "down" : "up"} />
          </button>
          <button
            className={`note-btn ${isPinned ? "active" : ""}`}
            onClick={togglePin}
            title={isPinned ? "取消置顶" : "置顶"}
            aria-label={isPinned ? "取消置顶" : "置顶"}
            aria-pressed={isPinned}
          >
            <Icon name="pin" />
          </button>
          <button
            className="note-btn close-btn"
            onClick={handleClose}
            title="关闭"
            aria-label="关闭便笺"
          >
            <Icon name="close" />
          </button>
        </div>
      </div>

      {/* Main Content (Hidden in Mini Mode) */}
      {!isMiniMode && (
        <>
          {/* Active Filter Indicator */}
          {activeFilterNotice && (
            <div className="filter-active-bar">
              <Icon name="filter" />
              <span className="filter-active-text" title={activeFilterNotice}>
                {activeFilterNotice}
              </span>
              <button
                className="note-btn filter-reset"
                onClick={() =>
                  handleChangeFilters({
                    ...filters,
                    only_assigned_to_me: false,
                    labels: [],
                  })
                }
                title="清除过滤"
              >
                重置
              </button>
            </div>
          )}

          {/* Tabs */}
          <div className="note-tabs">
            {filters.show_issues && (
              <button
                className={`tab ${activeTab === "issues" ? "active" : ""}`}
                aria-pressed={activeTab === "issues"}
                onClick={() => setActiveTab("issues")}
              >
                Issues{" "}
                <span className="tab-count">{filteredIssues.length}</span>
              </button>
            )}
            {filters.show_mrs && (
              <button
                className={`tab ${activeTab === "mrs" ? "active" : ""}`}
                aria-pressed={activeTab === "mrs"}
                onClick={() => setActiveTab("mrs")}
              >
                MR{" "}
                <span className="tab-count">
                  {filteredMergeRequests.length}
                </span>
              </button>
            )}
            <button
              className={`tab ${activeTab === "todos" ? "active" : ""}`}
              aria-pressed={activeTab === "todos"}
              onClick={() => setActiveTab("todos")}
            >
              待办 <span className="tab-count">{todos.length}</span>
            </button>
          </div>

          {/* Content Area */}
          <div className="note-content">
            {isLoading ? (
              <div className="loading" role="status">
                <Icon name="refresh" />
                加载中...
              </div>
            ) : activeTab === "issues" ? (
              filteredIssues.length > 0 ? (
                filteredIssues
                  .slice(0, 15)
                  .map((issue) => <IssueCard key={issue.id} issue={issue} />)
              ) : (
                <div className="empty">
                  <Icon name="issue" />
                  暂无符合条件的 Issue
                </div>
              )
            ) : activeTab === "mrs" ? (
              filteredMergeRequests.length > 0 ? (
                filteredMergeRequests
                  .slice(0, 15)
                  .map((mr) => <MergeRequestCard key={mr.id} mr={mr} />)
              ) : (
                <div className="empty">
                  <Icon name="merge" />
                  暂无符合条件的合并请求
                </div>
              )
            ) : todos.length > 0 ? (
              todos.slice(0, 15).map((todo) => (
                <button
                  type="button"
                  key={todo.id}
                  className="todo-item"
                  onClick={() => window.open(todo.target_url)}
                >
                  <span className="todo-action">
                    <Icon name="message" />
                    {todo.action_name}
                  </span>
                  <span className="todo-body" title={todo.body}>
                    {todo.body.slice(0, 60)}
                  </span>
                  <span className="todo-time">
                    {formatTimeAgo(todo.created_at)}
                  </span>
                </button>
              ))
            ) : (
              <div className="empty">
                <Icon name="check" />
                暂无待办事项
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="note-footer">
            <span>
              {lastUpdate
                ? `更新于 ${new Date(lastUpdate).toLocaleTimeString()}`
                : ""}
            </span>
            <button
              className="refresh-btn"
              onClick={loadData}
              title="刷新"
              aria-label="刷新"
            >
              <Icon name="refresh" />
            </button>
          </div>

          {/* In-Note Settings Overlay */}
          {showSettings && (
            <NoteSettingsPanel
              currentColor={currentColor}
              filters={filters}
              onChangeColor={handleChangeColor}
              onChangeFilters={handleChangeFilters}
              onClose={() => setShowSettings(false)}
            />
          )}

          {/* Resize Handles */}
          <div
            className="resize-border-right"
            onMouseDown={() => appWindow.startResizeDragging("East")}
          />
          <div
            className="resize-border-bottom"
            onMouseDown={() => appWindow.startResizeDragging("South")}
          />
          <div
            className="resize-handle"
            title="拖拽调整大小"
            onMouseDown={(e) => {
              e.preventDefault();
              appWindow.startResizeDragging("SouthEast");
            }}
          />
        </>
      )}
    </div>
  );
}
