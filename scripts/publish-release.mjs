import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createGiteaClient,
  parseCliArgs,
  readNonNegativeInteger,
  resolveGiteaConfig,
} from './gitea-api.mjs'

const STABLE_TAG = 'stable'
const PAGE_LIMIT = 50
const MAX_PAGES = 40
const currentFile = fileURLToPath(import.meta.url)

function defaultProjectRoot() {
  return path.resolve(path.dirname(currentFile), '..')
}

export function toWebBase(baseUrl) {
  return String(baseUrl ?? '').trim().replace(/\/+$/, '').replace(/\/api\/v1$/, '')
}

// Gitea 没有 /releases/latest/download 重定向，更新清单的 url 固定指向 tag stable。
export function rewriteLatestJson(text, target) {
  const parsed = JSON.parse(text)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('latest.json 根节点必须是对象')
  }
  const platforms = parsed.platforms
  if (platforms === null || typeof platforms !== 'object' || Array.isArray(platforms)) {
    throw new Error('latest.json 缺少 platforms')
  }
  const platform = platforms['windows-x86_64']
  if (platform === null || typeof platform !== 'object' || Array.isArray(platform)) {
    throw new Error('latest.json 缺少 platforms.windows-x86_64')
  }
  platform.url = stableDownloadUrl(target)
  return `${JSON.stringify(parsed, null, 2)}\n`
}

// Tauri v2 bundler 只产 .sig，不生成更新清单；发布时由脚本自产 latest.json。
// notes 从最近一次 git tag 的提交日志拼装；pub_date 用 RFC 3339 UTC。
export function generateLatestJson({ version, notes, pubDate, exeName, signature }) {
  const trimmedNotes = String(notes ?? '').trim()
  return JSON.stringify(
    {
      version,
      notes: trimmedNotes,
      pub_date: pubDate ?? new Date().toISOString(),
      platforms: {
        'windows-x86_64': {
          signature: String(signature ?? ''),
          url: exeName,
        },
      },
    },
    null,
    2,
  ) + '\n'
}

export function findArtifacts(dir, version) {
  const names = listFiles(dir)
  const setupPattern = new RegExp(`_${escapeRegExp(version)}_x64-setup\\.exe$`)
  const setups = names.filter((name) => setupPattern.test(name)).sort()
  const missing = []
  const setupName = setups[0] ?? null
  if (setupName === null) missing.push(`*_${version}_x64-setup.exe`)
  const signatureName = setupName === null ? null : `${setupName}.sig`
  if (signatureName === null) missing.push(`*_${version}_x64-setup.exe.sig`)
  else if (!names.includes(signatureName)) missing.push(signatureName)
  return {
    setup: toFile(dir, setupName),
    signature: signatureName !== null && names.includes(signatureName) ? toFile(dir, signatureName) : null,
    latest: null,
    missing,
  }
}

// protectedTags 不占用 keep 名额。返回值按创建时间从旧到新，便于按这个顺序删除。
export function selectReleasesToPrune(releases, keep, protectedTags = ['stable']) {
  if (!Array.isArray(releases)) throw new Error('releases 必须是数组')
  const protectedSet = new Set(protectedTags)
  const retained = typeof keep === 'number' && Number.isFinite(keep) ? Math.max(0, Math.trunc(keep)) : 0
  const candidates = []
  for (const [index, release] of releases.entries()) {
    if (protectedSet.has(release?.tag_name)) continue
    candidates.push({ release, index })
  }
  candidates.sort((left, right) => compareCreatedAt(right.release?.created_at, left.release?.created_at) || left.index - right.index)
  const pruned = candidates.slice(retained)
  pruned.sort((left, right) => compareCreatedAt(left.release?.created_at, right.release?.created_at) || left.index - right.index)
  return pruned.map((item) => item.release)
}

