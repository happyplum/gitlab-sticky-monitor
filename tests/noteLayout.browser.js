async page => {
  const results = [];
  const check = (name, passed, evidence) => results.push({ name, passed, evidence });
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const load = async (feed, extra = '') => {
    await page.goto(`http://localhost:1420/tests/noteLayout.html?feed=${feed}${extra}`);
    await page.locator(feed === 'custom' ? '.rich-text' : extra.includes('empty') ? '.empty' : '.item-card, .todo-item').first().waitFor();
    await page.mouse.move(-1, -1);
    await settle();
  };
  const geometry = () => page.evaluate(() => {
    const rect = element => { const r = element.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
    const content = document.querySelector('.note-content, .editor-body');
    return { content: rect(content), scroll: content.scrollTop,
      items: [...document.querySelectorAll('.item-card, .todo-item')].map(rect) };
  });
  const focus = async value => { await page.evaluate(value => window.__layout.focus(value), value); await settle(); };
  await page.setViewportSize({ width: 340, height: 450 });
  for (const feed of ['mrs', 'issues', 'todos']) {
    await load(feed);
    const before = await geometry();
    await page.mouse.move(150, 150);
    await settle();
    const hovered = await geometry();
    await focus(true);
    const active = await geometry();
    await focus(false);
    const blurred = await geometry();
    check(`${feed}: hover/focus/blur geometry stable`, [hovered, active, blurred].every(value => JSON.stringify(value) === JSON.stringify(before)), { before, active });
    const items = page.locator('.item-card, .todo-item');
    check(`${feed}: existing 15 item limit`, await items.count() === 15);
    const second = await items.nth(1).boundingBox();
    await page.mouse.move(second.x + 30, second.y + 16);
    await page.mouse.down();
    await focus(true);
    await page.mouse.up();
    check(`${feed}: first click opens intended second item once`, await page.evaluate(feed => {
      const expected = feed === 'mrs' ? 'https://example.invalid/merge_requests/65' : 'https://example.invalid/issues/65';
      return window.__layout.opened.length === 1 && window.__layout.opened[0] === expected;
    }, feed));
    await page.locator('.note-content').evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.evaluate(() => { document.activeElement?.blur(); });
    await focus(false);
    const scrolled = await geometry();
    const last = await items.last().boundingBox();
    await page.mouse.move(last.x + 30, last.y + 16);
    await page.mouse.down();
    await focus(true);
    const pressed = await geometry();
    await page.mouse.up();
    check(`${feed}: bottom click keeps scroll and target`, JSON.stringify(scrolled) === JSON.stringify(pressed) && await page.evaluate(() => window.__layout.opened.length === 2 && window.__layout.opened[1].endsWith('/78')));
    check(`${feed}: title only`, await page.locator('.item-meta, .item-icon, .item-labels, .item-reviewers, .todo-action').count() === 0);
    check(`${feed}: long title not clamped`, await items.nth(3).locator('.item-title, .todo-body').evaluate(element => getComputedStyle(element).webkitLineClamp === 'none' && element.scrollHeight <= element.clientHeight));
    const text = await items.first().innerText();
    check(`${feed}: number precedes title`, feed === 'todos' ? text.startsWith('feat(') : text.startsWith(feed === 'mrs' ? '!64 ' : '#64 '), text);
    if (feed === 'mrs') {
      check('MR: existing Draft prefix appears once', await items.nth(1).innerText() === '!65 Draft: feat(electron): 接入用户工作区、独立 Host 与会话归档');
      check('MR: draft without prefix remains marked', (await items.nth(2).innerText()).includes('草稿'));
    }
    const footer = await page.locator('.note-footer').boundingBox();
    check(`${feed}: fixed footer and shared update time`, footer?.height === 32 && await page.locator('.note-footer').innerText().then(text => text.includes('更新于')));
    await load(feed, '&empty=1');
    check(`${feed}: empty state`, await page.locator('.empty').isVisible());
  }
  await load('mrs');
  const hidden = await page.locator('.note-controls').evaluate(element => getComputedStyle(element).opacity === '0');
  await page.keyboard.press('Tab');
  check('keyboard: tools revealed when reached', hidden && await page.getByRole('button', { name: '便笺设置', exact: true }).evaluate(element => element === document.activeElement && getComputedStyle(element.parentElement).opacity === '1'));
  await page.keyboard.press('Enter');
  check('keyboard: settings opens', await page.locator('.note-settings-overlay').isVisible());
  await page.getByRole('button', { name: '关闭设置', exact: true }).click();
  await page.getByRole('button', { name: '取消置顶', exact: true }).click();
  check('pin action preserved', await page.evaluate(() => !window.__layout.note.always_on_top));
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await page.waitForFunction(() => window.__layout.refreshes === 2);
  check('refresh action preserved', true);
  for (const width of [340, 200]) {
    await page.setViewportSize({ width, height: width === 200 ? 120 : 450 });
    await load('custom');
    const before = await geometry();
    await focus(true);
    check(`custom ${width}: editor height stable`, JSON.stringify(before) === JSON.stringify(await geometry()));
    const editor = page.getByRole('textbox', { name: '便笺内容' });
    await editor.fill('格式与保存验证');
    await page.keyboard.press('Control+a');
    await page.getByRole('button', { name: '加粗', exact: true }).click();
    await page.waitForFunction(() => window.__layout.saves > 0 && document.querySelector('.format-bold:not(button)'));
    check(`custom ${width}: format and save`, await page.evaluate(() => JSON.stringify(window.__layout.note.document).includes('格式与保存验证')));
    check(`custom ${width}: no horizontal overflow`, await page.evaluate(() => {
      const toolbar = document.querySelector('.editor-toolbar');
      return toolbar.scrollWidth <= toolbar.clientWidth && document.documentElement.scrollWidth <= innerWidth;
    }));
    await page.getByRole('button', { name: '收起便笺', exact: true }).click();
    await page.waitForFunction(() => !window.__layout.note.is_open);
    check(`custom ${width}: close saves content`, await page.evaluate(() => JSON.stringify(window.__layout.note.document).includes('格式与保存验证')));
  }
  const result = { passed: results.every(result => result.passed), results };
  await page.evaluate(result => { window.__layoutResult = result; }, result);
  return result;
}
