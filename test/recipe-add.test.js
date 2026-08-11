import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderRecipeAddView } from '../src/views/recipe-add.js';
import { AiClientError, AiErrorType } from '../src/ai-client.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

function flush(ms = 0) {
  return new Promise((res) => setTimeout(res, ms));
}

function mount(services = {}) {
  const c = document.createElement('div');
  document.body.appendChild(c);
  renderRecipeAddView(c, services);
  return c;
}

const FULL_CONFIG = {
  base_url: 'https://api.x.com/v1',
  api_key: 'sk-1',
  model: 'gpt-4o',
};

const VALID_RECIPE = {
  name: '番茄炒蛋',
  intro: '家常',
  ingredients: [{ name: '番茄', amount: '2个' }],
  steps: ['切块', '炒'],
  tips: '快炒',
};

const validParse = (text) => ({ valid: true, errors: [], recipe: VALID_RECIPE, raw: text });

describe('新增菜谱页 - 输入态', () => {
  it('渲染图片上传、文字框、解析按钮', () => {
    const c = mount({ getApiConfig: vi.fn() });
    expect(c.querySelector('#add-image')).toBeTruthy();
    expect(c.querySelector('#add-text')).toBeTruthy();
    expect(c.querySelector('#btn-parse')).toBeTruthy();
  });

  it('无图片无文字点击解析提示错误', async () => {
    const streamChat = vi.fn();
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue(FULL_CONFIG),
      streamChat,
    });
    c.querySelector('#btn-parse').click();
    await flush();
    expect(streamChat).not.toHaveBeenCalled();
    expect(c.querySelector('#add-status').className).toContain('status-error');
  });

  it('API 配置不完整提示去设置页', async () => {
    const streamChat = vi.fn();
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue({ base_url: '', api_key: '', model: '' }),
      streamChat,
    });
    c.querySelector('#add-text').value = '某菜谱文字';
    c.querySelector('#btn-parse').click();
    await flush();
    expect(streamChat).not.toHaveBeenCalled();
    const status = c.querySelector('#add-status');
    expect(status.className).toContain('status-error');
    expect(status.textContent).toContain('设置');
  });
});

