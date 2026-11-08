import { readFile } from 'node:fs/promises'

const DEFAULT_PAGE_LIMIT = 50

export class GiteaApiError extends Error {
  constructor(status, body) {
    const snippet = String(body ?? '').slice(0, 200)
    super(`Gitea API 请求失败（${status}）：${snippet}`)
    this.name = 'GiteaApiError'
    this.status = status
    this.body = snippet
  }
}

export function toApiRoot(baseUrl) {
  const trimmed = String(baseUrl ?? '').trim().replace(/\/+$/, '')
  if (trimmed.endsWith('/api/v1')) return trimmed
  return `${trimmed}/api/v1`
}

export function parseCliArgs(argv) {
  const positionals = []
  const flags = {}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument.startsWith('--')) {
      positionals.push(argument)
      continue
    }
    const body = argument.slice(2)
    const separator = body.indexOf('=')
    const key = separator === -1 ? body : body.slice(0, separator)
    if (key === 'dry-run') {
      flags[key] = true
      continue
    }
    if (separator !== -1) {
      flags[key] = body.slice(separator + 1)
      continue
    }
    const next = argv[index + 1]
    if (next === undefined || next.startsWith('--')) {
      flags[key] = true
      continue
    }
    flags[key] = next
    index += 1
  }
  return { positionals, flags }
}

export function resolveGiteaConfig(flags, env = process.env) {
  const baseUrl = present(flags['api-base']) ?? present(env.GITEA_API_BASE)
  const owner = present(flags.owner) ?? present(env.GITEA_OWNER)
  const repo = present(flags.repo) ?? present(env.GITEA_REPO)
  const token = present(flags.token) ?? present(env.GITEA_TOKEN)
  const missing = []
  if (baseUrl === undefined) missing.push('--api-base 或 GITEA_API_BASE')
  if (owner === undefined) missing.push('--owner 或 GITEA_OWNER')
  if (repo === undefined) missing.push('--repo 或 GITEA_REPO')
  if (token === undefined) missing.push('--token 或 GITEA_TOKEN')
  return { baseUrl, owner, repo, token, missing }
}

export function readNonNegativeInteger(value, fallback) {
  if (value === undefined) return fallback
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null
  return Number(value)
}

function present(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function createGiteaClient({ baseUrl, owner, repo, token, fetchImpl = globalThis.fetch }) {
  const apiRoot = toApiRoot(baseUrl)
  const repoPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`

  async function request(method, pathname, { query, json, body, headers } = {}) {
    const url = new URL(`${apiRoot}${pathname}`)
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null) continue
      url.searchParams.set(key, String(value))
    }
    // Gitea 只认 "token <token>"，不认 Bearer。
    const requestHeaders = {
      Accept: 'application/json',
      ...headers,
      Authorization: `token ${token}`,
    }
    const init = { method, headers: requestHeaders }
    if (json !== undefined) {
      requestHeaders['Content-Type'] = 'application/json'
      init.body = JSON.stringify(json)
    } else if (body !== undefined) {
      // multipart 的 boundary 必须由 fetch 生成；自己写 Content-Type 时 Gitea 读不到 attachment。
      if (typeof FormData !== 'undefined' && body instanceof FormData) {
        delete requestHeaders['Content-Type']
        delete requestHeaders['content-type']
      }
      init.body = body
    }
    const response = await fetchImpl(url, init)
    const text = await response.text()
    if (!response.ok) throw new GiteaApiError(response.status, text)
    if (text.length === 0) return null
    try {
      return JSON.parse(text)
    } catch {
      throw new GiteaApiError(response.status, text)
    }
  }

  return {
    listReleases({ page = 1, limit = DEFAULT_PAGE_LIMIT } = {}) {
      return request('GET', `${repoPath}/releases`, { query: { page, limit } })
    },
    getReleaseByTag(tag) {
      return request('GET', `${repoPath}/releases/tags/${encodeURIComponent(tag)}`)
    },
    createRelease({ tagName, name, body, targetCommitish }) {
      const payload = { tag_name: tagName, name, body }
      if (typeof targetCommitish === 'string' && targetCommitish.length > 0) payload.target_commitish = targetCommitish
      return request('POST', `${repoPath}/releases`, { json: payload })
    },
    updateRelease(releaseId, { name, body, tagName, targetCommitish, draft, prerelease } = {}) {
      const payload = {}
      if (name !== undefined) payload.name = name
      if (body !== undefined) payload.body = body
      if (tagName !== undefined) payload.tag_name = tagName
      if (typeof targetCommitish === 'string' && targetCommitish.length > 0) payload.target_commitish = targetCommitish
      if (draft !== undefined) payload.draft = draft
      if (prerelease !== undefined) payload.prerelease = prerelease
      return request('PATCH', `${repoPath}/releases/${encodeURIComponent(String(releaseId))}`, { json: payload })
    },
    async uploadAsset(releaseId, { name, filePath, bytes, contentType }) {
      if (typeof name !== 'string' || name.length === 0) throw new Error('上传附件缺少文件名')
      const payload = bytes ?? await readFile(filePath)
      const form = new FormData()
      form.append('attachment', new Blob([payload], { type: contentType ?? 'application/octet-stream' }), name)
      return request('POST', `${repoPath}/releases/${encodeURIComponent(String(releaseId))}/assets`, {
        query: { name },
        body: form,
      })
    },
    deleteAsset(releaseId, attachmentId) {
      return request('DELETE', `${repoPath}/releases/${encodeURIComponent(String(releaseId))}/assets/${encodeURIComponent(String(attachmentId))}`)
    },
    deleteRelease(releaseId) {
      return request('DELETE', `${repoPath}/releases/${encodeURIComponent(String(releaseId))}`)
    },
  }
}
