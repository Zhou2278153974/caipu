import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderSettingsView } from '../src/views/settings.js';
import { AiClientError, AiErrorType } from '../src/ai-client.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

function mount(services = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  renderSettingsView(container, services);
  return container;
}

function flush(ms = 0) {
  return new Promise((res) => setTimeout(res, ms));
}

/** 进入某个二级分类（在首页点击对应卡片） */
function enterCategory(container, cat) {
  const card = container.querySelector(`.settings-category-card[data-cat="${cat}"]`);
  if (!card) throw new Error(`找不到分类卡片：${cat}`);
  card.click();
}

// ============ 设置首页（一级） ============
describe('设置页 - 一级首页（四分类）', () => {
  it('默认渲染设置首页：四张分类卡片 + 标题', () => {
    const c = mount();
    // 标题和说明
    expect(c.querySelector('.section-title').textContent).toContain('设置');
    expect(c.querySelector('.section-desc')).toBeTruthy();
    // 四张卡片
    const cards = c.querySelectorAll('.settings-category-card');
    expect(cards.length).toBe(4);
    const cats = Array.from(cards).map((el) => el.dataset.cat);
    expect(cats).toEqual(['api', 'theme', 'preferences', 'data-mgmt']);
  });

  it('四张卡片都有图标、标题、说明、箭头', () => {
    const c = mount();
    const cards = c.querySelectorAll('.settings-category-card');
    cards.forEach((card) => {
      expect(card.querySelector('.settings-category-icon')).toBeTruthy();
      expect(card.querySelector('.settings-category-title')).toBeTruthy();
      expect(card.querySelector('.settings-category-desc')).toBeTruthy();
      expect(card.querySelector('.settings-category-arrow')).toBeTruthy();
    });
    // API 卡片标题
    expect(c.querySelector('.settings-category-card[data-cat="api"] .settings-category-title').textContent).toBe('API 设置');
    expect(c.querySelector('.settings-category-card[data-cat="theme"] .settings-category-title').textContent).toBe('主题设置');
    expect(c.querySelector('.settings-category-card[data-cat="preferences"] .settings-category-title').textContent).toBe('偏好设置');
    expect(c.querySelector('.settings-category-card[data-cat="data-mgmt"] .settings-category-title').textContent).toBe('数据管理');
  });

  it('点「API 设置」卡片 → 进入二级页，出现返回按钮 + 配置表单元素', () => {
    const c = mount();
    enterCategory(c, 'api');
    expect(c.querySelector('.btn-back')).toBeTruthy();
    expect(c.querySelector('#cfg-base-url')).toBeTruthy();
    expect(c.querySelector('#cfg-api-key')).toBeTruthy();
    expect(c.querySelector('#cfg-model-select')).toBeTruthy();
    expect(c.querySelector('#cfg-model-manual')).toBeTruthy();
    expect(c.querySelector('#btn-fetch-models')).toBeTruthy();
    expect(c.querySelector('#btn-save-config')).toBeTruthy();
  });

  it('点「偏好设置」卡片 → 进入二级页，出现返回按钮 + 输入 + 列表', () => {
    const c = mount();
    enterCategory(c, 'preferences');
    expect(c.querySelector('.btn-back')).toBeTruthy();
    expect(c.querySelector('#pref-input')).toBeTruthy();
    expect(c.querySelector('#pref-add-btn')).toBeTruthy();
    expect(c.querySelector('#pref-list')).toBeTruthy();
  });

  it('点「数据管理」卡片 → 进入二级页，出现返回按钮 + 两个清除区块 + 确认弹框结构', () => {
    const c = mount();
    enterCategory(c, 'data-mgmt');
    expect(c.querySelector('.btn-back')).toBeTruthy();
    expect(c.querySelector('#data-mgmt-counts')).toBeTruthy();
    expect(c.querySelector('#btn-clear-except-recipes')).toBeTruthy();
    expect(c.querySelector('#btn-clear-recipes')).toBeTruthy();
    expect(c.querySelector('#confirm-modal')).toBeTruthy();
    expect(c.querySelector('#confirm-ok')).toBeTruthy();
    expect(c.querySelector('#confirm-cancel')).toBeTruthy();
  });

  it('进入任意二级页后，点「返回设置」按钮 → 回到首页三分类', () => {
    const c = mount();
    enterCategory(c, 'api');
    // 在 API 页
    expect(c.querySelector('#cfg-base-url')).toBeTruthy();
    // 点返回
    c.querySelector('[data-action="back-to-home"]').click();
    // 回到首页：卡片再次出现，cfg-base-url 没了
    expect(c.querySelector('.settings-category-card[data-cat="api"]')).toBeTruthy();
    expect(c.querySelector('#cfg-base-url')).toBeNull();
  });
});

