//! 应用内更新 IPC。
//!
//! 命令接收 endpoint/token 参数而非从 storage 读（前端设置驱动，updater 保持无状态；storage 归 frontend lane）。

use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdaterProgress {
    stage: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    progress_percent: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdaterCheckResponse {
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    pub current_version: String,
}

#[derive(serde::Serialize)]
pub struct UpdaterStartedResponse {
    pub started: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdaterCurrentVersionResponse {
    pub current_version: String,
    pub default_endpoint: String,
}

fn emit_progress(app: &AppHandle, progress: UpdaterProgress) {
    if let Err(err) = app.emit("updater-progress", &progress) {
        log::error!("发送 updater-progress 失败: {err}");
    }
}

fn emit_stage(app: &AppHandle, stage: &'static str) {
    emit_progress(
        app,
        UpdaterProgress {
            stage,
            version: None,
            progress_percent: None,
            message: None,
        },
    );
}

fn emit_error(app: &AppHandle, message: impl Into<String>) {
    emit_progress(
        app,
        UpdaterProgress {
            stage: "error",
            version: None,
            progress_percent: None,
            message: Some(message.into()),
        },
    );
}

fn build_updater(
    app: &AppHandle,
    endpoint: &str,
    token: Option<&str>,
) -> Result<tauri_plugin_updater::Updater, String> {
    let endpoint = endpoint.trim();
    if endpoint.is_empty() {
        return Err("更新地址不能为空".to_string());
    }

    let parsed = endpoint
        .parse()
        .map_err(|err| format!("更新地址无效: {err}"))?;
    let mut builder = app
        .updater_builder()
        .endpoints(vec![parsed])
        .map_err(|err| err.to_string())?;

    // 空 token 不附加鉴权头，公开 feed 仍可直接检查。
    if let Some(token) = token.map(str::trim).filter(|token| !token.is_empty()) {
        builder = builder
            .header("Authorization", format!("token {}", token))
            .map_err(|err| err.to_string())?;
    }

    builder.build().map_err(|err| err.to_string())
}

fn current_version_of(app: &AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub async fn updater_check(
    app: AppHandle,
    endpoint: String,
    token: Option<String>,
) -> Result<UpdaterCheckResponse, String> {
    emit_stage(&app, "checking");
    let current_version = current_version_of(&app);
    let updater = match build_updater(&app, &endpoint, token.as_deref()) {
        Ok(updater) => updater,
        Err(message) => {
            emit_error(&app, message.clone());
            return Err(message);
        }
    };

    match updater.check().await {
        Ok(Some(update)) => {
            let version = update.version.clone();
            emit_progress(
                &app,
                UpdaterProgress {
                    stage: "available",
                    version: Some(version.clone()),
                    progress_percent: None,
                    message: None,
                },
            );
            Ok(UpdaterCheckResponse {
                available: true,
                version: Some(version),
                notes: Some(update.body.clone().unwrap_or_default()),
                current_version,
            })
        }
        Ok(None) => {
            emit_stage(&app, "up-to-date");
            Ok(UpdaterCheckResponse {
                available: false,
                version: None,
                notes: None,
                current_version,
            })
        }
        Err(err) => {
            let message = format!("检查更新失败: {err}");
            emit_error(&app, message.clone());
            Err(message)
        }
    }
}

#[tauri::command]
pub async fn updater_download_and_install(
    app: AppHandle,
    endpoint: String,
    token: Option<String>,
) -> Result<UpdaterStartedResponse, String> {
    // 命令在拉起任务后立即返回 {started:true}。地址非法发生在拉起前，
    // 因此同时发 error 事件并作为 IPC Err 返回；任务启动后的失败只能再发事件。
    if let Err(message) = build_updater(&app, &endpoint, token.as_deref()) {
        emit_error(&app, message.clone());
        return Err(message);
    }

    let app_handle = app.clone();
    tokio::spawn(async move {
        if let Err(message) = run_download_and_install(app_handle.clone(), endpoint, token).await {
            emit_error(&app_handle, message);
        }
    });

    Ok(UpdaterStartedResponse { started: true })
}

async fn run_download_and_install(
    app: AppHandle,
    endpoint: String,
    token: Option<String>,
) -> Result<(), String> {
    emit_stage(&app, "checking");
    let updater = build_updater(&app, &endpoint, token.as_deref())?;
    let Some(update) = updater
        .check()
        .await
        .map_err(|err| format!("检查更新失败: {err}"))?
    else {
        emit_stage(&app, "up-to-date");
        return Ok(());
    };

    let version = update.version.clone();
    let progress_app = app.clone();
    let download_version = version.clone();
    // 插件把每次分片长度传给回调，不是累计字节；进度必须自行累加。
    let mut downloaded: u64 = 0;
    update
        .download_and_install(
            |chunk_len, total| {
                downloaded = downloaded.saturating_add(chunk_len as u64);
                let progress_percent = match total {
                    Some(total) if total > 0 => {
                        ((downloaded as f64 / total as f64) * 100.0)
                            .round()
                            .clamp(0.0, 100.0) as u32
                    }
                    _ => 0,
                };
                emit_progress(
                    &progress_app,
                    UpdaterProgress {
                        stage: "downloading",
                        version: Some(download_version.clone()),
                        progress_percent: Some(progress_percent),
                        message: None,
                    },
                );
            },
            {
                let progress_app = progress_app.clone();
                move || {
                    emit_progress(
                        &progress_app,
                        UpdaterProgress {
                            stage: "installing",
                            version: Some(version),
                            progress_percent: None,
                            message: None,
                        },
                    );
                }
            },
        )
        .await
        .map_err(|err| format!("下载或安装更新失败: {err}"))?;

    // Windows 上安装器启动后插件会退出进程，idle 只在安装函数实际返回时发出。
    emit_stage(&app, "idle");
    Ok(())
}

#[tauri::command]
pub async fn updater_current_version(
    app: AppHandle,
) -> Result<UpdaterCurrentVersionResponse, String> {
    Ok(UpdaterCurrentVersionResponse {
        current_version: current_version_of(&app),
        default_endpoint: crate::storage::DEFAULT_UPDATE_ENDPOINT.to_string(),
    })
}

/// 启动时自动检查：auto_check 开启时静默检查一次，仅通过事件通知（有更新时 UI 呈现可用状态）。
/// 静默失败：网络/端点问题只记录日志，不弹错误（设置页手动检查才报错）。
pub async fn startup_auto_check(app: AppHandle) -> Result<(), String> {
    let updates = get_app_updates(&app);
    if !updates.auto_check_enabled() {
        return Ok(());
    }
    let endpoint = updates.effective_endpoint();
    let token = updates.effective_token();
    let updater = build_updater(&app, &endpoint, token.as_deref())?;
    match updater.check().await {
        Ok(Some(update)) => {
            emit_progress(
                &app,
                UpdaterProgress {
                    stage: "available",
                    version: Some(update.version.clone()),
                    progress_percent: None,
                    message: None,
                },
            );
            Ok(())
        }
        Ok(None) => {
            emit_stage(&app, "up-to-date");
            Ok(())
        }
        Err(err) => {
            log::warn!("自动检查更新失败: {err}");
            Ok(())
        }
    }
}

fn get_app_updates(app: &AppHandle) -> crate::storage::AppUpdatesConfig {
    let _ = app; // 形参仅为未来迁移到 managed state 预留
    // init_config 在 setup 先于本调用完成；读失败时回退默认（自动检查开启 + 默认源）。
    // blocking_read 在 tokio worker 上会 panic，这里用 try_read 拿锁快照，拿不到就用默认。
    crate::commands::get_config()
        .try_read()
        .map(|config| config.app_updates.clone().unwrap_or_default())
        .unwrap_or_default()
}