describe('新增菜谱页 - 流式解析成功（文字）', () => {
  it('点击解析后进入流式界面并显示思维链、token计数、进度', async () => {
    let resolveStream;
    const streamChat = vi.fn((cfg, messages, opts) => {
      opts.onProgress?.({ totalTokens: 1, contentTokens: 0, reasoningTokens: 1, phase: 'reasoning' });
      opts.onReasoning?.('我先想想', '我先想想');
      opts.onProgress?.({ totalTokens: 2, contentTokens: 1, reasoningTokens: 1, phase: 'output' });
      opts.onDelta?.('{"name":"番茄', '{"name":"番茄');
      opts.onProgress?.({ totalTokens: 3, contentTokens: 2, reasoningTokens: 1, phase: 'output' });
      opts.onDelta?.('炒蛋"}', '{"name":"番茄炒蛋"}');
      return new Promise((res) => {
        resolveStream = () => res({ content: '{"name":"番茄炒蛋"}', reasoning: '我先想想' });
      });
    });
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue(FULL_CONFIG),
      streamChat,
      parseRecipeResponse: validParse,
      createRecipe: vi.fn().mockResolvedValue({ id: 1 }),
    });
    c.querySelector('#add-text').value = '番茄炒蛋做法…';
    c.querySelector('#btn-parse').click();
    await flush();

    expect(c.querySelector('#stream-reasoning')).toBeTruthy();
    expect(c.querySelector('#stream-reasoning').textContent).toContain('我先想想');
    expect(c.querySelector('#stream-content').textContent).toContain('番茄炒蛋');
    // 新 UI 元素检查
    expect(c.querySelector('#token-count').textContent).toBe('3');
    expect(c.querySelector('#reasoning-mode').textContent).toContain('原生思考');
    expect(c.querySelector('#progress-label').textContent).toBe('AI 正在输出菜谱…');
    // 不 resolve，停留在流式态
    resolveStream && resolveStream();
  });

  it('无原生思考 token 时：思维链面板用 content 回显 + 进度条显示流式回显', async () => {
    let resolveStream;
    const streamChat = vi.fn((cfg, messages, opts) => {
      opts.onProgress?.({ totalTokens: 1, contentTokens: 1, reasoningTokens: 0, phase: 'output' });
      opts.onDelta?.('正在解析', '正在解析');
      opts.onProgress?.({ totalTokens: 2, contentTokens: 2, reasoningTokens: 0, phase: 'output' });
      opts.onDelta?.('菜谱内容', '正在解析菜谱内容');
      return new Promise((res) => {
        resolveStream = () => res({ content: '{"name":"番茄炒蛋"}', reasoning: '' });
      });
    });
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue(FULL_CONFIG),
      streamChat,
      parseRecipeResponse: validParse,
      createRecipe: vi.fn().mockResolvedValue({ id: 1 }),
    });
    c.querySelector('#add-text').value = 'x';
    c.querySelector('#btn-parse').click();
    await flush();

    // 无原生思考时，思维链面板回显 content
    expect(c.querySelector('#stream-reasoning').textContent).toContain('正在解析菜谱内容');
    // 进度条显示流式回显
    expect(c.querySelector('#reasoning-mode').textContent).toContain('流式回显');
    expect(c.querySelector('#reasoning-mode').textContent).toContain('2 tokens');
    // token 计数正确
    expect(c.querySelector('#token-count').textContent).toBe('2');
    // 进度 label 正确
    expect(c.querySelector('#progress-label').textContent).toBe('AI 正在输出菜谱…');

    resolveStream && resolveStream();
  });

  it('streamChat 收到完整 config 与 messages', async () => {
    const streamChat = vi.fn(async (_cfg, _m, opts) => {
      opts.onDelta?.('x', 'x');
      return { content: 'x', reasoning: '' };
    });
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue(FULL_CONFIG),
      streamChat,
      parseRecipeResponse: validParse,
      createRecipe: vi.fn().mockResolvedValue({ id: 1 }),
    });
    c.querySelector('#add-text').value = '菜谱';
    c.querySelector('#btn-parse').click();
    await flush();

    expect(streamChat).toHaveBeenCalledTimes(1);
    const [cfg, messages] = streamChat.mock.calls[0];
    expect(cfg).toEqual(FULL_CONFIG);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
    // 文字消息 content 是数组，含 text part
    const textPart = messages[1].content.find((p) => p.type === 'text');
    expect(textPart.text).toBe('菜谱');
  });

  it('解析成功后渲染可编辑预览表单', async () => {
    const streamChat = vi.fn(async (_c, _m, opts) => {
      opts.onDelta?.('{}', '{}');
      return { content: '{}', reasoning: '' };
    });
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue(FULL_CONFIG),
      streamChat,
      parseRecipeResponse: validParse,
      createRecipe: vi.fn().mockResolvedValue({ id: 1 }),
    });
    c.querySelector('#add-text').value = 'x';
    c.querySelector('#btn-parse').click();
    await flush();

    expect(c.querySelector('.recipe-form')).toBeTruthy();
    expect(c.querySelector('.rf-name').value).toBe('番茄炒蛋');
    expect(c.querySelector('#btn-save-recipe')).toBeTruthy();
  });
});

describe('新增菜谱页 - 保存', () => {
  it('点击保存调用 createRecipe 并显示成功', async () => {
    const streamChat = vi.fn(async (_c, _m, opts) => {
      opts.onDelta?.('{}', '{}');
      return { content: '{}', reasoning: '' };
    });
    const createRecipe = vi.fn().mockResolvedValue({ id: 42, ...VALID_RECIPE });
    const onSaved = vi.fn();
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue(FULL_CONFIG),
      streamChat,
      parseRecipeResponse: validParse,
      createRecipe,
      onSaved,
    });
    c.querySelector('#add-text').value = 'x';
    c.querySelector('#btn-parse').click();
    await flush();

    c.querySelector('#btn-save-recipe').click();
    await flush();

    expect(createRecipe).toHaveBeenCalledTimes(1);
    expect(createRecipe.mock.calls[0][0]).toMatchObject({
      name: '番茄炒蛋',
      ingredients: [{ name: '番茄', amount: '2个' }],
    });
    expect(c.querySelector('#add-status').className).toContain('status-success');
    expect(onSaved).toHaveBeenCalled();
  });

  it('保存前清空菜名时提示错误且不调用 createRecipe', async () => {
    const streamChat = vi.fn(async (_c, _m, opts) => {
      opts.onDelta?.('{}', '{}');
      return { content: '{}', reasoning: '' };
    });
    const createRecipe = vi.fn();
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue(FULL_CONFIG),
      streamChat,
      parseRecipeResponse: validParse,
      createRecipe,
    });
    c.querySelector('#add-text').value = 'x';
    c.querySelector('#btn-parse').click();
    await flush();

    c.querySelector('.rf-name').value = '';
    c.querySelector('.rf-name').dispatchEvent(new Event('input'));
    c.querySelector('#btn-save-recipe').click();
    await flush();

    expect(createRecipe).not.toHaveBeenCalled();
    expect(c.querySelector('#add-status').className).toContain('status-error');
  });

  it('保存失败显示错误且按钮恢复', async () => {
    const streamChat = vi.fn(async (_c, _m, opts) => {
      opts.onDelta?.('{}', '{}');
      return { content: '{}', reasoning: '' };
    });
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue(FULL_CONFIG),
      streamChat,
      parseRecipeResponse: validParse,
      createRecipe: vi.fn().mockRejectedValue(new Error('存储满了')),
    });
    c.querySelector('#add-text').value = 'x';
    c.querySelector('#btn-parse').click();
    await flush();

    const btn = c.querySelector('#btn-save-recipe');
    btn.click();
    await flush();

    expect(c.querySelector('#add-status').className).toContain('status-error');
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('保存菜谱');
  });
});

