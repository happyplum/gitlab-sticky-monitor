import { invoke } from "@tauri-apps/api/core";
import type {
  GitLabUser,
  Project,
  Issue,
  MergeRequest,
  Todo,
  WatchedRepo,
  SettingsResponse,
  NoteConfig,
} from "../types/gitlab";

export function useGitLabAPI() {
  const testConnection = async (baseUrl: string, token: string) => {
    return invoke<GitLabUser>("test_connection", {
      baseUrl,
      token,
    });
  };

  const getCurrentUser = async () => {
    return invoke<GitLabUser>("get_current_user");
  };

  const searchProjects = async (query: string) => {
    return invoke<Project[]>("get_projects", { query });
  };

  const getIssues = async (
    projectId: number,
    state?: string,
    assignee?: string,
    labels?: string
  ) => {
    return invoke<Issue[]>("get_issues", {
      projectId,
      state: state ?? null,
      assignee: assignee ?? null,
      labels: labels ?? null,
    });
  };

  const getMergeRequests = async (
    projectId: number,
    state?: string,
    reviewer?: string
  ) => {
    return invoke<MergeRequest[]>("get_merge_requests", {
      projectId,
      state: state ?? null,
      reviewer: reviewer ?? null,
    });
  };

  const getTodos = async (projectId?: number) => {
    return invoke<Todo[]>("get_todos", { projectId: projectId ?? null });
  };

  const addComment = async (
    projectId: number,
    targetType: string,
    targetIid: number,
    body: string
  ) => {
    return invoke("add_comment", {
      projectId,
      targetType,
      targetIid,
      body,
    });
  };

  const getSettings = async () => {
    return invoke<SettingsResponse>("get_settings");
  };

  const saveSettings = async (
    baseUrl: string,
    token?: string,
    pollingIntervalSecs?: number
  ) => {
    return invoke("save_settings", {
      baseUrl,
      token: token ?? null,
      pollingIntervalSecs: pollingIntervalSecs ?? null,
    });
  };

  const getWatchedRepos = async () => {
    return invoke<WatchedRepo[]>("get_watched_repos");
  };

  const addWatchedRepo = async (repo: WatchedRepo) => {
    return invoke("add_watched_repo", {
      projectId: repo.project_id,
      name: repo.name,
      path: repo.path,
      webUrl: repo.web_url,
    });
  };

  const removeWatchedRepo = async (projectId: number) => {
    return invoke("remove_watched_repo", { projectId });
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
    showIssues?: boolean;
    showMrs?: boolean;
    onlyAssignedToMe?: boolean;
    labels?: string[];
  }) => {
    return invoke("update_note_config", params);
  };

  return {
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