export async function runPublish({
  argv = [],
  env = process.env,
  projectRoot = defaultProjectRoot(),
  fetchImpl,
  logger = console,
  execImpl,
} = {}) {
  const { positionals, flags } = parseCliArgs(argv)
  const config = resolveGiteaConfig(flags, env)
  const keep = readNonNegativeInteger(flags.keep, 7)
  if (positionals.length > 0 || config.missing.length > 0 || keep === null) {
    logger.error(publishUsage())
    if (config.missing.length > 0) logger.error(`缺少参数：${config.missing.join('、')}`)
    if (keep === null) logger.error('--keep 必须是非负整数')
    return { exitCode: 2 }
  }

  let version
  try {
    version = readTauriVersion(projectRoot)
  } catch (error) {
    logger.error(messageOf(error))
    return { exitCode: 1 }
  }
  const tag = `v${version}`
  const artifactDir = path.join(projectRoot, 'src-tauri', 'target', 'release', 'bundle', 'nsis')
  const artifacts = findArtifacts(artifactDir, version)
  if (artifacts.missing.length > 0) {
    logger.error(`缺少发布产物（${artifactDir}）：\n${artifacts.missing.map((item) => `- ${item}`).join('\n')}`)
    return { exitCode: 1 }
  }

  let latestText
  try {
    const signature = readFileSync(artifacts.signature.filePath, 'utf8').trim()
    latestText = generateLatestJson({ version, notes: '', exeName: artifacts.setup.name, signature })
  } catch (error) {
    logger.error(`无法生成 latest.json：${messageOf(error)}`)
    return { exitCode: 1 }
  }
  let rewritten
  try {
    rewritten = rewriteLatestJson(latestText, {
      webBase: config.baseUrl,
      owner: config.owner,
      repo: config.repo,
      exeName: artifacts.setup.name,
    })
  } catch (error) {
    logger.error(`无法改写 latest.json：${messageOf(error)}`)
    return { exitCode: 1 }
  }
  const notes = buildReleaseNotes(projectRoot, tag, execImpl)
  let assets
  try {
    assets = [
      fileAsset(artifacts.setup, 'application/octet-stream'),
      fileAsset(artifacts.signature, 'text/plain; charset=utf-8'),
      {
        name: 'latest.json',
        bytes: Buffer.from(rewritten, 'utf8'),
        contentType: 'application/json; charset=utf-8',
        size: Buffer.byteLength(rewritten, 'utf8'),
      },
    ]
  } catch (error) {
    logger.error(`无法读取发布产物：${messageOf(error)}`)
    return { exitCode: 1 }
  }

  // dry-run 只依据本地产物打印计划。同版本拒绝要先拉 Release 列表，因此只在真正发布时做。
  if (flags['dry-run'] === true) {
    printPlan({ logger, tag, assets, rewritten })
    return { exitCode: 0, tag }
  }

  const client = createGiteaClient({
    baseUrl: config.baseUrl,
    owner: config.owner,
    repo: config.repo,
    token: config.token,
    fetchImpl,
  })
  try {
    const releases = await listAllReleases(client)
    if (releases.some((release) => release?.tag_name === tag)) {
      logger.error(`已有 Release ${tag}，请先 bump version。`)
      return { exitCode: 1 }
    }
    logger.log(`开始发布 ${tag}，稳定通道 ${STABLE_TAG}，保留 ${keep} 个归档`)
    const stable = releases.find((release) => release?.tag_name === STABLE_TAG) ?? null
    const stableId = await ensureStableRelease(client, stable, notes, logger)
    await uploadAll(client, stableId, assets, STABLE_TAG, logger)
    const archived = await client.createRelease({ tagName: tag, name: tag, body: notes })
    if (archived === null || archived.id === undefined || archived.id === null) throw new Error('创建归档 Release 的响应缺少 id')
    logger.log(`已创建归档 Release ${tag}（id=${archived.id}）`)
    await uploadAll(client, archived.id, assets, tag, logger)
    const failed = await pruneOldReleases(client, keep, logger)
    if (failed > 0) {
      logger.error('稳定版和归档 Release 已发布，但旧 Release 清理未全部成功。')
      return { exitCode: 1, tag, releaseId: archived.id }
    }
    logger.log(`发布完成：${tag}，稳定通道 ${STABLE_TAG}`)
    return { exitCode: 0, tag, releaseId: archived.id }
  } catch (error) {
    logger.error(messageOf(error))
    return { exitCode: 1 }
  }
}

function stableDownloadUrl(target) {
  const webBase = toWebBase(target?.webBase ?? target?.baseUrl)
  const owner = target?.owner
  const repo = target?.repo
  const exeName = target?.exeName
  if (!webBase || !owner || !repo || !exeName) throw new Error('rewriteLatestJson 缺少 webBase、owner、repo 或 exeName')
  return `${webBase}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/download/${STABLE_TAG}/${encodeURIComponent(exeName)}`
}

