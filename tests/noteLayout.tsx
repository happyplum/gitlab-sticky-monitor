import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { emit } from '@tauri-apps/api/event';
import { createRoot } from 'react-dom/client';
import { StickyNote } from '../src/windows/StickyNote';
import { NOTE_COLORS } from '../src/constants';
import type { Issue, MergeRequest, NoteConfig, NoteFeed, Todo } from '../src/types/gitlab';
import '../src/styles/global.css';

// Synthetic fixtures; only IPC is mocked, the production note renders unchanged.
const params = new URLSearchParams(location.search);
const feed = params.get('feed') || 'mrs';
const user = { id: 1, username: 'example', name: 'Example', avatar_url: null, web_url: 'https://example.invalid/user' };
const titles = [
  'feat(electron): 按平台惰性加载并支持 Windows 沙箱重置',
  'Draft: feat(electron): 接入用户工作区、独立 Host 与会话归档',
  'fix(electron): 为 Windows 本地环境提供保全与原生恢复',
  '这是一条用于检查自然换行的完整长标题。'.repeat(12),
];
const issues: Issue[] = Array.from({ length: 16 }, (_, i) => ({
  id: i + 1, iid: 64 + i, title: titles[i] || `示例任务 ${i + 1}`, description: null,
  state: 'opened', web_url: `https://example.invalid/issues/${64 + i}`,
  created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z',
  labels: ['urgent'], author: user, assignees: [], user_notes_count: 2, upvotes: 0, downvotes: 0,
}));
const mrs: MergeRequest[] = issues.map((issue, i) => ({
  ...issue, web_url: `https://example.invalid/merge_requests/${issue.iid}`,
  source_branch: `feature/example-${i}`, target_branch: 'main', reviewers: [user],
  draft: i === 1 || i === 2, merge_status: 'can_be_merged',
  head_pipeline: { id: i, status: 'success', web_url: 'https://example.invalid/pipeline' },
}));
const todos: Todo[] = issues.map(issue => ({
  id: issue.id, body: issue.title, action_name: 'assigned', target_type: 'Issue',
  target_url: issue.web_url, state: 'pending', created_at: issue.created_at, author: user,
  project: { id: 1, name: '示例项目', path_with_namespace: 'example/project' },
}));
const common = {
  id: 'note-layout', color: NOTE_COLORS[Number(params.get('color') || 0)].value,
  is_open: true, always_on_top: true, position: { x: 100, y: 100 }, size: { w: 340, h: 450 },
};
const note: NoteConfig = feed === 'custom' ? {
  ...common, kind: 'custom', document: { root: {
    type: 'root', version: 1, format: '', indent: 0, direction: null,
    children: [{ type: 'paragraph', version: 1, format: '', indent: 0, direction: null, children: [] }],
  } },
} : {
  ...common, kind: 'gitlab', feed: feed as NoteFeed, source_id: 'layout-source', repo_id: 1,
  repo_name: 'tnyma2.0 示例仓库名称较长时省略', filters: { only_assigned_to_me: false, labels: [] },
};
const state = { note, opened: [] as string[], refreshes: 0, saves: 0,
  focus: (focused: boolean) => emit('tauri://focus', focused),
};
Object.assign(window, { __layout: state });
mockWindows(note.id);
mockIPC((command, args: Record<string, any> = {}) => {
  switch (command) {
    case 'get_note_config': return structuredClone(note);
    case 'get_sources': return [{ id: 'layout-source', name: '示例公司', base_url: 'https://example.invalid', token: '' }];
    case 'get_merge_requests': state.refreshes++; return params.has('empty') ? [] : mrs;
    case 'get_issues': state.refreshes++; return params.has('empty') ? [] : issues;
    case 'get_todos': state.refreshes++; return params.has('empty') ? [] : todos;
    case 'get_current_user': return user;
    case 'plugin:window|is_focused': return false;
    case 'plugin:window|scale_factor': return 1;
    case 'plugin:shell|open': state.opened.push(args.path); return;
    case 'save_note_document':
      if (note.kind === 'custom') note.document = args.document;
      state.saves++; return;
    case 'hide_note': note.is_open = false; return;
    case 'update_note_config':
      if (args.color !== undefined) note.color = args.color;
      if (args.alwaysOnTop !== undefined) note.always_on_top = args.alwaysOnTop;
      return;
    default: return null;
  }
}, { shouldMockEvents: true });
createRoot(document.getElementById('root')!).render(<StickyNote noteId={note.id} />);