describe('新增菜谱页 - 图片上传', () => {
  it('上传图片后解析时调用 fileToDataUrl 并把 dataUrl 放入消息', async () => {
    const streamChat = vi.fn(async (_c, _m, opts) => {
      opts.onDelta?.('{}', '{}');
      return { content: '{}', reasoning: '' };
    });
    const fileToDataUrl = vi.fn().mockResolvedValue('data:image/png;base64,AAA');
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue(FULL_CONFIG),
      streamChat,
      fileToDataUrl,
      parseRecipeResponse: validParse,
      createRecipe: vi.fn().mockResolvedValue({ id: 1 }),
    });
    const file = new File(['aaa'], 'recipe.png', { type: 'image/png' });
    const fileInput = c.querySelector('#add-image');
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fileInput.dispatchEvent(new Event('change'));
    await flush();

    c.querySelector('#btn-parse').click();
    await flush();

    expect(fileToDataUrl).toHaveBeenCalledWith(file);
    const messages = streamChat.mock.calls[0][1];
    const imgPart = messages[1].content.find((p) => p.type === 'image_url');
    expect(imgPart.image_url.url).toBe('data:image/png;base64,AAA');
  });

  it('多张图片都放入同一条消息', async () => {
    const streamChat = vi.fn(async (_c, _m, opts) => {
      opts.onDelta?.('{}', '{}');
      return { content: '{}', reasoning: '' };
    });
    const fileToDataUrl = vi.fn(async (f) => `data:image/png;base64,${f.name}`);
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue(FULL_CONFIG),
      streamChat,
      fileToDataUrl,
      parseRecipeResponse: validParse,
      createRecipe: vi.fn().mockResolvedValue({ id: 1 }),
    });
    const f1 = new File(['a'], 'A', { type: 'image/png' });
    const f2 = new File(['b'], 'B', { type: 'image/png' });
    const fileInput = c.querySelector('#add-image');
    Object.defineProperty(fileInput, 'files', { value: [f1, f2], configurable: true });
    fileInput.dispatchEvent(new Event('change'));
    await flush();

    c.querySelector('#btn-parse').click();
    await flush();

    const messages = streamChat.mock.calls[0][1];
    const imgParts = messages[1].content.filter((p) => p.type === 'image_url');
    expect(imgParts).toHaveLength(2);
  });
});

