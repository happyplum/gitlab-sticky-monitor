import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { findArtifacts, rewriteLatestJson, runPublish, selectReleasesToPrune } from '../scripts/publish-release.mjs'

const apiBase = 'https://s.happyplum.cn:8888'
const owner = 'tools'
const repo = 'gitlab-sticky-monitor-releases'
const connection = ['--api-base', apiBase, '--owner', owner, '--repo', repo, '--token', 'secret']

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

function captureLogger() {
  const logs = []
  const errors = []
  return {
    logs,
    errors,
    log: (message) => logs.push(String(message)),
    error: (message) => errors.push(String(message)),
  }
}

function latestDocument(version, exeName) {
  return {
    version,
    notes: '修复轮询',
    pub_date: '2026-11-08T00:00:00Z',
    platforms: {
      'windows-x86_64': {
        signature: 'sig+value/==',
        url: exeName,
      },
    },
  }
}

function createProject(version = '0.1.0') {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'gsm-publish-'))
  const nsisDir = path.join(projectRoot, 'src-tauri', 'target', 'release', 'bundle', 'nsis')
  mkdirSync(path.join(projectRoot, 'src-tauri'), { recursive: true })
  writeFileSync(path.join(projectRoot, 'src-tauri', 'tauri.conf.json'), `${JSON.stringify({ version, productName: 'GitLab便笺监控' })}\n`)
  return {
    projectRoot,
    nsisDir,
    cleanup() {
      rmSync(projectRoot, { recursive: true, force: true })
    },
  }
}

function writeArtifacts(project, version = '0.1.0') {
  mkdirSync(project.nsisDir, { recursive: true })
  const exeName = `GitLab便笺监控_${version}_x64-setup.exe`
  const signatureName = `${exeName}.sig`
  writeFileSync(path.join(project.nsisDir, exeName), Buffer.from('exe-bytes'))
  writeFileSync(path.join(project.nsisDir, signatureName), Buffer.from('sig+value/=='))
  writeFileSync(path.join(project.nsisDir, `GitLab便笺监控_${version}_arm64-setup.exe`), Buffer.from('arm'))
  writeFileSync(path.join(project.nsisDir, 'GitLab便笺监控_9.9.9_x64-setup.exe'), Buffer.from('other'))
  return { exeName, signatureName }
}

describe('rewriteLatestJson', () => {
  it('把 windows url 改成 stable 绝对地址，signature 和其他字段保持不变', () => {
    const exeName = 'GitLab便笺监控_0.1.0_x64-setup.exe'
    const source = latestDocument('0.1.0', exeName)
    source.platforms['windows-x86_64'].signature = 'sig+value/=='
    const rewritten = rewriteLatestJson(JSON.stringify(source), {
      webBase: `${apiBase}/api/v1/`,
      owner,
      repo,
      exeName,
    })
    const parsed = JSON.parse(rewritten)
    const expected = `${apiBase}/${owner}/${repo}/releases/download/stable/${encodeURIComponent(exeName)}`
    assert.equal(parsed.platforms['windows-x86_64'].url, expected)
    assert.equal(parsed.platforms['windows-x86_64'].signature, 'sig+value/==')
    assert.equal(parsed.version, '0.1.0')
    assert.equal(parsed.notes, '修复轮询')
    assert.equal(parsed.pub_date, source.pub_date)
    assert.equal(rewritten.includes(exeName + '"'), false)
  })

  it('非法 JSON 直接抛出', () => {
    assert.throws(() => rewriteLatestJson('{', { webBase: apiBase, owner, repo, exeName: 'a.exe' }), SyntaxError)
  })
})

describe('findArtifacts', () => {
  it('按版本和 x64 找到安装包与签名（latest.json 由脚本自产）', () => {
    const project = createProject('0.1.0')
    try {
      const { exeName, signatureName } = writeArtifacts(project, '0.1.0')
      const found = findArtifacts(project.nsisDir, '0.1.0')
      assert.deepEqual(found.missing, [])
      assert.equal(found.setup.name, exeName)
      assert.equal(found.signature.name, signatureName)
      assert.equal(found.latest, null)
      assert.equal(found.setup.filePath, path.join(project.nsisDir, exeName))
    } finally {
      project.cleanup()
    }
  })

  it('目录缺失或文件不全时列出缺项', () => {
    const project = createProject('0.1.0')
    try {
      const absent = findArtifacts(project.nsisDir, '0.1.0')
      assert.equal(absent.setup, null)
      assert.equal(absent.signature, null)
      assert.deepEqual(absent.missing, [
        '*_0.1.0_x64-setup.exe',
        '*_0.1.0_x64-setup.exe.sig',
      ])
      mkdirSync(project.nsisDir, { recursive: true })
      writeFileSync(path.join(project.nsisDir, 'GitLab便笺监控_0.1.0_x64-setup.exe'), Buffer.from('exe'))
      const partial = findArtifacts(project.nsisDir, '0.1.0')
      assert.equal(partial.setup.name, 'GitLab便笺监控_0.1.0_x64-setup.exe')
      assert.equal(partial.signature, null)
      assert.deepEqual(partial.missing, [
        'GitLab便笺监控_0.1.0_x64-setup.exe.sig',
      ])
    } finally {
      project.cleanup()
    }
  })
})