// ============ 二级：API 设置（原测试，加了进入二级页步骤） ============
describe('设置页 - 二级：API 设置', () => {
  it('初始 select 仅占位 option', async () => {
    const c = mount();
    enterCategory(c, 'api');
    await flush();
    const opts = c.querySelectorAll('#cfg-model-select option');
    expect(opts).toHaveLength(1);
    expect(opts[0].value).toBe('');
  });

  it('挂载时从存储加载：若 model 不在列表里，则放入手动输入框', async () => {
    const getApiConfig = vi.fn().mockResolvedValue({
      base_url: 'https://api.x.com/v1',
      api_key: 'sk-loaded',
      model: 'gpt-4o', // 此时 select 里只有占位选项
    });
    const c = mount({ getApiConfig });
    enterCategory(c, 'api');
    await flush();
    expect(getApiConfig).toHaveBeenCalled();
    expect(c.querySelector('#cfg-base-url').value).toBe('https://api.x.com/v1');
    expect(c.querySelector('#cfg-api-key').value).toBe('sk-loaded');
    expect(c.querySelector('#cfg-model-manual').value).toBe('gpt-4o');
    expect(c.querySelector('#cfg-model-select').value).toBe('');
  });

  it('无配置时表单为空', async () => {
    const c = mount({ getApiConfig: vi.fn().mockResolvedValue({ base_url: '', api_key: '', model: '' }) });
    enterCategory(c, 'api');
    await flush();
    expect(c.querySelector('#cfg-base-url').value).toBe('');
    expect(c.querySelector('#cfg-api-key').value).toBe('');
    expect(c.querySelector('#cfg-model-select').value).toBe('');
    expect(c.querySelector('#cfg-model-manual').value).toBe('');
  });
});

describe('设置页 - 二级：API 保存', () => {
  it('select 有值且手动输入为空：保存 select 中的模型', async () => {
    const saveApiConfig = vi.fn().mockResolvedValue({});
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue({ base_url: '', api_key: '', model: '' }),
      saveApiConfig,
    });
    enterCategory(c, 'api');
    await flush();
    c.querySelector('#cfg-base-url').value = 'https://api.y.com/v1';
    c.querySelector('#cfg-api-key').value = 'sk-123';
    // 手动向 select 注入一个选项并选中
    const sel = c.querySelector('#cfg-model-select');
    sel.innerHTML = '<option value=""></option><option value="m1" selected>M1</option>';
    c.querySelector('#btn-save-config').click();
    await flush();
    expect(saveApiConfig).toHaveBeenCalledWith({
      base_url: 'https://api.y.com/v1',
      api_key: 'sk-123',
      model: 'm1',
    });
    expect(c.querySelector('#cfg-status').className).toContain('status-success');
  });

  it('手动输入优先：手动填了则以手动值为准保存', async () => {
    const saveApiConfig = vi.fn().mockResolvedValue({});
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue({ base_url: '', api_key: '', model: '' }),
      saveApiConfig,
    });
    enterCategory(c, 'api');
    await flush();
    c.querySelector('#cfg-base-url').value = 'https://api.y.com/v1';
    c.querySelector('#cfg-api-key').value = 'sk-123';
    // select 选中一个
    const sel = c.querySelector('#cfg-model-select');
    sel.innerHTML = '<option value=""></option><option value="m1" selected>M1</option>';
    // 手动输入另一值 → 应优先使用
    c.querySelector('#cfg-model-manual').value = 'custom-model';
    c.querySelector('#btn-save-config').click();
    await flush();
    expect(saveApiConfig).toHaveBeenCalledWith({
      base_url: 'https://api.y.com/v1',
      api_key: 'sk-123',
      model: 'custom-model',
    });
  });

  it('保存失败显示错误状态', async () => {
    const saveApiConfig = vi.fn().mockRejectedValue(new Error('DB locked'));
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue({ base_url: '', api_key: '', model: '' }),
      saveApiConfig,
    });
    enterCategory(c, 'api');
    await flush();
    c.querySelector('#btn-save-config').click();
    await flush();
    const status = c.querySelector('#cfg-status');
    expect(status.className).toContain('status-error');
    expect(status.textContent).toContain('保存失败');
  });
});