describe('新增菜谱页 - 错误处理', () => {
  it('AI 网络错误显示 NETWORK 类提示', async () => {
    const streamChat = vi.fn(async () => {
      throw new AiClientError(AiErrorType.NETWORK, 'Failed to fetch');
    });
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue(FULL_CONFIG),
      streamChat,
      aiErrorMessage: () => '网络连接失败。',
    });
    c.querySelector('#add-text').value = 'x';
    c.querySelector('#btn-parse').click();
    await flush();

    expect(c.querySelector('.section-title').textContent).toContain('解析失败');
    expect(c.querySelector('.status-error').textContent).toContain('网络连接失败');
  });

  it('AI 鉴权错误显示 AUTH 类提示', async () => {
    const streamChat = vi.fn(async () => {
      throw new AiClientError(AiErrorType.AUTH, 'bad key', { status: 401 });
    });
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue(FULL_CONFIG),
      streamChat,
      aiErrorMessage: () => '鉴权失败。',
    });
    c.querySelector('#add-text').value = 'x';
    c.querySelector('#btn-parse').click();
    await flush();

    expect(c.querySelector('.status-error').textContent).toContain('鉴权失败');
  });

  it('AI 返回内容无法解析为菜谱时显示结构错误', async () => {
    const streamChat = vi.fn(async (_c, _m, opts) => {
      opts.onDelta?.('not a recipe', 'not a recipe');
      return { content: 'not a recipe', reasoning: '' };
    });
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue(FULL_CONFIG),
      streamChat,
      parseRecipeResponse: () => ({
        valid: false,
        errors: ['菜名(name)为空', '食材(ingredients)为空'],
        recipe: null,
        raw: 'not a recipe',
      }),
    });
    c.querySelector('#add-text').value = 'x';
    c.querySelector('#btn-parse').click();
    await flush();

    expect(c.querySelector('.section-title').textContent).toContain('解析失败');
    const errText = c.querySelector('.status-error').textContent;
    expect(errText).toContain('菜名');
    expect(errText).toContain('食材');
  });

  it('错误页有返回按钮回到输入态', async () => {
    const streamChat = vi.fn(async () => {
      throw new AiClientError(AiErrorType.NETWORK, 'x');
    });
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue(FULL_CONFIG),
      streamChat,
      aiErrorMessage: () => '网络失败',
    });
    c.querySelector('#add-text').value = 'x';
    c.querySelector('#btn-parse').click();
    await flush();

    c.querySelector('#btn-retry').click();
    await flush();

    // 回到输入态
    expect(c.querySelector('#btn-parse')).toBeTruthy();
    expect(c.querySelector('#stream-reasoning')).toBeFalsy();
  });
});

describe('新增菜谱页 - 真实写入（防回归：services.createRecipe 未注入时仍调用 db.js 真实现）', () => {
  // 此测试不注入 services.createRecipe，走默认 fallback 路径
  // 直接验证是否在 fake-indexeddb 中真的写入了一条记录
  it('默认 createRecipe 走 db.js 真实现：保存后 getAllRecipes 能读到新菜谱', async () => {
    const streamChat = vi.fn(async (_c, _m, opts) => {
      opts.onDelta?.('{}', '{}');
      return { content: '{}', reasoning: '' };
    });
    const validRecipe = {
      name: '真写入测试菜',
      intro: '测试简介',
      ingredients: [{ name: '盐', amount: '1g' }],
      steps: ['一步到位'],
      tips: '',
    };
    const parseRecipeResponse = vi.fn(() => ({
      valid: true,
      errors: [],
      recipe: validRecipe,
      raw: '{}',
    }));
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue(FULL_CONFIG),
      streamChat,
      parseRecipeResponse,
      // **不注入 createRecipe**，走默认 fallback（必须调用 db.js 真实现）
    });
    c.querySelector('#add-text').value = 'x';
    c.querySelector('#btn-parse').click();
    await flush();
    c.querySelector('#btn-save-recipe').click();
    await flush();
    // 直接调 db.js 的 getAllRecipes 看是否真的写进去了
    const { getAllRecipes, clearAllRecipes } = await import('../src/db.js');
    const all = await getAllRecipes();
    expect(all.length).toBeGreaterThanOrEqual(1);
    const match = all.find((r) => r.name === '真写入测试菜');
    expect(match).toBeTruthy();
    expect(match.ingredients[0].name).toBe('盐');
    await clearAllRecipes(); // 测试完清干净，避免影响其他测试
  });
});

describe('新增菜谱页 - 取消', () => {
  it('点击取消触发 abort 且界面回到可返回状态', async () => {
    let resolveStream;
    const streamChat = vi.fn((_cfg, _messages, opts) => {
      return new Promise((res, rej) => {
        resolveStream = { res, rej, opts };
      });
    });
    const c = mount({
      getApiConfig: vi.fn().mockResolvedValue(FULL_CONFIG),
      streamChat,
      parseRecipeResponse: validParse,
    });
    c.querySelector('#add-text').value = 'x';
    c.querySelector('#btn-parse').click();
    await flush();

    expect(c.querySelector('#btn-cancel')).toBeTruthy();
    c.querySelector('#btn-cancel').click();
    // abort 触发后 streamChat promise 应 reject AbortError → 转 ABORTED
    // 由于我们 mock 不会自动 reject，模拟 abort 行为：
    const err = new Error('aborted');
    err.name = 'AbortError';
    err.type = AiErrorType.ABORTED;
    resolveStream.rej(err);
    await flush();

    expect(c.querySelector('#stream-progress').textContent).toContain('已取消');
    expect(c.querySelector('#progress-label').textContent).toContain('已取消');
  });
});
