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

function flush() {
  return new Promise((res) => setTimeout(res, 0));
}

describe('设置页 - 渲染', () => {
  it('渲染 url、key 两个输入框 + 模型 select + 手动输入 + 两个按钮', () => {
    const c = mount();
    expect(c.querySelector('#cfg-base-url')).toBeTruthy();
    expect(c.querySelector('#cfg-api-key')).toBeTruthy();
    expect(c.querySelector('#cfg-model-select')).toBeTruthy();
    expect(c.querySelector('#cfg-model-manual')).toBeTruthy();
    expect(c.querySelector('#btn-fetch-models')).toBeTruthy();
    expect(c.querySelector('#btn-save-config')).toBeTruthy();
  });

  it('初始 select 仅占位 option', () => {
    const c = mount();
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
    await flush();
    expect(getApiConfig).toHaveBeenCalled();
    expect(c.querySelector('#cfg-base-url').value).toBe('https://api.x.com/v1');
    expect(c.querySelector('#cfg-api-key').value).toBe('sk-loaded');
    expect(c.querySelector('#cfg-model-manual').value).toBe('gpt-4o');
    expect(c.querySelector('#cfg-model-select').value).toBe('');
  });

  it('无配置时表单为空', async () => {
    const c = mount({ getApiConfig: vi.fn().mockResolvedValue({ base_url: '', api_key: '', model: '' }) });
    await flush();
    expect(c.querySelector('#cfg-base-url').value).toBe('');
    expect(c.querySelector('#cfg-api-key').value).toBe('');
    expect(c.querySelector('#cfg-model-select').value).toBe('');
    expect(c.querySelector('#cfg-model-manual').value).toBe('');
  });
});

describe('设置页 - 保存', () => {
  it('select 有值且手动输入为空：保存 select 中的模型', async () => {
    const saveApiConfig = vi.fn().mockResolvedValue({});
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue({ base_url: '', api_key: '', model: '' }),
      saveApiConfig,
    });
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
    await flush();
    c.querySelector('#btn-save-config').click();
    await flush();
    const status = c.querySelector('#cfg-status');
    expect(status.className).toContain('status-error');
    expect(status.textContent).toContain('保存失败');
  });
});

describe('设置页 - 拉取模型', () => {
  it('未填 base_url 或 api_key 时提示错误且不调用 fetchModels', async () => {
    const fetchModels = vi.fn();
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue({ base_url: '', api_key: '', model: '' }),
      fetchModels,
    });
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
    await flush();
    c.querySelector('#cfg-base-url').value = 'https://api.x.com/v1';
    c.querySelector('#cfg-api-key').value = 'sk-1';
    // 注意：_getApiConfig 返回 Promise，mock 是立即 resolve 但走 await，所以这里点击后
    // 还需要多一次 flush 才能到 button.disabled = true 那一步
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
    await flush();
    c.querySelector('#btn-fetch-models').click();
    await flush();
    expect(c.querySelector('#cfg-model-manual').value).toBe('custom-model-not-in-list');
    expect(c.querySelector('#cfg-model-select').value).toBe('');
  });
});
