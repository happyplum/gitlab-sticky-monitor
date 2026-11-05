import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { ManagerWindow } from "./windows/ManagerWindow";
import { StickyNote } from "./windows/StickyNote";
import type { NoteConfig } from "./types/gitlab";

function App() {
  const [windowType, setWindowType] = useState<"manager" | "note">("manager");
  const [noteParams, setNoteParams] = useState<{
    sourceId: string;
    repoId: string;
    repoName: string;
    color: string;
    noteId: string;
  } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get("window");
    const label = getCurrentWindow().label;
    const isNote = type === "note" || label.startsWith("note-");

    if (isNote) {
      setWindowType("note");
      const noteId = params.get("noteId") || label;
      const rawSource = params.get("sourceId") || "";
      let sourceId = rawSource;
      try {
        sourceId = decodeURIComponent(rawSource);
      } catch {}
      const repo = params.get("repo") || "";
      const rawName = params.get("name") || "";
      let repoName = rawName;
      try {
        repoName = decodeURIComponent(rawName);
      } catch {
        /* fallback to raw */
      }
      const rawColor = params.get("color") || "#FFFACD";
      let color = rawColor;
      try {
        color = decodeURIComponent(rawColor);
      } catch {
        /* fallback to raw */
      }

      if (repo && noteId) {
        setNoteParams({
          sourceId,
          repoId: repo,
          repoName,
          color,
          noteId,
        });
      } else {
        // Fallback: fetch from backend config by noteId
        invoke<NoteConfig | null>("get_note_config", { noteId }).then((cfg) => {
          if (cfg) {
            setNoteParams({
              sourceId: cfg.source_id || "",
              repoId: String(cfg.repo_id),
              repoName: cfg.repo_name,
              color: cfg.color || "#FFFACD",
              noteId: cfg.id,
            });
          }
        });
      }
    }
  }, []);

  if (windowType === "note" && noteParams) {
    return (
      <StickyNote
        sourceId={noteParams.sourceId}
        repoId={noteParams.repoId}
        repoName={noteParams.repoName}
        noteColor={noteParams.color}
        noteId={noteParams.noteId}
      />
    );
  }

  return <ManagerWindow />;
}

export default App;