describe('selectReleasesToPrune', () => {
  const releases = [
    { id: 1, tag_name: 'stable', created_at: '2020-01-01T00:00:00Z' },
    { id: 2, tag_name: 'v0.1.0', created_at: '2024-01-01T00:00:00Z' },
    { id: 3, tag_name: 'v0.2.0', created_at: '2025-01-01T00:00:00Z' },
    { id: 4, tag_name: 'v0.3.0', created_at: '2026-01-01T00:00:00Z' },
  ]

  it('默认保护 stable，只保留最新的 N 个归档', () => {
    assert.deepEqual(selectReleasesToPrune(releases, 2).map((release) => release.tag_name), ['v0.1.0'])
    assert.deepEqual(selectReleasesToPrune(releases, 1).map((release) => release.id), [2, 3])
  })

  it('keep 为 0、等于数量、大于数量时边界正确', () => {
    assert.deepEqual(selectReleasesToPrune(releases, 0).map((release) => release.tag_name), ['v0.1.0', 'v0.2.0', 'v0.3.0'])
    assert.deepEqual(selectReleasesToPrune(releases, 3), [])
    assert.deepEqual(selectReleasesToPrune(releases, 9), [])
    assert.deepEqual(selectReleasesToPrune([{ id: 1, tag_name: 'stable', created_at: '2026-06-01T00:00:00Z' }], 0), [])
  })

  it('相同时间保留先出现的，显式空保护列表不再豁免 stable', () => {
    const tied = [
      { id: 1, tag_name: 'a', created_at: '2026-01-01T00:00:00Z' },
      { id: 2, tag_name: 'b', created_at: '2026-01-01T00:00:00Z' },
    ]
    assert.deepEqual(selectReleasesToPrune(tied, 1).map((release) => release.tag_name), ['b'])
    assert.deepEqual(
      selectReleasesToPrune([{ id: 8, tag_name: 'stable', created_at: '2020-01-01T00:00:00Z' }], 0, []).map((release) => release.id),
      [8],
    )
    assert.deepEqual(selectReleasesToPrune([
      { id: 1, tag_name: 'stable', created_at: '2020-01-01T00:00:00Z' },
      { id: 2, tag_name: 'pinned', created_at: '2021-01-01T00:00:00Z' },
    ], 0, ['stable', 'pinned']), [])
  })
})

