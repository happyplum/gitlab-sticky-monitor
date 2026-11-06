import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoteSaver } from '../src/windows/noteSaver.ts';

test('flush waits for the newest edit and coalesces intermediate drafts', async () => {
  const writes = [], releases = [], statuses = [];
  const saver = createNoteSaver(value => new Promise(resolve => { writes.push(value); releases.push(resolve); }), status => statuses.push(status.state));
  saver.set('first');
  saver.set('second');
  saver.set('last character');
  const closing = saver.flush();
  assert.deepEqual(writes, ['first']);
  releases.shift()();
  await Promise.resolve();
  assert.deepEqual(writes, ['first', 'last character']);
  assert.equal(statuses.at(-1), 'saving');
  releases.shift()();
  await closing;
  assert.equal(statuses.at(-1), 'saved');
});

test('failed writes retain the latest draft and an explicit flush retries it', async () => {
  let fail = true;
  const writes = [], statuses = [];
  const saver = createNoteSaver(async value => { writes.push(value); if (fail) throw Error('disk full'); }, status => statuses.push(status));
  saver.set('keep this');
  await assert.rejects(saver.flush(), /disk full/);
  assert.equal(statuses.at(-1).state, 'error');
  fail = false;
  await saver.flush();
  assert.deepEqual(writes, ['keep this', 'keep this']);
  assert.equal(statuses.at(-1).state, 'saved');
});
