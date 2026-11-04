# GITLAB INTEGRATION DOMAIN KNOWLEDGE BASE

> Earned: Score 8 (module boundary, >30 symbols, >10 exports, distinct domain: GitLab REST API v4 client & polling worker).

## OVERVIEW
GitLab v4 REST API client and asynchronous background poller broadcasting repository updates to frontend windows.

## WHERE TO LOOK
| File | Role | Key Symbols |
|------|------|-------------|
| `client.rs` | REST API v4 HTTP requests | `GitLabClient`, `test_connection`, `get_issues`, `get_merge_requests` |
| `poller.rs` | Background polling loop & event emission | `Poller`, `start()`, `poll_all()`, `gitlab-update` event |
| `types.rs` | Serde DTOs for GitLab entities | `GitLabUser`, `Issue`, `MergeRequest`, `Todo`, `GitLabUpdate` |
| `mod.rs` | Module re-exports | `GitLabClient`, `Poller`, types export |

## API & DATA FLOW
- **Authentication**: All HTTP requests use `reqwest::Client` with `PRIVATE-TOKEN: {token}` targeting `{base_url}/api/v4`.
- **Endpoints**: `/user`, `/projects?search=...`, `/projects/:id/issues?state=opened`, `/projects/:id/merge_requests?state=opened`, `/todos?state=pending`.
- **Event Broadcasting**: Background worker compiles updates into `GitLabUpdate` and emits `gitlab-update` to all Webview windows.
- **Polling Loop**: Interval defaults to 300s, clamped to `interval_secs.max(10)`; queries watched repos sequentially.

## CONVENTIONS
- Custom `base_url` is loaded from `AppConfig` and defaults to `https://gitlab.com`.
- API errors in `GitLabClient` are mapped using `.map_err(|e| format!("...: {}", e))` to preserve network/parsing context.
- DTO structs in `types.rs` derive `Debug, Clone, Serialize, Deserialize` with field renaming matching GitLab JSON.

## ANTI-PATTERNS
- Do NOT introduce breaking changes to `GitLabUpdate` fields without updating TypeScript interfaces in `src/types/gitlab.ts`.
- Do NOT panic or terminate the polling loop on transient network failure; continue loop execution across intervals.
- Do NOT hardcode the GitLab host; always respect the user's custom `base_url` configured in storage.
- Do NOT perform concurrent unthrottled requests against large project lists; query watched repos sequentially.