async function ensureStableRelease(client, stable, notes, logger) {
  if (stable === null) {
    const created = await client.createRelease({ tagName: STABLE_TAG, name: STABLE_TAG, body: notes })
    if (created === null || created.id === undefined || created.id === null) throw new Error('创建 stable Release 的响应缺少 id')
    logger.log(`已创建 stable（id=${created.id}）`)
    return created.id
  }
  if (stable.id === undefined || stable.id === null) throw new Error('stable Release 缺少 id')
  if (!Array.isArray(stable.assets)) throw new Error('stable Release 响应缺少 assets，无法清空附件')
  for (const asset of stable.assets) {
    if (asset?.id === undefined || asset?.id === null) throw new Error(`stable 附件缺少 id：${asset?.name ?? '未知附件'}`)
  }
  for (const asset of stable.assets) {
    await client.deleteAsset(stable.id, asset.id)
    logger.log(`已删除 stable 附件 ${asset.name ?? asset.id}（id=${asset.id}）`)
  }
  await client.updateRelease(stable.id, { name: STABLE_TAG, body: notes })
  logger.log(`已更新 stable 说明（id=${stable.id}）`)
  return stable.id
}

async function uploadAll(client, releaseId, assets, label, logger) {
  for (const asset of assets) {
    await client.uploadAsset(releaseId, asset)
    logger.log(`已上传 ${asset.name} 到 ${label}（${asset.size} 字节）`)
  }
}

async function pruneOldReleases(client, keep, logger) {
  const releases = await listAllReleases(client)
  const selected = selectReleasesToPrune(releases, keep)
  if (selected.length === 0) {
    logger.log('没有需要删除的旧 Release')
    return 0
  }
  let failed = 0
  for (const release of selected) {
    const description = `id=${release.id} tag=${release.tag_name}`
    try {
      await client.deleteRelease(release.id)
      logger.log(`已删除旧 Release ${description}`)
    } catch (error) {
      failed += 1
      logger.error(`删除失败 ${description}：${messageOf(error)}`)
    }
  }
  return failed
}

async function listAllReleases(client) {
  const items = []
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const batch = await client.listReleases({ page, limit: PAGE_LIMIT })
    if (!Array.isArray(batch)) throw new Error('Gitea Release 列表不是数组')
    items.push(...batch)
    if (batch.length < PAGE_LIMIT) return items
  }
  throw new Error('Gitea Release 列表超过 2000 条，已停止以免漏删')
}

function printPlan({ logger, tag, assets, rewritten }) {
  logger.log(`[dry-run] tag ${tag}`)
  logger.log('[dry-run] 附件:')
  for (const asset of assets) logger.log(`- ${asset.name} (${asset.size} 字节)`)
  logger.log('[dry-run] latest.json:')
  logger.log(rewritten)
}

// 归档 Release 说明：最近一条提交信息 + 本次 tag。latest.json 的 notes 保持空串（UI 从检查接口拿 version，无需重复正文）。
function buildReleaseNotes(projectRoot, tag, execImpl) {
  const run = execImpl ?? ((args) => execFileSync('git', args, { encoding: 'utf8' }))
  try {
    const subject = run(['-C', projectRoot, 'log', '-1', '--pretty=%s']).trim()
    return subject.length > 0 ? `${tag}\n\n${subject}` : tag
  } catch {
    return tag
  }
}

function readTauriVersion(projectRoot) {
  const manifestPath = path.join(projectRoot, 'src-tauri', 'tauri.conf.json')
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    throw new Error(`无法读取 tauri.conf.json：${messageOf(error)}`)
  }
  if (manifest === null || typeof manifest !== 'object' || typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new Error('tauri.conf.json 缺少 version')
  }
  return manifest.version
}

function fileAsset(file, contentType) {
  return {
    name: file.name,
    filePath: file.filePath,
    contentType,
    size: statSync(file.filePath).size,
  }
}

function toFile(dir, name) {
  if (name === null) return null
  return { name, filePath: path.join(dir, name) }
}

function listFiles(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory).filter((name) => statSync(path.join(directory, name)).isFile())
}

function compareCreatedAt(left, right) {
  return createdAtValue(left) - createdAtValue(right)
}

function createdAtValue(value) {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

function publishUsage() {
  return [
    '用法：',
    '  node scripts/publish-release.mjs [--api-base URL] [--owner NAME] [--repo NAME] [--token TOKEN] [--keep 7] [--dry-run]',
    '参数可改用环境变量 GITEA_API_BASE、GITEA_OWNER、GITEA_REPO、GITEA_TOKEN。',
    '--dry-run 只打印 tag、附件大小和改写后的 latest.json，不访问网络。',
    '--keep 是除 stable 以外保留的归档 Release 数量，默认 7。',
  ].join('\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  runPublish({ argv: process.argv.slice(2) }).then((result) => {
    process.exitCode = result.exitCode
  }).catch((error) => {
    console.error(messageOf(error))
    process.exitCode = 1
  })
}
