# COMMANDS DOMAIN KNOWLEDGE BASE

> Earned: Score 8 (module boundary, >30 symbols, >10 exports, distinct domain: Tauri IPC command layer & window lifecycle).

## OVERVIEW
Tauri IPC command handlers exposing backend GitLab queries, settings persistence, and multi-window note lifecycle to the frontend.

## WHERE TO LOOK
| File | Role | Key Symbols |
|------|------|-------------|
| `mod.rs` | Shared state & poller startup | `get_client()`, `get_config()`, `init_polling()` |
| `gitlab.rs` | GitLab query/mutation commands | `test_connection`, `get_issues`, `get_merge_requests`, `add_comment` |
| `notes.rs` | Window creation, geometry, persistence | `create_note`, `remove_note`, `update_note_position`, `restore_note_window` |
| `settings.rs` | Configuration and watched repos | `get_settings`, `save_settings`, `add_watched_repo`, `SettingsResponse` |

## IPC COMMANDS INVENTORY
- **GitLab (7)**: `test_connection`, `get_current_user`, `get_projects`, `get_issues`, `get_merge_requests`, `get_todos`, `add_comment`.
- **Notes (7)**: `create_note`, `remove_note`, `update_note_position`, `update_note_size`, `update_note_config`, `get_note_config`, `get_all_notes`.
- **Settings (5)**: `get_settings`, `save_settings`, `get_watched_repos`, `add_watched_repo`, `remove_watched_repo`.

## CONVENTIONS
- Commands use `#[tauri::command] pub async fn ... -> Result<T, String>` for serialization across Tauri IPC.
- Shared state uses `OnceLock<Arc<RwLock<...>>>` for lazy singleton access without passing state through every handler.
- Note windows are dynamically created via `WebviewWindowBuilder` with transparent, frameless, and always-on-top attributes using label `note-<UUID-prefix>`.
- Initial note dimensions default to 340×450 at position (100, 100); compact mode shrinks height to 38px.
- Internal helper functions (`restore_note_window`, `get_client`, `get_config`, `init_polling`) remain unexposed in `generate_handler!`.

## ANTI-PATTERNS
- Do NOT perform long blocking operations while holding write locks on `Arc<RwLock<AppConfig>>`.
- Do NOT swallow errors in command return values; always bubble up `Result::Err(String)` to allow the frontend to notify the user.
- Do NOT close note windows via raw OS calls without syncing `storage::save_config` to remove persisted geometry.
- Do NOT mutate note geometry in compact mode; size updates are skipped when minimized.