describe('设置页 - 二级：API 拉取模型', () => {
  it('未填 base_url 或 api_key 时提示错误且不调用 fetchModels', async () => {
    const fetchModels = vi.fn();
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue({ base_url: '', api_key: '', model: '' }),
      fetchModels,
    });
    enterCategory(c, 'api');
    await flush();
    c.querySelector('#btn-fetch-models').click();
    await flush();
    expect(fetchModels).not.toHaveBeenCalled();
    expect(c.querySelector('#cfg-status').className).toContain('status-error');
  });

  it('拉取 6 个模型：select 中注入全部 6 个 + 1 占位共 7 个选项', async () => {
    const six = [
      { id: 'model-a' },
      { id: 'model-b' },
      { id: 'model-c' },
      { id: 'model-d' },
      { id: 'model-e' },
      { id: 'model-f' },
    ];
    const fetchModels = vi.fn().mockResolvedValue(six);
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue({ base_url: '', api_key: '', model: '' }),
      fetchModels,
    });
    enterCategory(c, 'api');
    await flush();
    c.querySelector('#cfg-base-url').value = 'https://api.x.com/v1';
    c.querySelector('#cfg-api-key').value = 'sk-1';
    c.querySelector('#btn-fetch-models').click();
    await flush();
    // fetchModels 调用参数只包含 url 和 key（model 不传）
    expect(fetchModels).toHaveBeenCalledWith({
      base_url: 'https://api.x.com/v1',
      api_key: 'sk-1',
    });
    const options = c.querySelectorAll('#cfg-model-select option');
    expect(options).toHaveLength(7); // 1 占位 + 6 模型
    // 全部模型都在下拉里，顺序与返回一致
    expect(options[1].value).toBe('model-a');
    expect(options[6].value).toBe('model-f');
    // 手动输入为空 → 自动选第一个
    expect(c.querySelector('#cfg-model-select').value).toBe('model-a');
    expect(c.querySelector('#cfg-model-manual').value).toBe('');
    expect(c.querySelector('#cfg-status').className).toContain('status-success');
    expect(c.querySelector('#cfg-status').textContent).toContain('已拉取 6 个模型');
  });

  it('拉取成功但手动框里已有值：不修改手动输入、不自动选中下拉第一项', async () => {
    const fetchModels = vi.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue({ base_url: '', api_key: '', model: 'keep-me' }),
      fetchModels,
    });
    enterCategory(c, 'api');
    await flush();
    // keep-me 被加载进手动输入框
    expect(c.querySelector('#cfg-model-manual').value).toBe('keep-me');
    c.querySelector('#cfg-base-url').value = 'https://api.x.com/v1';
    c.querySelector('#cfg-api-key').value = 'sk-1';
    c.querySelector('#btn-fetch-models').click();
    await flush();
    // 手动框里还是 keep-me
    expect(c.querySelector('#cfg-model-manual').value).toBe('keep-me');
    // 下拉不自动选（保持占位）
    expect(c.querySelector('#cfg-model-select').value).toBe('');
    // 但下拉里有全部 3 个 option（占位+a+b）
    expect(c.querySelectorAll('#cfg-model-select option')).toHaveLength(3);
  });

  it('拉取中按钮禁用并显示"拉取中…"', async () => {
    let resolveFn;
    const fetchModels = vi.fn().mockReturnValue(
      new Promise((res) => {
        resolveFn = res;
      })
    );
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue({ base_url: '', api_key: '', model: '' }),
      fetchModels,
    });
    enterCategory(c, 'api');
    await flush();
    c.querySelector('#cfg-base-url').value = 'https://api.x.com/v1';
    c.querySelector('#cfg-api-key').value = 'sk-1';
    const p = Promise.resolve();
    c.querySelector('#btn-fetch-models').click();
    await flush();
    const btn = c.querySelector('#btn-fetch-models');
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain('拉取中');
    resolveFn([]);
    await flush();
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('拉取模型');
    await p;
  });

  it('拉取返回空列表显示 warning', async () => {
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue({ base_url: '', api_key: '', model: '' }),
      fetchModels: vi.fn().mockResolvedValue([]),
    });
    enterCategory(c, 'api');
    await flush();
    c.querySelector('#cfg-base-url').value = 'https://api.x.com/v1';
    c.querySelector('#cfg-api-key').value = 'sk-1';
    c.querySelector('#btn-fetch-models').click();
    await flush();
    expect(c.querySelector('#cfg-status').className).toContain('status-warning');
    expect(c.querySelector('#cfg-status').textContent).toContain('列表为空');
  });

  it('拉取 AUTH 错误显示鉴权失败提示', async () => {
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue({ base_url: '', api_key: '', model: '' }),
      fetchModels: vi.fn().mockRejectedValue(
        new AiClientError(AiErrorType.AUTH, 'invalid api key', { status: 401 })
      ),
    });
    enterCategory(c, 'api');
    await flush();
    c.querySelector('#cfg-base-url').value = 'https://api.x.com/v1';
    c.querySelector('#cfg-api-key').value = 'sk-bad';
    c.querySelector('#btn-fetch-models').click();
    await flush();
    const status = c.querySelector('#cfg-status');
    expect(status.className).toContain('status-error');
    expect(status.textContent).toContain('鉴权失败');
  });

  it('拉取 NETWORK 错误显示 CORS/网络提示', async () => {
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue({ base_url: '', api_key: '', model: '' }),
      fetchModels: vi.fn().mockRejectedValue(
        new AiClientError(AiErrorType.NETWORK, 'Failed to fetch')
      ),
    });
    enterCategory(c, 'api');
    await flush();
    c.querySelector('#cfg-base-url').value = 'https://api.x.com/v1';
    c.querySelector('#cfg-api-key').value = 'sk-1';
    c.querySelector('#btn-fetch-models').click();
    await flush();
    const status = c.querySelector('#cfg-status');
    expect(status.textContent).toContain('网络连接失败');
    expect(status.textContent).toMatch(/CORS|跨域/);
  });

  it('拉取失败后按钮恢复可用', async () => {
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue({ base_url: '', api_key: '', model: '' }),
      fetchModels: vi.fn().mockRejectedValue(new Error('boom')),
    });
    enterCategory(c, 'api');
    await flush();
    c.querySelector('#cfg-base-url').value = 'https://api.x.com/v1';
    c.querySelector('#cfg-api-key').value = 'sk-1';
    const btn = c.querySelector('#btn-fetch-models');
    btn.click();
    await flush();
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('拉取模型');
  });

  it('已存 model 在拉取列表中 → 自动在 select 中选中，手动框为空', async () => {
    const fetchModels = vi.fn().mockResolvedValue([
      { id: 'alpha' },
      { id: 'beta' },
      { id: 'gamma' },
    ]);
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue({
        base_url: 'https://api.x.com/v1',
        api_key: 'sk-1',
        model: 'beta', // 在返回列表里
      }),
      fetchModels,
    });
    enterCategory(c, 'api');
    await flush();
    c.querySelector('#btn-fetch-models').click();
    await flush();
    expect(c.querySelector('#cfg-model-select').value).toBe('beta');
    expect(c.querySelector('#cfg-model-manual').value).toBe('');
  });

  it('已存 model 不在拉取列表中 → 手动框保留，select 不自动选', async () => {
    const fetchModels = vi.fn().mockResolvedValue([{ id: 'alpha' }, { id: 'gamma' }]);
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue({
        base_url: 'https://api.x.com/v1',
        api_key: 'sk-1',
        model: 'custom-model-not-in-list',
      }),
      fetchModels,
    });
    enterCategory(c, 'api');
    await flush();
    c.querySelector('#btn-fetch-models').click();
    await flush();
    expect(c.querySelector('#cfg-model-manual').value).toBe('custom-model-not-in-list');
    expect(c.querySelector('#cfg-model-select').value).toBe('');
  });
});

