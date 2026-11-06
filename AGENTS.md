# PROJECT KNOWLEDGE BASE

**Generated:** 2026-11-04
**Commit:** initial
**Branch:** main

## OVERVIEW
GitLab Sticky Monitor is a desktop sticky note utility for GitLab issues, merge requests, and todos, built on Tauri v2 (Rust backend) and React 19 + TypeScript (Vite frontend).

## STRUCTURE
```
gitlab-sticky-monitor/
├── src/                    # Frontend React application (single-bundle multi-window dispatch)
│   ├── components/         # Cards, NoteSettingsPanel, shared Icon and StatusBadge
│   ├── hooks/              # useGitLabAPI hook wrapping Tauri invoke calls
│   ├── windows/            # ManagerWindow (settings & repo manager) & StickyNote (desktop card)
│   ├── styles/             # global.css (theme variables) & sticky-note.css (note layout)
│   └── types/              # TypeScript GitLab DTOs, NoteConfig, and event payloads
├── src-tauri/              # Tauri v2 native host in Rust
│   ├── capabilities/       # default.json granting core, window, and plugin permissions
│   └── src/
│       ├── commands/       # Tauri IPC commands (GitLab queries, notes, settings) [AGENTS.md]
│       ├── gitlab/         # GitLab v4 REST client & background poller worker [AGENTS.md]
│       ├── storage.rs      # AppConfig persistence to system config directory (config.json)
│       ├── tray.rs         # System tray menu and lifecycle management
│       ├── lib.rs          # Tauri Builder setup, plugin registration, command dispatch
│       └── main.rs         # Binary entry point invoking lib::run()
└── package.json / Cargo.toml
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Add new Tauri command | `src-tauri/src/commands/` | Implement command in submodule, re-export in `commands/mod.rs`, register in `lib.rs` |
| Wrap IPC in frontend | `src/hooks/useGitLabAPI.ts` | Add typed `invoke<T>` wrapper and expose through hook |
| Adjust sticky note UI | `src/windows/StickyNote.tsx` | Multi-tab view (issues/MRs/todos), filters, compact mode |
| Modify manager dashboard | `src/windows/ManagerWindow.tsx` | Settings, repo search, note instance manager |
| Update GitLab polling | `src-tauri/src/gitlab/poller.rs` | Background tokio loop emitting `gitlab-update` |
| Change persistence schema | `src-tauri/src/storage.rs` | Update `AppConfig` and sync with `src/types/gitlab.ts` |

## CODE MAP
| Symbol | Type | Location | Refs | Role |
|--------|------|----------|------|------|
| `App` | Component | `src/App.tsx` | 1 | Root router dispatching ManagerWindow vs StickyNote by label/query |
| `StickyNote` | Component | `src/windows/StickyNote.tsx` | 1 | Desktop sticky note window with source-isolated GitLab polling updates |
| `ManagerWindow` | Component | `src/windows/ManagerWindow.tsx` | 1 | Central multi-source configuration, repository management, and note launcher |
| `useGitLabAPI` | Hook | `src/hooks/useGitLabAPI.ts` | 2 | Type-safe frontend adapter for backend Tauri IPC invocations with source_id |
| `GitLabClient` | Struct | `src-tauri/src/gitlab/client.rs` | 2 | REST API v4 HTTP client with private token authentication per source |
| `Poller` | Struct | `src-tauri/src/gitlab/poller.rs` | 1 | Tokio background worker polling watched repos by source and emitting events |
| `init_polling` | Function | `src-tauri/src/commands/mod.rs` | 1 | Startup orchestrator restoring saved notes and launching multi-client poller |
| `create_note` | Command | `src-tauri/src/commands/notes.rs` | 1 | Spawns transparent, frameless, always-on-top desktop note windows bound to source |
| `setup_tray` | Function | `src-tauri/src/tray.rs` | 1 | System tray icon, context menu, and background residency |

## CONVENTIONS
- Single bundle, multi-window: All windows load `index.html` + `src/main.tsx`; `App.tsx` dispatches UI by window label (`manager` vs `note-*`) or URL search params.
- Multi-source architecture: Configurations support multiple `GitLabSource` entities. Watched repos and notes use composite keys `(source_id, project_id)` for strict isolation.
- IPC error convention: Rust commands return `Result<T, String>`; frontend `invoke` returns rejected Promise handled locally in UI.
- Background residency: Closing manager window hides it to system tray; the application runs headless in the system tray until invoked.
- Cross-window communication: Rust poller emits `gitlab-update` with `source_id` + `repo_id`, and tray emits `force-refresh` / `navigate` via Tauri global events.

## ANTI-PATTERNS (THIS PROJECT)
- Do NOT remove `#[cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` in `src-tauri/src/main.rs` (causes console window flash in production).
- Do NOT create separate HTML entry points for new windows; route via `App.tsx` and query parameters.
- Do NOT mutate note geometry storage during compact mode (prevents overwriting normal dimensions).
- Do NOT swallow errors during command execution; propagate descriptive string errors to frontend.
- Do NOT query repositories without specifying `source_id`; cross-source collisions will occur.

## UNIQUE STYLES
- The manager and notes use a light theme with a muted green accent. Shared colors, controls, focus states, and status badges are maintained in `src/styles/global.css`; use the shared `Icon` for line icons.
- The manager keeps the three existing sections (sources, repositories, notes) in a sidebar; aggregated work and notification features are not implemented by this UI refresh.
- Sticky note styling lives in `src/styles/sticky-note.css`. The saved color is passed through `--note-color` for the top border and a lightly tinted background; existing palette and persisted values stay unchanged.
- Compact mode shrinks the sticky note window to 38px title-bar strip showing badge counts.

## COMMANDS
```bash
npm run dev       # Start Vite dev server on http://localhost:1420
npm run build     # Run TypeScript check (tsc) and Vite build to dist/
npm run tauri dev # Launch Tauri desktop app with Vite dev server
npm run tauri build # Package production desktop installers (NSIS/MSI)
cargo check --manifest-path src-tauri/Cargo.toml # Verify Rust backend compilation
```

## NOTES
- Multiple self-hosted and cloud GitLab instances can be configured in parallel via `sources` settings.
- Saved configuration lives in OS config directory (`%APPDATA%/gitlab-sticky-monitor/config.json` on Windows) with automatic migration from single-source format.
