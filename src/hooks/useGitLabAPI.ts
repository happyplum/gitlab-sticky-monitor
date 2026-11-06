import { invoke } from "@tauri-apps/api/core";
import type {
  GitLabUser,
  Project,
  Issue,
  MergeRequest,
  Todo,
  WatchedRepo,
  SettingsResponse,
  GitLabSource,
  NoteConfig,
  NoteFeed,
} from "../types/gitlab";

export function useGitLabAPI() {
  const getSources = async () => {
    return invoke<GitLabSource[]>("get_sources");
  };

  const saveSource = async (source: GitLabSource) => {
    return invoke<GitLabSource>("save_source", { source });
  };

  const deleteSource = async (sourceId: string) => {
    return invoke<void>("delete_source", { sourceId });
  };

  const testSourceConnection = async (baseUrl: string, token: string) => {
    return invoke<GitLabUser>("test_source_connection", {
      baseUrl,
      token,
    });
  };

  const testConnection = async (baseUrl: string, token: string) => {
    return testSourceConnection(baseUrl, token);
  };

  const getCurrentUser = async (sourceId?: string) => {
    return invoke<GitLabUser>("get_current_user", { sourceId: sourceId ?? null });
  };

  const searchProjects = async (query: string, sourceId?: string) => {
    return invoke<Project[]>("get_projects", {
      query,
      sourceId: sourceId ?? null,
    });
  };

  const getIssues = async (
    projectId: number,
    state?: string,
    assignee?: string,
    labels?: string,
    sourceId?: string
  ) => {
    return invoke<Issue[]>("get_issues", {
      projectId,
      state: state ?? null,
      assignee: assignee ?? null,
      labels: labels ?? null,
      sourceId: sourceId ?? null,
    });
  };

  const getMergeRequests = async (
    projectId: number,
    state?: string,
    reviewer?: string,
    sourceId?: string
  ) => {
    return invoke<MergeRequest[]>("get_merge_requests", {
      projectId,
      state: state ?? null,
      reviewer: reviewer ?? null,
      sourceId: sourceId ?? null,
    });
  };

  const getTodos = async (projectId?: number, sourceId?: string) => {
    return invoke<Todo[]>("get_todos", {
      projectId: projectId ?? null,
      sourceId: sourceId ?? null,
    });
  };

  const addComment = async (
    projectId: number,
    targetType: string,
    targetIid: number,
    body: string,
    sourceId?: string
  ) => {
    return invoke("add_comment", {
      projectId,
      targetType,
      targetIid,
      body,
      sourceId: sourceId ?? null,
    });
  };

  const getSettings = async () => {
    return invoke<SettingsResponse>("get_settings");
  };

  const saveSettings = async (pollingIntervalSecs?: number) => {
    return invoke("save_settings", {
      pollingIntervalSecs: pollingIntervalSecs ?? null,
    });
  };

  const getWatchedRepos = async () => {
    return invoke<WatchedRepo[]>("get_watched_repos");
  };

  const addWatchedRepo = async (repo: WatchedRepo) => {
    return invoke("add_watched_repo", {
      sourceId: repo.source_id,
      projectId: repo.project_id,
      name: repo.name,
      path: repo.path,
      webUrl: repo.web_url,
    });
  };

  const removeWatchedRepo = async (sourceId: string, projectId: number) => {
    return invoke("remove_watched_repo", { sourceId, projectId });
  };

  const getNoteConfig = async (noteId: string) => {
    return invoke<NoteConfig | null>("get_note_config", { noteId });
  };

  const updateNoteSize = async (noteId: string, w: number, h: number) => {
    return invoke("update_note_size", { noteId, w, h });
  };

  const updateNoteConfig = async (params: {
    noteId: string;
    color?: string;
    alwaysOnTop?: boolean;
    onlyAssignedToMe?: boolean;
    labels?: string[];
  }) => {
    return invoke("update_note_config", params);
  };

  return {
    createNote: (sourceId: string, repoId: number, feed: NoteFeed, color: string) =>
      invoke<string>("create_note", { sourceId, repoId, feed, color }),
    createCustomNote: (color: string) => invoke<string>("create_custom_note", { color }),
    openNote: (noteId: string) => invoke<void>("open_note", { noteId }),
    hideNote: (noteId: string) => invoke<void>("hide_note", { noteId }),
    removeNote: (noteId: string) => invoke<void>("remove_note", { noteId }),
    getAllNotes: () => invoke<NoteConfig[]>("get_all_notes"),
    saveNoteDocument: (noteId: string, document: import("lexical").SerializedEditorState) =>
      invoke<void>("save_note_document", { noteId, document }),
    getSources,
    saveSource,
    deleteSource,
    testSourceConnection,
    testConnection,
    getCurrentUser,
    searchProjects,
    getIssues,
    getMergeRequests,
    getTodos,
    addComment,
    getSettings,
    saveSettings,
    getWatchedRepos,
    addWatchedRepo,
    removeWatchedRepo,
    getNoteConfig,
    updateNoteSize,
    updateNoteConfig,
  };
}