// ============ 二级：偏好设置 ============
describe('设置页 - 二级：偏好设置', () => {
  it('首次进入偏好设置：列表为空，显示空状态文案', async () => {
    const getAllPreferences = vi.fn().mockResolvedValue([]);
    const c = mount({ getAllPreferences });
    enterCategory(c, 'preferences');
    await flush();
    expect(getAllPreferences).toHaveBeenCalledTimes(1);
    expect(c.querySelector('#pref-list .pref-empty')).toBeTruthy();
    expect(c.querySelector('#pref-list').textContent).toContain('暂无偏好');
  });

  it('加载偏好列表失败：显示错误提示（不会崩溃）', async () => {
    const getAllPreferences = vi.fn().mockRejectedValue(new Error('DB 打不开'));
    const c = mount({ getAllPreferences });
    enterCategory(c, 'preferences');
    await flush();
    expect(c.querySelector('#pref-list').textContent).toContain('加载偏好失败');
    expect(c.querySelector('#pref-list').textContent).toContain('DB 打不开');
  });

  it('已有 3 个偏好 → 渲染 3 个气泡，文字和删除按钮齐全', async () => {
    const getAllPreferences = vi.fn().mockResolvedValue([
      { id: 'p1', value: '不吃辣', created_at: 1 },
      { id: 'p2', value: '不要油炸', created_at: 2 },
      { id: 'p3', value: '爱吃甜', created_at: 3 },
    ]);
    const c = mount({ getAllPreferences });
    enterCategory(c, 'preferences');
    await flush();
    const bubbles = c.querySelectorAll('#pref-list .pref-bubble');
    expect(bubbles.length).toBe(3);
    const texts = Array.from(bubbles).map((b) => b.querySelector('.pref-bubble-text').textContent);
    expect(texts).toEqual(['不吃辣', '不要油炸', '爱吃甜']);
    // 每个气泡都有删除按钮
    bubbles.forEach((b) => {
      expect(b.querySelector('.pref-bubble-remove')).toBeTruthy();
    });
  });

  it('点「添加偏好」按钮：空内容不调用 addPreference，提示警告', async () => {
    const addPreference = vi.fn().mockResolvedValue({ id: 'x', value: 'x' });
    const getAllPreferences = vi.fn().mockResolvedValue([]);
    const c = mount({ addPreference, getAllPreferences });
    enterCategory(c, 'preferences');
    await flush();
    c.querySelector('#pref-input').value = '   '; // 全空格
    c.querySelector('#pref-add-btn').click();
    await flush();
    expect(addPreference).not.toHaveBeenCalled();
    expect(c.querySelector('#pref-status').className).toContain('status-warning');
    expect(c.querySelector('#pref-status').textContent).toContain('请输入内容');
  });

  it('添加非空偏好 → 调用 addPreference，清空输入框，刷新列表，状态 success', async () => {
    const addPreference = vi.fn().mockResolvedValue({ id: 'p_new', value: '不吃香菜' });
    const getAllPreferences = vi
      .fn()
      .mockResolvedValueOnce([]) // 初次加载：空
      .mockResolvedValueOnce([{ id: 'p_new', value: '不吃香菜', created_at: 1 }]); // 添加后刷新
    const c = mount({ addPreference, getAllPreferences });
    enterCategory(c, 'preferences');
    await flush();
    c.querySelector('#pref-input').value = '  不吃香菜  '; // 前后空格会被 trim
    c.querySelector('#pref-add-btn').click();
    await flush();
    // addPreference 被调用，参数为 trim 后的值
    expect(addPreference).toHaveBeenCalledWith('不吃香菜');
    // 输入框清空
    expect(c.querySelector('#pref-input').value).toBe('');
    // 状态成功
    expect(c.querySelector('#pref-status').className).toContain('status-success');
    // 列表刷新（第二次 getAllPreferences 返回的一条）
    expect(c.querySelectorAll('#pref-list .pref-bubble')).toHaveLength(1);
    expect(c.querySelector('#pref-list .pref-bubble-text').textContent).toBe('不吃香菜');
  });

  it('输入框回车也能添加偏好', async () => {
    const addPreference = vi.fn().mockResolvedValue({ id: 'p_enter', value: '少盐' });
    const getAllPreferences = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'p_enter', value: '少盐', created_at: 1 }]);
    const c = mount({ addPreference, getAllPreferences });
    enterCategory(c, 'preferences');
    await flush();
    const $input = c.querySelector('#pref-input');
    $input.value = '少盐';
    // 模拟回车
    $input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flush();
    expect(addPreference).toHaveBeenCalledWith('少盐');
    expect(c.querySelectorAll('#pref-list .pref-bubble')).toHaveLength(1);
  });

  it('点击气泡的删除按钮 → 调用 removePreference，成功后提示并刷新列表', async () => {
    const removePreference = vi.fn().mockResolvedValue(true);
    const getAllPreferences = vi
      .fn()
      .mockResolvedValueOnce([
        { id: 'p_a', value: 'A', created_at: 1 },
        { id: 'p_b', value: 'B', created_at: 2 },
      ])
      .mockResolvedValueOnce([{ id: 'p_b', value: 'B', created_at: 2 }]); // 删除 A 后只剩 B
    const c = mount({ removePreference, getAllPreferences });
    enterCategory(c, 'preferences');
    await flush();
    // 共 2 个气泡
    expect(c.querySelectorAll('#pref-list .pref-bubble')).toHaveLength(2);
    // 点击第一个气泡的删除按钮（对应 A，id=p_a）
    const firstBubble = c.querySelector('#pref-list .pref-bubble[data-id="p_a"]');
    firstBubble.querySelector('.pref-bubble-remove').click();
    await flush();
    expect(removePreference).toHaveBeenCalledWith('p_a');
    expect(c.querySelector('#pref-status').className).toContain('status-success');
    // 只剩 B
    expect(c.querySelectorAll('#pref-list .pref-bubble')).toHaveLength(1);
    expect(c.querySelector('#pref-list .pref-bubble-text').textContent).toBe('B');
  });

  it('添加失败（例如 DB 抛错）→ 显示 error 状态不清空输入', async () => {
    const addPreference = vi.fn().mockRejectedValue(new Error('写入失败'));
    const getAllPreferences = vi.fn().mockResolvedValue([]);
    const c = mount({ addPreference, getAllPreferences });
    enterCategory(c, 'preferences');
    await flush();
    c.querySelector('#pref-input').value = '我的偏好';
    c.querySelector('#pref-add-btn').click();
    await flush();
    expect(c.querySelector('#pref-status').className).toContain('status-error');
    expect(c.querySelector('#pref-status').textContent).toContain('写入失败');
    // 输入框保留用户输入，便于重试
    expect(c.querySelector('#pref-input').value).toBe('我的偏好');
  });
});

