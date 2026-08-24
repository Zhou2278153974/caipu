import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderFridgeView } from '../src/views/fridge.js';
import { AiClientError, AiErrorType } from '../src/ai-client.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

function mount(services = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  renderFridgeView(container, services);
  return container;
}

function flush(ms = 0) {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * 常用 mock：内部 added 数组模拟 IndexedDB，让列表刷新能反映增删改结果
 */
function defaultServices(extra = {}) {
  const added = [];
  const services = {
    getApiConfig: vi.fn().mockResolvedValue({ base_url: '', api_key: '', model: '' }),
    getAllFridgeIngredients: vi.fn().mockImplementation(() =>
      Promise.resolve(added.slice().sort((a, b) => b.added_at - a.added_at))
    ),
    getFridgeIngredient: vi.fn().mockImplementation((id) =>
      Promise.resolve(added.find((x) => x.id === id) || null)
    ),
    addFridgeIngredient: vi.fn().mockImplementation((ing) => {
      const rec = { ...ing, id: added.length + 1, added_at: Date.now() };
      added.push(rec);
      return Promise.resolve(rec);
    }),
    updateFridgeIngredient: vi.fn().mockImplementation((ing) => {
      const idx = added.findIndex((x) => x.id === ing.id);
      if (idx >= 0) added[idx] = { ...added[idx], ...ing };
      return Promise.resolve(ing);
    }),
    deleteFridgeIngredient: vi.fn().mockImplementation((id) => {
      const idx = added.findIndex((x) => x.id === id);
      if (idx >= 0) added.splice(idx, 1);
      return Promise.resolve(true);
    }),
    streamChat: vi.fn(),
    fileToDataUrl: vi.fn(),
    aiErrorMessage: (e) => `AI 识别失败：${e.message}`,
    ...extra,
  };
  return { services, added };
}

/** 点右上角「+ 添加食材」→ 返回选择菜单 overlay */
function openMenu(c) {
  c.querySelector('#fridge-add-btn').click();
  return document.querySelector('.fridge-modal-overlay');
}

/** 走选择菜单进入「手动添加」子页 */
function gotoManual(c) {
  openMenu(c);
  document.querySelector('#fridge-menu-manual').click();
}

/** 走选择菜单进入「AI 识别添加」子页 */
function gotoAi(c) {
  openMenu(c);
  document.querySelector('#fridge-menu-ai').click();
}

// ============ 列表视图骨架 ============
describe('我的冰箱 - 列表视图骨架', () => {
  it('渲染标题、右上角添加按钮、总览区、食材列表区', async () => {
    const { services } = defaultServices();
    const c = mount(services);
    await flush();
    expect(c.querySelector('.section-title').textContent).toContain('我的冰箱');
    expect(c.querySelector('#fridge-add-btn').textContent).toContain('添加食材');
    expect(c.querySelector('#fridge-overview')).toBeTruthy();
    expect(c.querySelector('#fridge-list')).toBeTruthy();
    expect(c.querySelector('#fridge-status')).toBeTruthy();
  });

  it('空冰箱：总数 0、空状态文案与「添加第一条」入口', async () => {
    const { services } = defaultServices();
    const c = mount(services);
    await flush();
    expect(services.getAllFridgeIngredients).toHaveBeenCalledTimes(1);
    expect(c.querySelector('.recipe-count').textContent).toContain('0');
    expect(c.querySelector('.fridge-overview-num').textContent).toBe('0');
    expect(c.querySelector('#fridge-list').textContent).toContain('空空如也');
    expect(c.querySelector('#btn-empty-add')).toBeTruthy();
  });

  it('已有食材：渲染列表行（序号/名称/数量单位/编辑/删除）与总览', async () => {
    const { services, added } = defaultServices();
    added.push({ id: 1, name: '排骨', amount: '2', unit: '斤', added_at: 3 });
    added.push({ id: 2, name: '白菜', amount: '1', unit: '棵', added_at: 2 });
    const c = mount(services);
    await flush();
    const items = c.querySelectorAll('.fridge-item');
    expect(items.length).toBe(2);
    expect(c.querySelector('.recipe-count').textContent).toContain('2');
    expect(c.querySelector('.fridge-overview-num').textContent).toBe('2');
    // 总览最近添加：按 added_at 倒序（后加在前）
    const tags = [...c.querySelectorAll('.fridge-overview-tag')].map((t) => t.textContent);
    expect(tags[0]).toContain('排骨');
    expect(tags[1]).toContain('白菜');
    // 行内容
    const first = items[0];
    expect(first.querySelector('.fridge-item-name').textContent).toBe('排骨');
    expect(first.querySelector('.fridge-item-amount').textContent).toBe('2 斤');
    expect(first.querySelector('[data-action="edit"]')).toBeTruthy();
    expect(first.querySelector('[data-action="delete"]')).toBeTruthy();
  });

  it('加载失败：显示错误状态与空态，不崩溃', async () => {
    const { services } = defaultServices({
      getAllFridgeIngredients: vi.fn().mockRejectedValue(new Error('DB 打不开')),
    });
    const c = mount(services);
    await flush();
    expect(c.querySelector('#fridge-status').className).toContain('status-error');
    expect(c.querySelector('#fridge-status').textContent).toContain('DB 打不开');
    expect(c.querySelector('#fridge-list').textContent).toContain('空空如也');
  });
});

// ============ 总览区 ============
describe('我的冰箱 - 总览区', () => {
  it('超过 5 种食材：最近添加只显示 5 条，最新的在前', async () => {
    const { services, added } = defaultServices();
    for (let i = 6; i >= 1; i -= 1) {
      added.push({ id: i, name: `食材${i}`, amount: '', unit: '', added_at: i });
    }
    const c = mount(services);
    await flush();
    expect(c.querySelector('.fridge-overview-num').textContent).toBe('6');
    const tags = [...c.querySelectorAll('.fridge-overview-tag')].map((t) => t.textContent);
    expect(tags.length).toBe(5);
    expect(tags[0]).toContain('食材6');
    expect(tags[4]).toContain('食材2');
  });
});

// ============ 搜索与分页 ============
describe('我的冰箱 - 搜索与分页', () => {
  it('渲染搜索框', async () => {
    const { services } = defaultServices();
    const c = mount(services);
    await flush();
    expect(c.querySelector('#fridge-search')).toBeTruthy();
    expect(c.querySelector('#fridge-search').getAttribute('placeholder')).toContain('搜索');
  });

  it('搜索按食材名过滤；总数/总览仍为全部数量', async () => {
    const { services, added } = defaultServices();
    added.push({ id: 1, name: '排骨', amount: '2', unit: '斤', added_at: 2 });
    added.push({ id: 2, name: '白菜', amount: '1', unit: '棵', added_at: 1 });
    const c = mount(services);
    await flush();
    const search = c.querySelector('#fridge-search');
    search.value = '白';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    const items = c.querySelectorAll('.fridge-item');
    expect(items.length).toBe(1);
    expect(items[0].querySelector('.fridge-item-name').textContent).toBe('白菜');
    // 列表被过滤，但总数与总览不变
    expect(c.querySelector('.recipe-count').textContent).toContain('2');
    expect(c.querySelector('.fridge-overview-num').textContent).toBe('2');
  });

  it('搜索无匹配 → 显示「没有匹配的食材」，不渲染分页', async () => {
    const { services, added } = defaultServices();
    added.push({ id: 1, name: '排骨', amount: '', unit: '', added_at: 1 });
    const c = mount(services);
    await flush();
    const search = c.querySelector('#fridge-search');
    search.value = '不存在的食材';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    expect(c.querySelector('#fridge-list').textContent).toContain('没有匹配的食材');
    expect(c.querySelector('.pagination')).toBeNull();
  });

  it('一页显示 20 条：25 种食材时第 1 页只显示 20 条，分页信息正确', async () => {
    const { services, added } = defaultServices();
    for (let i = 25; i >= 1; i -= 1) {
      added.push({ id: i, name: `食材${i}`, amount: '', unit: '', added_at: i });
    }
    const c = mount(services);
    await flush();
    expect(c.querySelectorAll('.fridge-item').length).toBe(20);
    const pag = c.querySelector('.pagination');
    expect(pag).toBeTruthy();
    expect(pag.dataset.total).toBe('25');
    expect(pag.dataset.pages).toBe('2');
    expect(pag.querySelector('.pagination-info').textContent).toContain('第 1-20 条 / 共 25 条');
    expect(c.querySelector('[data-act="prev"]').disabled).toBe(true);
    expect(c.querySelector('[data-act="next"]').disabled).toBe(false);
  });

  it('点「下一页」→ 第 2 页显示剩余 5 条，序号连续从 21 开始', async () => {
    const { services, added } = defaultServices();
    for (let i = 25; i >= 1; i -= 1) {
      added.push({ id: i, name: `食材${i}`, amount: '', unit: '', added_at: i });
    }
    const c = mount(services);
    await flush();
    c.querySelector('[data-act="next"]').click();
    await flush();
    expect(c.querySelectorAll('.fridge-item').length).toBe(5);
    expect(c.querySelector('.fridge-item-index').textContent).toBe('21');
    expect(c.querySelector('.fridge-item-name').textContent).toBe('食材5');
    expect(c.querySelector('.pagination').dataset.page).toBe('2');
    expect(c.querySelector('.pagination-info').textContent).toContain('第 21-25 条 / 共 25 条');
    expect(c.querySelector('[data-act="next"]').disabled).toBe(true);
  });

  it('点「首页」回到第 1 页，列表回到前 20 条', async () => {
    const { services, added } = defaultServices();
    for (let i = 25; i >= 1; i -= 1) {
      added.push({ id: i, name: `食材${i}`, amount: '', unit: '', added_at: i });
    }
    const c = mount(services);
    await flush();
    c.querySelector('[data-act="next"]').click();
    await flush();
    c.querySelector('[data-act="first"]').click();
    await flush();
    expect(c.querySelector('.pagination').dataset.page).toBe('1');
    expect(c.querySelectorAll('.fridge-item').length).toBe(20);
    expect(c.querySelector('.fridge-item-name').textContent).toBe('食材25');
  });

  it('搜索时自动回到第 1 页：翻到第 2 页后输入搜索，回到第 1 页', async () => {
    const { services, added } = defaultServices();
    for (let i = 25; i >= 1; i -= 1) {
      added.push({ id: i, name: `食材${i}`, amount: '', unit: '', added_at: i });
    }
    const c = mount(services);
    await flush();
    c.querySelector('[data-act="next"]').click();
    await flush();
    expect(c.querySelector('.pagination').dataset.page).toBe('2');
    const search = c.querySelector('#fridge-search');
    search.value = '食材5';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    expect(c.querySelector('.pagination').dataset.page).toBe('1');
    // 25 条里名字包含「食材5」的只有「食材5」1 条
    expect(c.querySelectorAll('.fridge-item').length).toBe(1);
    expect(c.querySelector('.pagination-info').textContent).toContain('共 1 条');
  });

  it('正好 20 条：仅 1 页，下一页/末页禁用', async () => {
    const { services, added } = defaultServices();
    for (let i = 20; i >= 1; i -= 1) {
      added.push({ id: i, name: `食材${i}`, amount: '', unit: '', added_at: i });
    }
    const c = mount(services);
    await flush();
    expect(c.querySelectorAll('.fridge-item').length).toBe(20);
    const pag = c.querySelector('.pagination');
    expect(pag).toBeTruthy();
    expect(pag.dataset.pages).toBe('1');
    expect(c.querySelector('[data-act="next"]').disabled).toBe(true);
    expect(c.querySelector('[data-act="last"]').disabled).toBe(true);
  });
});

// ============ 添加流程（选择菜单 + 子页切换） ============
describe('我的冰箱 - 添加流程（选择菜单 + 子页切换）', () => {
  it('点「+ 添加食材」→ 弹出选择菜单（手动 / AI / 取消）', async () => {
    const { services } = defaultServices();
    const c = mount(services);
    await flush();
    const overlay = openMenu(c);
    expect(overlay).toBeTruthy();
    expect(overlay.querySelector('#fridge-menu-manual')).toBeTruthy();
    expect(overlay.querySelector('#fridge-menu-ai')).toBeTruthy();
    expect(overlay.querySelector('#fridge-menu-cancel')).toBeTruthy();
    overlay.querySelector('#fridge-menu-cancel').click();
    expect(document.querySelector('.fridge-modal-overlay')).toBeNull();
  });

  it('选择「手动添加」→ 切到手动添加子页（返回按钮 + 表单）', async () => {
    const { services } = defaultServices();
    const c = mount(services);
    await flush();
    gotoManual(c);
    expect(c.querySelector('.sub-nav')).toBeTruthy();
    expect(c.querySelector('.section-title').textContent).toContain('手动添加');
    expect(c.querySelector('#fridge-name')).toBeTruthy();
    expect(c.querySelector('#fridge-add-btn').textContent).toBe('添加');
  });

  it('选择「AI 识别添加」→ 切到 AI 识别子页（返回按钮 + 文本/图片入口）', async () => {
    const { services } = defaultServices();
    const c = mount(services);
    await flush();
    gotoAi(c);
    expect(c.querySelector('.sub-nav')).toBeTruthy();
    expect(c.querySelector('.section-title').textContent).toContain('AI 识别添加');
    expect(c.querySelector('#fridge-ai-text')).toBeTruthy();
    expect(c.querySelector('#fridge-ai-file')).toBeTruthy();
  });

  it('子页点「← 返回我的冰箱」→ 回到列表视图', async () => {
    const { services } = defaultServices();
    const c = mount(services);
    await flush();
    gotoManual(c);
    c.querySelector('.sub-nav .btn-back').click();
    await flush();
    expect(c.querySelector('#fridge-list')).toBeTruthy();
    expect(c.querySelector('.section-title').textContent).toContain('我的冰箱');
  });

  it('空状态「添加第一条」→ 弹出选择菜单', async () => {
    const { services } = defaultServices();
    const c = mount(services);
    await flush();
    c.querySelector('#btn-empty-add').click();
    expect(document.querySelector('#fridge-menu-manual')).toBeTruthy();
  });
});

// ============ 手动添加 / 编辑 ============
describe('我的冰箱 - 手动添加 / 编辑', () => {
  it('手动添加成功：调用 addFridgeIngredient，返回列表显示成功并新增行与总览', async () => {
    const { services } = defaultServices();
    const c = mount(services);
    await flush();
    gotoManual(c);
    c.querySelector('#fridge-name').value = '  排骨  ';
    c.querySelector('#fridge-amount').value = '2';
    c.querySelector('#fridge-unit').value = '斤';
    c.querySelector('#fridge-add-btn').click();
    await flush();
    expect(services.addFridgeIngredient).toHaveBeenCalledTimes(1);
    expect(services.addFridgeIngredient).toHaveBeenCalledWith({ name: '排骨', amount: '2', unit: '斤' });
    // 回到列表，显示成功提示与新增行
    expect(c.querySelector('.section-title').textContent).toContain('我的冰箱');
    expect(c.querySelector('#fridge-status').className).toContain('status-success');
    expect(c.querySelector('#fridge-status').textContent).toContain('已添加「排骨」');
    expect(c.querySelector('.fridge-item-name').textContent).toBe('排骨');
    expect(c.querySelector('.fridge-overview-num').textContent).toBe('1');
  });

  it('食材名为空 → 警告，不调用 add', async () => {
    const { services } = defaultServices();
    const c = mount(services);
    await flush();
    gotoManual(c);
    c.querySelector('#fridge-add-btn').click();
    await flush();
    expect(services.addFridgeIngredient).not.toHaveBeenCalled();
    expect(c.querySelector('#fridge-status').className).toContain('status-warning');
    expect(c.querySelector('#fridge-status').textContent).toContain('请输入食材名');
  });

  it('添加失败：显示错误，停留在添加页', async () => {
    const { services } = defaultServices({
      addFridgeIngredient: vi.fn().mockRejectedValue(new Error('写入失败')),
    });
    const c = mount(services);
    await flush();
    gotoManual(c);
    c.querySelector('#fridge-name').value = '土豆';
    c.querySelector('#fridge-add-btn').click();
    await flush();
    expect(c.querySelector('#fridge-status').className).toContain('status-error');
    expect(c.querySelector('#fridge-status').textContent).toContain('写入失败');
    expect(c.querySelector('#fridge-name').value).toBe('土豆');
    expect(c.querySelector('.section-title').textContent).toContain('手动添加');
  });

  it('编辑：点行内「编辑」→ 手动页回填并变「保存修改」；保存 → updateFridgeIngredient → 返回列表', async () => {
    const { services, added } = defaultServices();
    added.push({ id: 7, name: '土豆', amount: '1', unit: '斤', added_at: 1 });
    const c = mount(services);
    await flush();
    c.querySelector('[data-action="edit"]').click();
    await flush();
    expect(c.querySelector('.section-title').textContent).toContain('编辑食材');
    expect(c.querySelector('#fridge-name').value).toBe('土豆');
    expect(c.querySelector('#fridge-amount').value).toBe('1');
    expect(c.querySelector('#fridge-unit').value).toBe('斤');
    expect(c.querySelector('#fridge-add-btn').textContent).toBe('保存修改');
    expect(c.querySelector('#fridge-cancel-edit')).toBeTruthy();
    // 修改数量后保存
    c.querySelector('#fridge-amount').value = '2';
    c.querySelector('#fridge-add-btn').click();
    await flush();
    expect(services.updateFridgeIngredient).toHaveBeenCalledTimes(1);
    expect(services.updateFridgeIngredient).toHaveBeenCalledWith({ id: 7, name: '土豆', amount: '2', unit: '斤' });
    // 返回列表 + 成功提示 + 数据更新
    expect(c.querySelector('.section-title').textContent).toContain('我的冰箱');
    expect(c.querySelector('#fridge-status').textContent).toContain('已更新「土豆」');
    expect(c.querySelector('.fridge-item-amount').textContent).toBe('2 斤');
  });

  it('编辑中点「取消」→ 返回列表，不更新', async () => {
    const { services, added } = defaultServices();
    added.push({ id: 7, name: '土豆', amount: '1', unit: '斤', added_at: 1 });
    const c = mount(services);
    await flush();
    c.querySelector('[data-action="edit"]').click();
    await flush();
    c.querySelector('#fridge-cancel-edit').click();
    await flush();
    expect(services.updateFridgeIngredient).not.toHaveBeenCalled();
    expect(c.querySelector('.section-title').textContent).toContain('我的冰箱');
    expect(c.querySelector('.fridge-item-amount').textContent).toBe('1 斤');
  });
});

// ============ 删除 ============
describe('我的冰箱 - 删除', () => {
  it('点行内「删除」→ 确认框；确认 → deleteFridgeIngredient，列表刷新 + 成功提示', async () => {
    const { services, added } = defaultServices();
    added.push({ id: 7, name: '土豆', amount: '1', unit: '斤', added_at: 1 });
    const c = mount(services);
    await flush();
    c.querySelector('[data-action="delete"]').click();
    await flush();
    const overlay = document.querySelector('.fridge-modal-overlay');
    expect(overlay).toBeTruthy();
    expect(overlay.textContent).toContain('土豆');
    overlay.querySelector('#fridge-confirm-ok').click();
    await flush();
    expect(services.deleteFridgeIngredient).toHaveBeenCalledWith(7);
    expect(document.querySelector('.fridge-modal-overlay')).toBeNull();
    expect(c.querySelector('#fridge-status').className).toContain('status-success');
    expect(c.querySelector('#fridge-list').textContent).toContain('空空如也');
  });

  it('确认框点「取消」→ 不删除', async () => {
    const { services, added } = defaultServices();
    added.push({ id: 7, name: '土豆', amount: '', unit: '', added_at: 1 });
    const c = mount(services);
    await flush();
    c.querySelector('[data-action="delete"]').click();
    await flush();
    document.querySelector('.fridge-modal-overlay').querySelector('#fridge-confirm-cancel').click();
    await flush();
    expect(services.deleteFridgeIngredient).not.toHaveBeenCalled();
    expect(document.querySelector('.fridge-modal-overlay')).toBeNull();
  });
});

// ============ AI 识别：未配置 API ============
describe('我的冰箱 - AI 识别（未配置 API）', () => {
  it('识别文字时未配置 → 弹配置提示框，不调用 streamChat', async () => {
    const { services } = defaultServices();
    const c = mount(services);
    await flush();
    gotoAi(c);
    c.querySelector('#fridge-ai-text').value = '两斤排骨';
    c.querySelector('#fridge-ai-text-btn').click();
    await flush();
    const overlay = document.querySelector('.fridge-modal-overlay');
    expect(overlay).toBeTruthy();
    expect(overlay.textContent).toContain('配置 AI API');
    expect(services.streamChat).not.toHaveBeenCalled();
  });

  it('弹框点「去设置」→ 调用 goToView(settings, { subpage: "api" }) 并关闭弹框', async () => {
    const goToView = vi.fn();
    const { services } = defaultServices({ goToView });
    const c = mount(services);
    await flush();
    gotoAi(c);
    c.querySelector('#fridge-ai-text').value = '两斤排骨';
    c.querySelector('#fridge-ai-text-btn').click();
    await flush();
    const overlay = document.querySelector('.fridge-modal-overlay');
    overlay.querySelector('#fridge-ai-config-go').click();
    await flush();
    expect(goToView).toHaveBeenCalledWith('settings', { subpage: 'api' });
    expect(document.querySelector('.fridge-modal-overlay')).toBeNull();
  });

  it('弹框点「取消」→ 关闭不跳转', async () => {
    const goToView = vi.fn();
    const { services } = defaultServices({ goToView });
    const c = mount(services);
    await flush();
    gotoAi(c);
    c.querySelector('#fridge-ai-text').value = '两斤排骨';
    c.querySelector('#fridge-ai-text-btn').click();
    await flush();
    const overlay = document.querySelector('.fridge-modal-overlay');
    overlay.querySelector('#fridge-ai-config-cancel').click();
    await flush();
    expect(goToView).not.toHaveBeenCalled();
    expect(document.querySelector('.fridge-modal-overlay')).toBeNull();
  });
});

// ============ AI 识别：文字 ============
describe('我的冰箱 - AI 识别（文字）', () => {
  const CFG = { base_url: 'https://x/v1', api_key: 'sk-1', model: 'm1' };

  it('已配置 + 有文字：调用 streamChat，渲染结果，一键加入冰箱并返回列表', async () => {
    const streamChat = vi.fn().mockResolvedValue({
      content: '[{"name":"排骨","amount":"2","unit":"斤"},{"name":"白菜","amount":"1","unit":"棵"}]',
      reasoning: '',
    });
    const { services } = defaultServices({ getApiConfig: vi.fn().mockResolvedValue(CFG), streamChat });
    const c = mount(services);
    await flush();
    gotoAi(c);
    c.querySelector('#fridge-ai-text').value = '两斤排骨、一棵白菜、一瓶洗发水';
    c.querySelector('#fridge-ai-text-btn').click();
    await flush(20);
    // streamChat 被调用：messages[0] 为系统提示，messages[1] 为用户输入文字
    expect(streamChat).toHaveBeenCalledTimes(1);
    const messages = streamChat.mock.calls[0][1];
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('食材识别');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toContain('两斤排骨');
    // 结果渲染（2 个食材项 + 加入按钮）
    const items = c.querySelectorAll('.fridge-ai-item');
    expect(items.length).toBe(2);
    expect(c.querySelector('#fridge-ai-add-selected')).toBeTruthy();
    // 一键加入
    c.querySelector('#fridge-ai-add-selected').click();
    await flush(20);
    expect(services.addFridgeIngredient).toHaveBeenCalledTimes(2);
    expect(services.addFridgeIngredient).toHaveBeenCalledWith({ name: '排骨', amount: '2', unit: '斤' });
    expect(services.addFridgeIngredient).toHaveBeenCalledWith({ name: '白菜', amount: '1', unit: '棵' });
    // 返回列表 + 成功提示
    expect(c.querySelector('.section-title').textContent).toContain('我的冰箱');
    expect(c.querySelector('#fridge-status').className).toContain('status-success');
    expect(c.querySelector('#fridge-status').textContent).toContain('已将 2 种食材加入冰箱');
  });

  it('文字为空：提示警告，不调用 streamChat', async () => {
    const streamChat = vi.fn();
    const { services } = defaultServices({ getApiConfig: vi.fn().mockResolvedValue(CFG), streamChat });
    const c = mount(services);
    await flush();
    gotoAi(c);
    c.querySelector('#fridge-ai-text-btn').click();
    await flush();
    expect(streamChat).not.toHaveBeenCalled();
    expect(c.querySelector('#fridge-ai-status').className).toContain('status-warning');
    expect(c.querySelector('#fridge-ai-status').textContent).toContain('请先输入');
  });

  it('AI 返回 ```json 包裹的数组也能正确解析', async () => {
    const streamChat = vi.fn().mockResolvedValue({
      content: '好的，识别结果如下：\n```json\n[{"name":"鸡蛋","amount":"6","unit":"个"}]\n```',
      reasoning: '',
    });
    const { services } = defaultServices({ getApiConfig: vi.fn().mockResolvedValue(CFG), streamChat });
    const c = mount(services);
    await flush();
    gotoAi(c);
    c.querySelector('#fridge-ai-text').value = '买了两盒鸡蛋，每盒三个';
    c.querySelector('#fridge-ai-text-btn').click();
    await flush(20);
    expect(c.querySelectorAll('.fridge-ai-item')).toHaveLength(1);
    expect(c.querySelector('.fridge-ai-item-name').textContent).toBe('鸡蛋');
  });

  it('AI 识别出 0 个食材（全为非食材）→ 警告提示，不渲染结果项', async () => {
    const streamChat = vi.fn().mockResolvedValue({ content: '[]', reasoning: '' });
    const { services } = defaultServices({ getApiConfig: vi.fn().mockResolvedValue(CFG), streamChat });
    const c = mount(services);
    await flush();
    gotoAi(c);
    c.querySelector('#fridge-ai-text').value = '一瓶洗发水、一盒抽纸';
    c.querySelector('#fridge-ai-text-btn').click();
    await flush(20);
    expect(c.querySelectorAll('.fridge-ai-item')).toHaveLength(0);
    expect(c.querySelector('#fridge-ai-status').className).toContain('status-warning');
    expect(c.querySelector('#fridge-ai-status').textContent).toContain('没有识别到食材');
  });

  it('AI 返回非法 JSON → 视为未识别，警告不崩溃', async () => {
    const streamChat = vi.fn().mockResolvedValue({ content: '抱歉，我看不清', reasoning: '' });
    const { services } = defaultServices({ getApiConfig: vi.fn().mockResolvedValue(CFG), streamChat });
    const c = mount(services);
    await flush();
    gotoAi(c);
    c.querySelector('#fridge-ai-text').value = '随便一段文字';
    c.querySelector('#fridge-ai-text-btn').click();
    await flush(20);
    expect(c.querySelector('#fridge-ai-status').className).toContain('status-warning');
    expect(c.querySelector('#fridge-ai-status').textContent).toContain('没有识别到食材');
  });

  it('AI 识别失败（网络错误）→ 显示错误状态，按钮恢复可用', async () => {
    const streamChat = vi.fn().mockRejectedValue(new AiClientError(AiErrorType.NETWORK, 'Failed to fetch'));
    const { services } = defaultServices({ getApiConfig: vi.fn().mockResolvedValue(CFG), streamChat });
    const c = mount(services);
    await flush();
    gotoAi(c);
    c.querySelector('#fridge-ai-text').value = '两斤排骨';
    c.querySelector('#fridge-ai-text-btn').click();
    await flush(20);
    expect(c.querySelector('#fridge-ai-status').className).toContain('status-error');
    expect(c.querySelector('#fridge-ai-status').textContent).toContain('AI 识别失败');
    expect(c.querySelector('#fridge-ai-text-btn').disabled).toBe(false);
  });

  it('AI 结果中取消勾选某些食材 → 只加入勾选的项', async () => {
    const streamChat = vi.fn().mockResolvedValue({
      content: '[{"name":"排骨","amount":"2","unit":"斤"},{"name":"白菜","amount":"1","unit":"棵"}]',
      reasoning: '',
    });
    const { services } = defaultServices({ getApiConfig: vi.fn().mockResolvedValue(CFG), streamChat });
    const c = mount(services);
    await flush();
    gotoAi(c);
    c.querySelector('#fridge-ai-text').value = '两斤排骨、一棵白菜';
    c.querySelector('#fridge-ai-text-btn').click();
    await flush(20);
    // 取消勾选第一个（排骨）
    const checks = c.querySelectorAll('.fridge-ai-item input');
    checks[0].checked = false;
    checks[0].dispatchEvent(new Event('change', { bubbles: true }));
    c.querySelector('#fridge-ai-add-selected').click();
    await flush(20);
    expect(services.addFridgeIngredient).toHaveBeenCalledTimes(1);
    expect(services.addFridgeIngredient).toHaveBeenCalledWith({ name: '白菜', amount: '1', unit: '棵' });
  });
});

// ============ AI 识别：图片 ============
describe('我的冰箱 - AI 识别（图片）', () => {
  const CFG = { base_url: 'https://x/v1', api_key: 'sk-1', model: 'm1' };

  function selectFile(c) {
    const input = c.querySelector('#fridge-ai-file');
    const file = new File(['fake-image-bytes'], 'receipt.jpg', { type: 'image/jpeg' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return file;
  }

  it('选中图片后显示文件名并自动识别', async () => {
    const streamChat = vi.fn().mockResolvedValue({ content: '[]', reasoning: '' });
    const { services } = defaultServices({ getApiConfig: vi.fn().mockResolvedValue(CFG), streamChat });
    const c = mount(services);
    await flush();
    gotoAi(c);
    selectFile(c);
    await flush(20);
    expect(c.querySelector('#fridge-ai-file-name').textContent).toContain('receipt.jpg');
    expect(streamChat).toHaveBeenCalledTimes(1);
  });

  it('识别图片：fileToDataUrl 转 base64，user 消息包含 image_url', async () => {
    const streamChat = vi.fn().mockResolvedValue({
      content: '[{"name":"牛肉","amount":"1","unit":"斤"}]',
      reasoning: '',
    });
    const fileToDataUrl = vi.fn().mockResolvedValue('data:image/jpeg;base64,AAAA');
    const { services } = defaultServices({ getApiConfig: vi.fn().mockResolvedValue(CFG), streamChat, fileToDataUrl });
    const c = mount(services);
    await flush();
    gotoAi(c);
    selectFile(c);
    await flush(20);
    expect(fileToDataUrl).toHaveBeenCalledTimes(1);
    expect(streamChat).toHaveBeenCalledTimes(1);
    const messages = streamChat.mock.calls[0][1];
    const userContent = messages[1].content;
    expect(Array.isArray(userContent)).toBe(true);
    // 包含图片块
    const imagePart = userContent.find((p) => p.type === 'image_url');
    expect(imagePart).toBeTruthy();
    expect(imagePart.image_url.url).toBe('data:image/jpeg;base64,AAAA');
    // 结果渲染
    expect(c.querySelector('.fridge-ai-item-name').textContent).toBe('牛肉');
  });

  it('未配置 API 时上传图片 → 弹配置提示，不调用 fileToDataUrl', async () => {
    const { services } = defaultServices();
    const c = mount(services);
    await flush();
    gotoAi(c);
    selectFile(c);
    await flush();
    const overlay = document.querySelector('.fridge-modal-overlay');
    expect(overlay).toBeTruthy();
    expect(overlay.textContent).toContain('配置 AI API');
    expect(services.fileToDataUrl).not.toHaveBeenCalled();
  });
});
