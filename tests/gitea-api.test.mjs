import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  GiteaApiError,
  createGiteaClient,
  parseCliArgs,
  readNonNegativeInteger,
  resolveGiteaConfig,
} from '../scripts/gitea-api.mjs'

const apiBase = 'https://s.happyplum.cn:8888'

function response(status, payload) {
  const body = payload == null ? '' : typeof payload === 'string' ? payload : JSON.stringify(payload)
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return body
    },
  }
}

function createMock(handler) {
  const requests = []
  const fetchImpl = async (url, init = {}) => {
    const href = url instanceof URL ? url.href : String(url)
    let attachment = null
    let multipartContentType = null
    if (init.body instanceof FormData) {
      const file = init.body.get('attachment')
      attachment = {
        name: file?.name ?? null,
        type: file?.type ?? null,
        text: file ? await file.text() : null,
      }
      const probe = new Request('https://probe.invalid/upload', { method: 'POST', body: init.body })
      multipartContentType = probe.headers.get('content-type')
    }
    const record = {
      href,
      method: init.method,
      headers: init.headers,
      body: init.body instanceof FormData ? null : init.body ?? null,
      attachment,
      multipartContentType,
    }
    requests.push(record)
    return handler(record)
  }
  return { requests, fetchImpl }
}

describe('parseCliArgs', () => {
  it('解析等号、空格和 dry-run，并保留位置参数', () => {
    const parsed = parseCliArgs(['--api-base', apiBase, '--owner=tools', '--dry-run', '--keep', '0', 'extra'])
    assert.deepEqual(parsed.positionals, ['extra'])
    assert.equal(parsed.flags['api-base'], apiBase)
    assert.equal(parsed.flags.owner, 'tools')
    assert.equal(parsed.flags['dry-run'], true)
    assert.equal(parsed.flags.keep, '0')
  })
})

describe('readNonNegativeInteger', () => {
  it('缺省用 fallback，0 合法，负数和非整数拒绝', () => {
    assert.equal(readNonNegativeInteger(undefined, 7), 7)
    assert.equal(readNonNegativeInteger('0', 7), 0)
    assert.equal(readNonNegativeInteger('12', 7), 12)
    assert.equal(readNonNegativeInteger('-1', 7), null)
    assert.equal(readNonNegativeInteger('1.5', 7), null)
    assert.equal(readNonNegativeInteger('abc', 7), null)
  })
})

describe('resolveGiteaConfig', () => {
  it('命令行优先于环境变量，空 flag 回退到环境变量', () => {
    const env = {
      GITEA_API_BASE: 'https://env.example',
      GITEA_OWNER: 'env-owner',
      GITEA_REPO: 'env-repo',
      GITEA_TOKEN: 'env-token',
    }
    const resolved = resolveGiteaConfig({
      'api-base': 'https://flags.example',
      owner: 'flag-owner',
      repo: '   ',
      token: 'flag-token',
    }, env)
    assert.equal(resolved.baseUrl, 'https://flags.example')
    assert.equal(resolved.owner, 'flag-owner')
    assert.equal(resolved.repo, 'env-repo')
    assert.equal(resolved.token, 'flag-token')
    assert.deepEqual(resolved.missing, [])
  })

  it('flag 和环境变量都缺时列出全部缺失项', () => {
    const resolved = resolveGiteaConfig({}, {})
    assert.deepEqual(resolved.missing, [
      '--api-base 或 GITEA_API_BASE',
      '--owner 或 GITEA_OWNER',
      '--repo 或 GITEA_REPO',
      '--token 或 GITEA_TOKEN',
    ])
  })

  it('只有环境变量时也能配齐', () => {
    const resolved = resolveGiteaConfig({}, {
      GITEA_API_BASE: apiBase,
      GITEA_OWNER: 'tools',
      GITEA_REPO: 'gitlab-sticky-monitor-releases',
      GITEA_TOKEN: 'secret',
    })
    assert.equal(resolved.baseUrl, apiBase)
    assert.equal(resolved.owner, 'tools')
    assert.equal(resolved.repo, 'gitlab-sticky-monitor-releases')
    assert.equal(resolved.token, 'secret')
    assert.deepEqual(resolved.missing, [])
  })
})