// ============ 二级：数据管理 ============
describe('设置页 - 二级：数据管理', () => {
  it('进入数据管理页后调用 getDataCounts，并把数字渲染到统计框', async () => {
    const getDataCounts = vi.fn().mockResolvedValue({
      recipes: 12,
      preferences: 3,
      recommendations: 7,
      hasApiConfig: true,
    });
    const c = mount({ getDataCounts });
    enterCategory(c, 'data-mgmt');
    await flush();
    expect(getDataCounts).toHaveBeenCalledTimes(1);
    const box = c.querySelector('#data-mgmt-counts').textContent;
    expect(box).toContain('12'); // 菜谱数
    expect(box).toContain('3');  // 偏好数
    expect(box).toContain('7');  // 推荐缓存天数
    expect(box).toContain('已配置'); // API
  });

  it('getDataCounts 失败 → 显示错误文案不崩溃', async () => {
    const getDataCounts = vi.fn().mockRejectedValue(new Error('计数失败'));
    const c = mount({ getDataCounts });
    enterCategory(c, 'data-mgmt');
    await flush();
    expect(c.querySelector('#data-mgmt-counts').textContent).toContain('统计失败');
  });

  it('两个清除按钮文字正确，级别区分（btn-warn vs btn-danger）', async () => {
    const c = mount({ getDataCounts: vi.fn().mockResolvedValue({ recipes: 0, preferences: 0, recommendations: 0, hasApiConfig: false }) });
    enterCategory(c, 'data-mgmt');
    await flush();
    const btnExcept = c.querySelector('#btn-clear-except-recipes');
    const btnRecipes = c.querySelector('#btn-clear-recipes');
    expect(btnExcept.textContent).toContain('清除除菜谱外');
    expect(btnRecipes.textContent).toContain('清除所有菜谱');
    expect(btnExcept.classList.contains('btn-warn')).toBe(true);
    expect(btnRecipes.classList.contains('btn-danger')).toBe(true);
  });

  it('点「清除除菜谱外的数据」→ 弹二次确认；确认后调用 clearDataExceptRecipes，并刷新计数', async () => {
    const clearDataExceptRecipes = vi.fn().mockResolvedValue();
    const getDataCounts = vi
      .fn()
      // ① 进入页面：refreshCounts 首次
      .mockResolvedValueOnce({ recipes: 5, preferences: 2, recommendations: 3, hasApiConfig: true })
      // ② 点清除按钮：click handler 内部 await injected.getDataCounts() 拼弹框文案
      .mockResolvedValueOnce({ recipes: 5, preferences: 2, recommendations: 3, hasApiConfig: true })
      // ③ 确认后 onOK 内 refreshCounts 刷新
      .mockResolvedValueOnce({ recipes: 5, preferences: 0, recommendations: 0, hasApiConfig: false });
    const c = mount({ clearDataExceptRecipes, getDataCounts });
    enterCategory(c, 'data-mgmt');
    await flush();

    // 点击清除按钮
    c.querySelector('#btn-clear-except-recipes').click();
    await flush();
    // 弹框出现
    const modal = c.querySelector('#confirm-modal');
    expect(modal.hidden).toBe(false);
    expect(c.querySelector('#confirm-title').textContent).toContain('除菜谱外');
    expect(c.querySelector('#confirm-desc').textContent).toContain('不可恢复');

    // 点确认
    c.querySelector('#confirm-ok').click();
    await flush();
    expect(clearDataExceptRecipes).toHaveBeenCalledTimes(1);
    // 弹框关闭
    expect(modal.hidden).toBe(true);
    // 状态成功
    expect(c.querySelector('#data-mgmt-status').className).toContain('status-success');
    expect(c.querySelector('#data-mgmt-status').textContent).toContain('菜谱已保留');
    // 调用了 3 次 getDataCounts（进入 + 按钮弹框计数 + 确认后刷新）
    expect(getDataCounts).toHaveBeenCalledTimes(3);
  });

  it('点「清除所有菜谱」→ 弹框 danger 级别（确认按钮是 btn-danger）；确认后调用 clearRecipeDataOnly', async () => {
    const clearRecipeDataOnly = vi.fn().mockResolvedValue();
    const getDataCounts = vi
      .fn()
      // ① 进入页面：refreshCounts 首次（10 条菜谱）
      .mockResolvedValueOnce({ recipes: 10, preferences: 1, recommendations: 2, hasApiConfig: true })
      // ② 点按钮：click handler 内部再调一次，用来弹框显示"当前 n 条"
      .mockResolvedValueOnce({ recipes: 10, preferences: 1, recommendations: 2, hasApiConfig: true })
      // ③ 确认后：刷新计数，菜谱变 0
      .mockResolvedValueOnce({ recipes: 0, preferences: 1, recommendations: 2, hasApiConfig: true });
    const c = mount({ clearRecipeDataOnly, getDataCounts });
    enterCategory(c, 'data-mgmt');
    await flush();

    c.querySelector('#btn-clear-recipes').click();
    await flush();
    const modal = c.querySelector('#confirm-modal');
    expect(modal.hidden).toBe(false);
    // 按钮是 btn-danger 级
    const okBtn = c.querySelector('#confirm-ok');
    expect(okBtn.classList.contains('btn-danger')).toBe(true);
    expect(okBtn.textContent).toContain('不可恢复');

    okBtn.click();
    await flush();
    expect(clearRecipeDataOnly).toHaveBeenCalledTimes(1);
    expect(modal.hidden).toBe(true);
    // 弹框文案用的是第 2 次 getDataCounts 的值（recipes=10）
    expect(c.querySelector('#data-mgmt-status').textContent).toContain('已清除全部 10 条菜谱');
  });

  it('二次确认弹框：点取消 / 点遮罩 → 关闭弹框，不调用清除函数', async () => {
    const clearRecipeDataOnly = vi.fn().mockResolvedValue();
    const clearDataExceptRecipes = vi.fn().mockResolvedValue();
    const getDataCounts = vi.fn().mockResolvedValue({ recipes: 1, preferences: 1, recommendations: 1, hasApiConfig: false });
    const c = mount({ clearRecipeDataOnly, clearDataExceptRecipes, getDataCounts });
    enterCategory(c, 'data-mgmt');
    await flush();

    // ① 点清除菜谱 → 点取消
    c.querySelector('#btn-clear-recipes').click();
    await flush();
    expect(c.querySelector('#confirm-modal').hidden).toBe(false);
    c.querySelector('#confirm-cancel').click();
    await flush();
    expect(c.querySelector('#confirm-modal').hidden).toBe(true);
    expect(clearRecipeDataOnly).not.toHaveBeenCalled();

    // ② 点清除除菜谱外 → 点弹框遮罩（overlay 区域）
    c.querySelector('#btn-clear-except-recipes').click();
    await flush();
    expect(c.querySelector('#confirm-modal').hidden).toBe(false);
    c.querySelector('#confirm-modal').click(); // 点遮罩（target === overlay）
    await flush();
    expect(c.querySelector('#confirm-modal').hidden).toBe(true);
    expect(clearDataExceptRecipes).not.toHaveBeenCalled();
  });
});

