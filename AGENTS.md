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
| Adjust sticky note UI | `src/windows/StickyNote.tsx` | Single-feed GitLab notes and custom rich text, native focus, save and hide lifecycle |
| Edit custom content | `src/components/RichTextEditor.tsx` | Lexical JSON, four text formats, paragraph indentation; no GitLab or IPC logic |
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
- Do NOT change window dimensions on focus/blur. Store positions as physical pixels and sizes as logical pixels, converting at the native boundary.
- Do NOT swallow errors during command execution; propagate descriptive string errors to frontend.
- Do NOT query repositories without specifying `source_id`; cross-source collisions will occur.

## UNIQUE STYLES
- The manager and notes use a light theme with a muted green accent. Shared colors, controls, focus states, and status badges are maintained in `src/styles/global.css`; use the shared `Icon` for line icons.
- The manager keeps the three existing sections (sources, repositories, notes) in a sidebar; aggregated work and notification features are not implemented by this UI refresh.
- Each watched repository row exposes Issues, MR and Todos creation buttons directly; there is no separate global feed selector.
- Sticky note styling lives in `src/styles/sticky-note.css`; the saved `--note-color` fills the note. Unfocused notes show content with a quiet drag region; native focus reveals controls and GitLab repository/source/data-update time.
- Custom notes keep save status in the formatting toolbar. Mouse editing uses the caret without an enclosing focus ring; keyboard focus remains visible.

## NOTE DATA AND LIFECYCLE
- `NoteConfig` shares ID, color, geometry, pinning and `is_open`. Its `kind` discriminates `gitlab` (one `feed`: issues/mrs/todos, source/repo and filters) from `custom` (Lexical document JSON). No duplicate HTML/plain-text content is stored.
- URL identity is only `noteId`; load the canonical config through IPC. GitLab requests/events match both source and repository. Custom notes never fetch GitLab data.
- Rust config is the saved authority. `update_config` writes a candidate under the existing config write lock, replaces the file atomically, then publishes memory. Failed reads/writes preserve existing content and report errors.
- `noteSaver.ts` serializes writes and coalesces pending drafts. Hide and normal exit wait for the latest draft/geometry save. Errors retain the draft and leave the application running. Force termination or power loss cannot guarantee unsaved edits.
- Close hides and persists `is_open=false`; reopening keeps the same note ID. Only explicit confirmed deletion removes content. Startup restores only open notes. `lifecycle.rs` coordinates normal exit acknowledgements before the process ends.
- Config version 2 is canonical. Optional `app_updates` (`endpoint`, `token`, `auto_check`) may be omitted; absence leaves it unset and does not change the version. Unversioned single/multi-source configurations migrate once at load: each old note becomes enabled Issues/MR feeds plus Todos, preserving source, appearance, geometry and filters. New IDs are assigned to extra notes. Legacy source fallback exists only in this read-boundary migration; versioned invalid data never falls back to legacy interpretation.

## COMMANDS
```bash
npm run dev       # Start Vite dev server on http://localhost:1420
npm run build     # Run TypeScript check (tsc) and Vite build to dist/
npm run tauri dev # Launch Tauri desktop app with Vite dev server
npm run tauri build # Package production desktop installers (NSIS/MSI)
cargo check --manifest-path src-tauri/Cargo.toml # Verify Rust backend compilation
node --test tests/noteSaver.test.mjs # Serial/coalesced draft saves
node --test tests/publish-release.test.mjs tests/gitea-api.test.mjs # Release publishing scripts (no network)
cargo test --manifest-path src-tauri/Cargo.toml --lib storage::tests # Storage and migration
```

### Release build and publishing
```bash
# Requires updater signing key (minisign). Key lives OUTSIDE the repo at
# C:/Users/lzy/.tauri-keys/gitlab-sticky-monitor/ (never commit it).
# Empty-password keys still need TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" explicitly,
# otherwise the signer waits for interactive input and hangs the build.
TAURI_SIGNING_PRIVATE_KEY=<path-or-key> TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" npm run tauri build
# Artifacts: src-tauri/target/release/bundle/nsis/{*_x64-setup.exe, *.exe.sig}; latest.json is generated by the publish script.

# Publish to the public Gitea release repo (tools/gitlab-sticky-monitor-releases).
# Flags override env (GITEA_API_BASE/GITEA_OWNER/GITEA_REPO/GITEA_TOKEN); --dry-run prints the plan with zero network calls.
# Same version is rejected (bump version in tauri.conf.json + package.json + Cargo.toml first).
node scripts/publish-release.mjs --api-base https://s.happyplum.cn:8888 --owner tools --repo gitlab-sticky-monitor-releases --token <PAT> [--dry-run] [--keep 7]
```
The updater feed is the fixed `stable` tag attachment URL (`.../releases/download/stable/latest.json`); Gitea has no `/releases/latest/download` redirect. The Gitea instance runs with REQUIRE_SIGNIN_VIEW, so the in-app update check sends the optional token from settings as `Authorization: token <t>`.

`tests/noteLifecycle.html` mounts the actual note UI with controlled mock IPC for close/exit/resize races. With `npm run dev` running, use an isolated Playwright CLI session to open `http://localhost:1420/tests/noteLifecycle.html`, then run `tests/noteLifecycle.browser.js` and inspect `window.__raceResult.passed`. This checks component ordering, not native OS exit or real GitLab connectivity.

## NOTES
- Multiple self-hosted and cloud GitLab instances can be configured in parallel via `sources` settings.
- Saved configuration lives in OS config directory (`%APPDATA%/gitlab-sticky-monitor/config.json` on Windows). Debug builds accept `GITLAB_STICKY_TEST_CONFIG` for isolated desktop acceptance; production ignores it.