describe('createGiteaClient', () => {
  it('按 Gitea 路径发请求，Authorization 为 token 前缀', async () => {
    const { requests, fetchImpl } = createMock((record) => {
      const pathname = new URL(record.href).pathname
      if (record.method === 'GET' && pathname.endsWith('/releases')) return response(200, [])
      if (record.method === 'GET' && pathname.endsWith('/releases/tags/stable')) return response(200, { id: 4, tag_name: 'stable' })
      if (record.method === 'POST' && pathname.endsWith('/releases')) return response(201, { id: 9 })
      if (record.method === 'PATCH') return response(200, { id: 4 })
      if (record.method === 'DELETE') return response(204, null)
      throw new Error(`unexpected ${record.method} ${record.href}`)
    })
    const client = createGiteaClient({
      baseUrl: `${apiBase}/api/v1/`,
      owner: 'tools',
      repo: 'gitlab-sticky-monitor-releases',
      token: 'secret',
      fetchImpl,
    })
    const root = `${apiBase}/api/v1/repos/tools/gitlab-sticky-monitor-releases`

    assert.deepEqual(await client.listReleases(), [])
    assert.deepEqual(await client.getReleaseByTag('stable'), { id: 4, tag_name: 'stable' })
    assert.deepEqual(await client.createRelease({ tagName: 'stable', name: 'stable', body: '说明' }), { id: 9 })
    assert.deepEqual(await client.updateRelease(4, { name: 'stable', body: '说明' }), { id: 4 })
    assert.equal(await client.deleteAsset(4, 8), null)
    assert.equal(await client.deleteRelease(4), null)

    assert.deepEqual(requests.map((record) => `${record.method} ${record.href}`), [
      `GET ${root}/releases?page=1&limit=50`,
      `GET ${root}/releases/tags/stable`,
      `POST ${root}/releases`,
      `PATCH ${root}/releases/4`,
      `DELETE ${root}/releases/4/assets/8`,
      `DELETE ${root}/releases/4`,
    ])
    assert.equal(JSON.parse(requests[2].body).tag_name, 'stable')
    assert.equal(JSON.parse(requests[2].body).body, '说明')
    assert.equal(JSON.parse(requests[3].body).name, 'stable')
    assert.ok(requests.every((record) => record.headers.Authorization === 'token secret'))
    assert.ok(requests.every((record) => record.headers.Accept === 'application/json'))
    assert.equal(requests[2].headers['Content-Type'], 'application/json')
  })

  it('上传附件使用 multipart FormData，query name 与文件名一致', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'gsm-gitea-api-'))
    const filePath = path.join(directory, 'sample.exe')
    writeFileSync(filePath, Buffer.from('exe-bytes'))
    try {
      const { requests, fetchImpl } = createMock(() => response(201, { id: 3, name: 'sample.exe' }))
      const client = createGiteaClient({
        baseUrl: apiBase,
        owner: 'tools',
        repo: 'gitlab-sticky-monitor-releases',
        token: 'secret',
        fetchImpl,
      })
      const created = await client.uploadAsset(7, { name: 'sample.exe', filePath, contentType: 'application/octet-stream' })
      assert.deepEqual(created, { id: 3, name: 'sample.exe' })
      const record = requests[0]
      const url = new URL(record.href)
      assert.equal(record.method, 'POST')
      assert.equal(url.pathname, '/api/v1/repos/tools/gitlab-sticky-monitor-releases/releases/7/assets')
      assert.equal(url.searchParams.get('name'), 'sample.exe')
      assert.equal(record.headers.Authorization, 'token secret')
      assert.equal(record.headers['Content-Type'], undefined)
      assert.match(record.multipartContentType, /^multipart\/form-data; boundary=/)
      assert.equal(record.attachment.name, 'sample.exe')
      assert.equal(record.attachment.type, 'application/octet-stream')
      assert.equal(record.attachment.text, 'exe-bytes')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('非 2xx 抛出 GiteaApiError', async () => {
    const { fetchImpl } = createMock(() => response(403, { message: 'forbidden' }))
    const client = createGiteaClient({
      baseUrl: apiBase,
      owner: 'tools',
      repo: 'gitlab-sticky-monitor-releases',
      token: 'secret',
      fetchImpl,
    })
    await assert.rejects(client.listReleases(), (error) => {
      assert.ok(error instanceof GiteaApiError)
      assert.equal(error.status, 403)
      assert.match(error.message, /403/)
      return true
    })
  })
})
