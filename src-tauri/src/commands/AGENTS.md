# COMMANDS DOMAIN KNOWLEDGE BASE

> Earned: Score 8 (module boundary, >30 symbols, >10 exports, distinct domain: Tauri IPC command layer & window lifecycle).

## OVERVIEW
Tauri IPC command handlers exposing backend GitLab queries, settings persistence, and multi-window note lifecycle to the frontend.

## WHERE TO LOOK
| File | Role | Key Symbols |
|------|------|-------------|
| `mod.rs` | Shared state & poller startup | `get_clients()`, `get_config()`, `init_polling()`, `reload_clients()` |
| `gitlab.rs` | GitLab query/mutation commands | `test_connection`, `get_issues`, `get_merge_requests`, `add_comment` |
| `notes.rs` | Window creation, geometry, persistence | `create_note`, `remove_note`, `update_note_position`, `restore_note_window` |
| `settings.rs` | Multi-source & watched repos | `get_sources`, `save_source`, `delete_source`, `test_source_connection` |

## IPC COMMANDS INVENTORY
- **GitLab (7)**: `test_connection`, `get_current_user`, `get_projects`, `get_issues`, `get_merge_requests`, `get_todos`, `add_comment` (with `source_id`).
- **Notes (11)**: `create_note`, `create_custom_note`, `open_note`, `hide_note`, `remove_note`, `save_note_document`, `update_note_position`, `update_note_size`, `update_note_config`, `get_note_config`, `get_all_notes`.
- **Settings & Sources (9)**: `get_settings`, `save_settings`, `get_sources`, `save_source`, `delete_source`, `test_source_connection`, `get_watched_repos`, `add_watched_repo`, `remove_watched_repo`.

## CONVENTIONS
- Commands use `#[tauri::command] pub async fn ... -> Result<T, String>` for serialization across Tauri IPC.
- Shared state uses `OnceLock<Arc<RwLock<HashMap<String, GitLabClient>>>>` for multi-source client pool.
- Note windows are dynamically created via `WebviewWindowBuilder` with transparent, frameless, and always-on-top attributes using label `note-<UUID-prefix>`.
- Initial note dimensions default to 340×450 logical pixels at physical position (100, 100). Focus does not resize the window.
- `restore_note_window` owns all creation/restoration. It reuses an existing window, or builds from persisted content/geometry. URLs contain only the note ID.
- Persist config changes with `storage::update_config` while holding the config write lock: write succeeds before memory changes. Field-specific commands prevent stale frontend snapshots from overwriting content or geometry.
- Internal helper functions (`restore_note_window`, `get_clients`, `get_config`, `init_polling`) remain unexposed in `generate_handler!`.

## ANTI-PATTERNS
- Do NOT perform network/window operations while holding config write locks; the serialized local config write intentionally stays inside the lock.
- Do NOT swallow errors in command return values; always bubble up `Result::Err(String)` to allow the frontend to notify the user.
- Do NOT treat close as deletion. Native close requests ask the frontend to flush then call `hide_note`; `remove_note` is an explicit confirmed destructive action.
- Do NOT recreate deleted notes from late document/geometry writes; missing IDs must return an error.