describe('runPublish', () => {
  it('参数缺失或 keep 非法时退出 2', async () => {
    const logger = captureLogger()
    let calls = 0
    const missing = await runPublish({
      argv: [],
      env: {},
      logger,
      fetchImpl: () => {
        calls += 1
        throw new Error('不应访问网络')
      },
    })
    assert.equal(missing.exitCode, 2)
    assert.match(logger.errors.join('\n'), /GITEA_TOKEN/)
    assert.equal(calls, 0)

    const badKeep = captureLogger()
    const rejected = await runPublish({
      argv: [...connection, '--keep', '-1'],
      env: {},
      logger: badKeep,
      fetchImpl: () => {
        calls += 1
        throw new Error('不应访问网络')
      },
    })
    assert.equal(rejected.exitCode, 2)
    assert.match(badKeep.errors.join('\n'), /非负整数/)
    assert.equal(calls, 0)
  })

  it('产物缺失时列出缺项并退出 1', async () => {
    const project = createProject('0.1.0')
    const logger = captureLogger()
    let calls = 0
    try {
      const result = await runPublish({
        argv: connection,
        env: {},
        projectRoot: project.projectRoot,
        logger,
        fetchImpl: () => {
          calls += 1
          throw new Error('不应访问网络')
        },
      })
      assert.equal(result.exitCode, 1)
      const errors = logger.errors.join('\n')
      assert.match(errors, /\*_0\.1\.0_x64-setup\.exe/)
      assert.equal(calls, 0)
    } finally {
      project.cleanup()
    }
  })

  it('已有同版本归档时拒绝发布', async () => {
    const project = createProject('0.1.0')
    const logger = captureLogger()
    const methods = []
    try {
      writeArtifacts(project, '0.1.0')
      const result = await runPublish({
        argv: connection,
        env: {},
        projectRoot: project.projectRoot,
        logger,
        fetchImpl: async (url, init = {}) => {
          const parsed = new URL(url instanceof URL ? url.href : String(url))
          const method = init.method ?? 'GET'
          methods.push(method)
          assert.equal(parsed.pathname.endsWith('/releases'), true)
          const limit = Number(parsed.searchParams.get('limit'))
          if (parsed.searchParams.get('page') === '1') {
            return response(200, Array.from({ length: limit }, (_, index) => ({
              id: index + 1,
              tag_name: `v0.0.${index}`,
              created_at: '2020-01-01T00:00:00Z',
              assets: [],
            })))
          }
          if (parsed.searchParams.get('page') === '2') {
            return response(200, [{ id: 99, tag_name: 'v0.1.0', created_at: '2021-01-01T00:00:00Z', assets: [] }])
          }
          throw new Error(`unexpected ${method} ${parsed.href}`)
        },
      })
      assert.deepEqual(methods, ['GET', 'GET'])
      assert.equal(result.exitCode, 1)
      assert.match(logger.errors.join('\n'), /请先 bump version/)
    } finally {
      project.cleanup()
    }
  })

  it('--dry-run 打印计划且不访问网络', async () => {
    const project = createProject('0.2.0')
    const logger = captureLogger()
    let calls = 0
    try {
      const { exeName } = writeArtifacts(project, '0.2.0')
      const result = await runPublish({
        argv: [...connection, '--dry-run'],
        env: {},
        projectRoot: project.projectRoot,
        logger,
        fetchImpl: () => {
          calls += 1
          throw new Error('不应访问网络')
        },
      })
      assert.equal(result.exitCode, 0)
      assert.equal(calls, 0)
      assert.equal(existsSync(path.join(project.nsisDir, 'latest.json')), false)
      const output = logger.logs.join('\n')
      const expectedUrl = `${apiBase}/${owner}/${repo}/releases/download/stable/${encodeURIComponent(exeName)}`
      assert.match(output, /\[dry-run\] tag v0\.2\.0/)
      assert.match(output, new RegExp(`- ${exeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(9 字节\\)`))
      assert.match(output, /- latest\.json \(\d+ 字节\)/)
      assert.ok(output.includes(expectedUrl))
      assert.ok(output.includes('sig+value/=='))
      assert.equal(output.includes('secret'), false)
    } finally {
      project.cleanup()
    }
  })

  it('更新已有 stable、上传三份产物、创建归档并删掉超出 keep 的旧 Release', async () => {
    const project = createProject('0.1.0')
    const logger = captureLogger()
    const requests = []
    let archived = null
    try {
      const { exeName, signatureName } = writeArtifacts(project, '0.1.0')
      const result = await runPublish({
        argv: [...connection, '--keep', '1'],
        env: {},
        projectRoot: project.projectRoot,
        logger,
        execImpl: () => 'fix(poller): 修复轮询抖动',
        fetchImpl: async (url, init = {}) => {
          const href = url instanceof URL ? url.href : String(url)
          const parsed = new URL(href)
          const method = init.method ?? 'GET'
          let attachment = null
          if (init.body instanceof FormData) {
            const file = init.body.get('attachment')
            attachment = { name: file.name, type: file.type, text: await file.text() }
          }
          requests.push({
            method,
            pathname: parsed.pathname,
            name: parsed.searchParams.get('name'),
            body: typeof init.body === 'string' ? init.body : null,
            authorization: init.headers?.Authorization,
            attachment,
          })
          if (method === 'GET' && parsed.pathname.endsWith('/releases')) {
            return response(200, [
              {
                id: 1,
                tag_name: 'stable',
                created_at: '2026-01-01T00:00:00Z',
                assets: [
                  { id: 10, name: 'old.exe' },
                  { id: 11, name: 'old.json' },
                ],
              },
              { id: 2, tag_name: 'v0.0.1', created_at: '2026-02-01T00:00:00Z', assets: [] },
              { id: 3, tag_name: 'v0.0.2', created_at: '2026-03-01T00:00:00Z', assets: [] },
              ...(archived ? [archived] : []),
            ])
          }
          if (method === 'DELETE' && /\/assets\/\d+$/.test(parsed.pathname)) return response(204, null)
          if (method === 'PATCH' && parsed.pathname.endsWith('/releases/1')) return response(200, { id: 1, tag_name: 'stable' })
          if (method === 'POST' && parsed.pathname.endsWith('/assets')) return response(201, { id: 100 })
          if (method === 'POST' && parsed.pathname.endsWith('/releases')) {
            const payload = JSON.parse(init.body)
            assert.equal(payload.tag_name, 'v0.1.0')
            archived = { id: 9, tag_name: 'v0.1.0', created_at: '2026-11-01T00:00:00Z', assets: [] }
            return response(201, archived)
          }
          if (method === 'DELETE' && /\/releases\/\d+$/.test(parsed.pathname)) return response(204, null)
          throw new Error(`unexpected ${method} ${href}`)
        },
      })
      assert.equal(result.exitCode, 0)
      assert.equal(result.releaseId, 9)
      assert.deepEqual(requests.map((record) => record.method), [
        'GET', 'DELETE', 'DELETE', 'PATCH',
        'POST', 'POST', 'POST',
        'POST',
        'POST', 'POST', 'POST',
        'GET',
        'DELETE', 'DELETE',
      ])
      assert.equal(requests[1].pathname.endsWith('/releases/1/assets/10'), true)
      assert.equal(requests[2].pathname.endsWith('/releases/1/assets/11'), true)
      assert.equal(JSON.parse(requests[3].body).body, 'v0.1.0\n\nfix(poller): 修复轮询抖动')
      assert.equal(JSON.parse(requests[3].body).name, 'stable')
      assert.deepEqual(requests.slice(4, 7).map((record) => record.name), [exeName, signatureName, 'latest.json'])
      assert.ok(requests.slice(4, 7).every((record) => record.pathname.endsWith('/releases/1/assets')))
      assert.equal(JSON.parse(requests[7].body).tag_name, 'v0.1.0')
      assert.equal(JSON.parse(requests[7].body).name, 'v0.1.0')
      assert.deepEqual(requests.slice(8, 11).map((record) => record.name), [exeName, signatureName, 'latest.json'])
      assert.ok(requests.slice(8, 11).every((record) => record.pathname.endsWith('/releases/9/assets')))
      const uploadedLatest = requests[6].attachment.text
      const parsedLatest = JSON.parse(uploadedLatest)
      assert.equal(parsedLatest.platforms['windows-x86_64'].signature, 'sig+value/==')
      assert.equal(
        parsedLatest.platforms['windows-x86_64'].url,
        `${apiBase}/${owner}/${repo}/releases/download/stable/${encodeURIComponent(exeName)}`,
      )
      assert.equal(requests[4].attachment.text, 'exe-bytes')
      assert.equal(requests[5].attachment.text, 'sig+value/==')
      assert.equal(requests[12].pathname.endsWith('/releases/2'), true)
      assert.equal(requests[13].pathname.endsWith('/releases/3'), true)
      assert.ok(requests.every((record) => record.authorization === 'token secret'))
      const output = logger.logs.join('\n')
      assert.match(output, /已删除 stable 附件/)
      assert.match(output, /已更新 stable 说明/)
      assert.match(output, /已创建归档 Release v0\.1\.0/)
      assert.match(output, /已删除旧 Release id=2 tag=v0\.0\.1/)
      assert.match(output, /发布完成/)
      assert.equal(output.includes('secret'), false)
    } finally {
      project.cleanup()
    }
  })

  it('没有 stable 时先创建稳定通道，再上传并归档', async () => {
    const project = createProject('0.1.0')
    const logger = captureLogger()
    const createdTags = []
    const uploadTargets = []
    try {
      writeArtifacts(project, '0.1.0')
      const result = await runPublish({
        argv: connection,
        env: {},
        projectRoot: project.projectRoot,
        logger,
        execImpl: () => 'fix(poller): 修复轮询抖动',
        fetchImpl: async (url, init = {}) => {
          const parsed = new URL(url instanceof URL ? url.href : String(url))
          const method = init.method ?? 'GET'
          if (method === 'GET') return response(200, [])
          if (method === 'POST' && parsed.pathname.endsWith('/releases')) {
            const payload = JSON.parse(init.body)
            createdTags.push(payload.tag_name)
            assert.equal(payload.body, 'v0.1.0\n\nfix(poller): 修复轮询抖动')
            const id = payload.tag_name === 'stable' ? 4 : 5
            return response(201, { id, tag_name: payload.tag_name, created_at: '2026-11-08T00:00:00Z', assets: [] })
          }
          if (method === 'POST' && parsed.pathname.endsWith('/assets')) {
            uploadTargets.push(parsed.pathname)
            return response(201, { id: 1 })
          }
          if (method === 'DELETE') throw new Error(`不应删除 ${parsed.pathname}`)
          throw new Error(`unexpected ${method} ${parsed.href}`)
        },
      })
      assert.equal(result.exitCode, 0)
      assert.deepEqual(createdTags, ['stable', 'v0.1.0'])
      assert.equal(uploadTargets.filter((pathname) => pathname.endsWith('/releases/4/assets')).length, 3)
      assert.equal(uploadTargets.filter((pathname) => pathname.endsWith('/releases/5/assets')).length, 3)
      assert.match(logger.logs.join('\n'), /已创建 stable/)
      assert.match(logger.logs.join('\n'), /没有需要删除的旧 Release/)
    } finally {
      project.cleanup()
    }
  })
})