// ============ 新增：设置页 - 二级：主题设置 ============
describe('设置页 - 二级：主题设置', () => {
  it('点主题卡片 → 进入二级页，出现返回按钮、2 张主题预览卡', async () => {
    const getTheme = vi.fn().mockResolvedValue('dark');
    const c = mount({ getTheme, THEME_DARK: 'dark', THEME_LIGHT: 'light' });
    enterCategory(c, 'theme');
    await flush();
    expect(c.querySelector('.btn-back')).toBeTruthy();
    expect(c.querySelectorAll('.theme-card')).toHaveLength(2);
    expect(c.querySelector('.theme-selector')).toBeTruthy();
    expect(c.querySelector('#theme-status')).toBeTruthy();
  });

  it('当前主题为 dark → 黑夜卡片标记 active/当前使用，白天隐藏徽章', async () => {
    const getTheme = vi.fn().mockResolvedValue('dark');
    const c = mount({ getTheme, THEME_DARK: 'dark', THEME_LIGHT: 'light' });
    enterCategory(c, 'theme');
    await flush(20);
    const darkBadge = c.querySelector('.theme-card[data-theme="dark"] .theme-card-badge');
    const lightBadge = c.querySelector('.theme-card[data-theme="light"] .theme-card-badge');
    expect(darkBadge.style.visibility).toBe('visible');
    expect(lightBadge.style.visibility).toBe('hidden');
    expect(c.querySelector('.theme-card[data-theme="dark"]').classList.contains('active')).toBe(true);
    expect(c.querySelector('.theme-card[data-theme="light"]').classList.contains('active')).toBe(false);
  });

  it('点白天卡片 → 调用 applyTheme("light")，标记 active 并显示成功状态', async () => {
    const applyTheme = vi.fn().mockResolvedValue('light');
    const getTheme = vi.fn().mockResolvedValue('dark');
    const c = mount({ getTheme, applyTheme, THEME_DARK: 'dark', THEME_LIGHT: 'light' });
    enterCategory(c, 'theme');
    await flush(20);
    c.querySelector('.theme-card[data-theme="light"]').click();
    await flush(20);
    expect(applyTheme).toHaveBeenCalledWith('light');
    const lightBadge = c.querySelector('.theme-card[data-theme="light"] .theme-card-badge');
    expect(lightBadge.style.visibility).toBe('visible');
    expect(c.querySelector('.theme-card[data-theme="light"]').classList.contains('active')).toBe(true);
    expect(c.querySelector('#theme-status').textContent).toContain('白天');
    expect(c.querySelector('#theme-status').className).toContain('status-success');
  });

  it('降级路径：无 applyTheme 时回退到 saveTheme + 直接写 documentElement', async () => {
    const saveTheme = vi.fn().mockResolvedValue('dark');
    const getTheme = vi.fn().mockResolvedValue('light');
    const c = mount({ saveTheme, getTheme, THEME_DARK: 'dark', THEME_LIGHT: 'light' });
    enterCategory(c, 'theme');
    await flush(20);
    c.querySelector('.theme-card[data-theme="dark"]').click();
    await flush(20);
    expect(saveTheme).toHaveBeenCalledWith('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(c.querySelector('#theme-status').className).toContain('status-success');
  });

  it('applyTheme 抛错 → 显示错误状态，不切换 active', async () => {
    const applyTheme = vi.fn().mockRejectedValue(new Error('写库炸了'));
    const getTheme = vi.fn().mockResolvedValue('dark');
    const c = mount({ getTheme, applyTheme, THEME_DARK: 'dark', THEME_LIGHT: 'light' });
    enterCategory(c, 'theme');
    await flush(20);
    c.querySelector('.theme-card[data-theme="light"]').click();
    await flush(20);
    expect(c.querySelector('#theme-status').className).toContain('status-error');
    expect(c.querySelector('#theme-status').textContent).toContain('写库炸了');
    // 仍然是 dark 为 active
    expect(c.querySelector('.theme-card[data-theme="dark"]').classList.contains('active')).toBe(true);
  });
});
