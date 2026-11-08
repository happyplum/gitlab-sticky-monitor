# GitLab 便笺监控

桌面 GitLab 便笺工具：监听 Issue / Merge Request / Todo，以桌面便笺形式常驻。基于 Tauri v2（Rust）+ React 19 + TypeScript。

## 开发

```bash
npm install
npm run tauri dev   # 开发模式（Vite + Tauri）
npm run build       # tsc + vite build
cargo check --manifest-path src-tauri/Cargo.toml
node --test tests/noteSaver.test.mjs tests/publish-release.test.mjs tests/gitea-api.test.mjs
```

## 构建安装包

Windows NSIS 安装包 + 更新签名一步产出：

```bash
# 签名密钥保存在仓库外（不入库）；空密码也必须显式传 TAURI_SIGNING_PRIVATE_KEY_PASSWORD，
# 否则签名器会等待交互输入导致构建挂起。
TAURI_SIGNING_PRIVATE_KEY="C:/Users/lzy/.tauri-keys/gitlab-sticky-monitor/gitlab-sticky-monitor.key" \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
npm run tauri build
```

产物在 `src-tauri/target/release/bundle/nsis/`：

- `GitLab便笺监控_<version>_x64-setup.exe` — NSIS 安装包
- `GitLab便笺监控_<version>_x64-setup.exe.sig` — 更新包 minisign 签名（更新安装的强制校验物）
- `latest.json` — 由发布脚本生成（Tauri CLI 本身不产出）

密钥丢失则已发布版本无法再热更新（用户需手动重装），请妥善备份私钥。

## 发布与热更新

发布产物只进**公开 release 仓库** `tools/gitlab-sticky-monitor-releases`（Gitea：`https://s.happyplum.cn:8888`），源码仓库保持私有。

```bash
# 1) bump 版本（三处同步）：src-tauri/tauri.conf.json、package.json、src-tauri/Cargo.toml
# 2) 构建安装包（同上）
# 3) 发布（--dry-run 先看计划，不做任何网络请求）
node scripts/publish-release.mjs \
  --api-base https://s.happyplum.cn:8888 \
  --owner tools --repo gitlab-sticky-monitor-releases \
  --token <PAT with write:repository> \
  [--dry-run] [--keep 7]
```

发布脚本行为：

- 同版本拒发（列表里已有 `v<version>` 即退出 1，提示先 bump version）。
- 固定 `stable` tag 作为更新通道：清空旧附件后重新上传（exe + sig + 重写后的 latest.json）。
- `latest.json` 中下载 URL 重写为 `…/releases/download/stable/<file>` 绝对地址（Gitea 没有 `/releases/latest/download` 固定重定向，所以用固定 tag）。
- 另建 `v<version>` 归档 Release 留档，超出 `--keep`（默认 7）的旧归档自动清理，`stable` 永不删除。

### 应用内更新

- 设置页「应用更新」卡片：当前版本、检查更新、下载进度、重启安装、更新源地址与访问令牌配置、自动检查开关（默认开，启动后静默检查一次，仅提示不自动下载）。
- 默认更新源：`https://s.happyplum.cn:8888/tools/gitlab-sticky-monitor-releases/releases/download/stable/latest.json`。
- 该 Gitea 实例开启了 REQUIRE_SIGNIN_VIEW（匿名不可访问），公开 release 仓也需要登录访问——在「访问令牌」里填 Gitea PAT，更新请求将携带 `Authorization: token <t>`。
- 更新包安装前强制校验 minisign 签名（公钥内置于 `tauri.conf.json`）。
