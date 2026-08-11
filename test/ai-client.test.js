import { describe, it, expect, vi } from 'vitest';
import {
  AiClientError,
  AiErrorType,
  fetchModels,
  streamChat,
} from '../src/ai-client.js';

// ============ 测试辅助：构造 SSE 流响应 ============

/** 把字符串切成 ReadableStream（按给定块大小） */
function makeSseStream(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
      controller.close();
    },
  });
}

/** 构造一个 SSE 事件 */
function sseEvent(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

/** 构造 fake Response */
function fakeResponse({ status = 200, body, headers = {} }) {
  const isStream = body instanceof ReadableStream;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Map(Object.entries(headers)),
    body: isStream ? body : null,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body ?? {})),
  };
}

/** fake fetch 工厂：按 url 返回不同响应 */
function makeFetch(routes) {
  return vi.fn(async (url, init) => {
    const u = String(url);
    for (const route of routes) {
      if (route.match(url, init)) return route.response;
    }
    throw new Error(`mock fetch: 未匹配的 url=${u}`);
  });
}

// ============ 测试 ============

describe('AI客户端 - fetchModels', () => {
  it('正常返回模型 id 列表', async () => {
    const fetchImpl = makeFetch([
      {
        match: (url) => String(url).endsWith('/models'),
        response: fakeResponse({
          status: 200,
          body: {
            data: [
              { id: 'gpt-4o' },
              { id: 'gpt-4o-mini' },
              { id: 'gpt-3.5-turbo' },
            ],
          },
        }),
      },
    ]);
    const models = await fetchModels(
      { base_url: 'https://api.example.com/v1', api_key: 'sk-x' },
      { fetchImpl }
    );
    expect(models.map((m) => m.id)).toEqual([
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-3.5-turbo',
    ]);
  });

  it('base_url 尾部斜杠被规范化', async () => {
    const fetchImpl = makeFetch([
      {
        match: (url) => String(url) === 'https://api.example.com/v1/models',
        response: fakeResponse({ status: 200, body: { data: [{ id: 'm1' }] } }),
      },
    ]);
    await fetchModels(
      { base_url: 'https://api.example.com/v1/', api_key: 'sk-x' },
      { fetchImpl }
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/v1/models',
      expect.any(Object)
    );
  });

  it('请求头携带 Bearer token', async () => {
    const fetchImpl = makeFetch([
      {
        match: () => true,
        response: fakeResponse({ status: 200, body: { data: [{ id: 'm1' }] } }),
      },
    ]);
    await fetchModels(
      { base_url: 'https://api.example.com/v1', api_key: 'sk-secret' },
      { fetchImpl }
    );
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer sk-secret');
  });

  it('缺少 api_key 抛 AUTH 错误', async () => {
    await expect(
      fetchModels({ base_url: 'https://x/v1', api_key: '' }, { fetchImpl: makeFetch([]) })
    ).rejects.toMatchObject({ type: AiErrorType.AUTH });
  });

  it('缺少 base_url 抛 BAD_REQUEST 错误', async () => {
    await expect(
      fetchModels({ base_url: '', api_key: 'k' }, { fetchImpl: makeFetch([]) })
    ).rejects.toMatchObject({ type: AiErrorType.BAD_REQUEST });
  });

  it('401 抛 AUTH 错误并带状态码', async () => {
    const fetchImpl = makeFetch([
      {
        match: () => true,
        response: fakeResponse({
          status: 401,
          body: { error: { message: 'invalid api key' } },
        }),
      },
    ]);
    await expect(
      fetchModels({ base_url: 'https://x/v1', api_key: 'bad' }, { fetchImpl })
    ).rejects.toMatchObject({ type: AiErrorType.AUTH, status: 401 });
  });

  it('404 抛 MODEL_NOT_FOUND', async () => {
    const fetchImpl = makeFetch([
      {
        match: () => true,
        response: fakeResponse({ status: 404, body: 'not found' }),
      },
    ]);
    await expect(
      fetchModels({ base_url: 'https://x/v1', api_key: 'k' }, { fetchImpl })
    ).rejects.toMatchObject({ type: AiErrorType.MODEL_NOT_FOUND });
  });

  it('429 抛 RATE_LIMIT', async () => {
    const fetchImpl = makeFetch([
      {
        match: () => true,
        response: fakeResponse({ status: 429, body: 'rate limited' }),
      },
    ]);
    await expect(
      fetchModels({ base_url: 'https://x/v1', api_key: 'k' }, { fetchImpl })
    ).rejects.toMatchObject({ type: AiErrorType.RATE_LIMIT });
  });

  it('500 抛 SERVER', async () => {
    const fetchImpl = makeFetch([
      {
        match: () => true,
        response: fakeResponse({ status: 500, body: 'boom' }),
      },
    ]);
    await expect(
      fetchModels({ base_url: 'https://x/v1', api_key: 'k' }, { fetchImpl })
    ).rejects.toMatchObject({ type: AiErrorType.SERVER });
  });

  it('网络异常抛 NETWORK', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(
      fetchModels({ base_url: 'https://x/v1', api_key: 'k' }, { fetchImpl })
    ).rejects.toMatchObject({ type: AiErrorType.NETWORK });
  });

  it('响应非 JSON 抛 PARSE', async () => {
    const fetchImpl = makeFetch([
      {
        match: () => true,
        response: fakeResponse({ status: 200, body: 'not json at all' }),
      },
    ]);
    await expect(
      fetchModels({ base_url: 'https://x/v1', api_key: 'k' }, { fetchImpl })
    ).rejects.toMatchObject({ type: AiErrorType.PARSE });
  });

  it('响应缺 data 数组抛 PARSE', async () => {
    const fetchImpl = makeFetch([
      {
        match: () => true,
        response: fakeResponse({ status: 200, body: { object: 'list', not_data: [] } }),
      },
    ]);
    await expect(
      fetchModels({ base_url: 'https://x/v1', api_key: 'k' }, { fetchImpl })
    ).rejects.toMatchObject({ type: AiErrorType.PARSE });
  });
});

describe('AI客户端 - streamChat', () => {
  const config = {
    base_url: 'https://api.example.com/v1',
    api_key: 'sk-x',
    model: 'gpt-4o',
  };

  it('逐 token 回调 onDelta 并返回完整文本', async () => {
    const sse = [
      sseEvent({ choices: [{ delta: { content: 'Hello' } }] }),
      sseEvent({ choices: [{ delta: { content: ' World' } }] }),
      'data: [DONE]\n\n',
    ].join('');
    const fetchImpl = makeFetch([
      {
        match: (url) => String(url).endsWith('/chat/completions'),
        response: fakeResponse({ status: 200, body: makeSseStream([sse]) }),
      },
    ]);
    const deltas = [];
    const result = await streamChat(config, [{ role: 'user', content: 'hi' }], {
      fetchImpl,
      onDelta: (piece) => deltas.push(piece),
    });
    expect(deltas).toEqual(['Hello', ' World']);
    expect(result.content).toBe('Hello World');
  });

  it('思维链通过 onReasoning 回调（reasoning_content 字段）', async () => {
    const sse = [
      sseEvent({ choices: [{ delta: { reasoning_content: '思考' } }] }),
      sseEvent({ choices: [{ delta: { reasoning_content: '中' } }] }),
      sseEvent({ choices: [{ delta: { content: '答案' } }] }),
      'data: [DONE]\n\n',
    ].join('');
    const fetchImpl = makeFetch([
      {
        match: () => true,
        response: fakeResponse({ status: 200, body: makeSseStream([sse]) }),
      },
    ]);
    const reasoning = [];
    const result = await streamChat(config, [], {
      fetchImpl,
      onReasoning: (piece) => reasoning.push(piece),
    });
    expect(reasoning).toEqual(['思考', '中']);
    expect(result.reasoning).toBe('思考中');
    expect(result.content).toBe('答案');
  });

  it('onProgress 回调提供 token 计数和 phase', async () => {
    const sse = [
      sseEvent({ choices: [{ delta: { reasoning_content: '思考中' } }] }),
      sseEvent({ choices: [{ delta: { content: 'Hello' } }] }),
      sseEvent({ choices: [{ delta: { content: ' World' } }] }),
      'data: [DONE]\n\n',
    ].join('');
    const fetchImpl = makeFetch([
      { match: () => true, response: fakeResponse({ status: 200, body: makeSseStream([sse]) }) },
    ]);
    const progresses = [];
    const result = await streamChat(config, [], {
      fetchImpl,
      onProgress: (info) => progresses.push(info),
    });
    // 最后一条是 done
    const last = progresses[progresses.length - 1];
    expect(last.phase).toBe('done');
    expect(last.totalTokens).toBe(3);
    expect(last.reasoningTokens).toBe(1);
    expect(last.contentTokens).toBe(2);
    // 过程中应该经过 reasoning 和 output 阶段
    const phases = progresses.map((p) => p.phase);
    expect(phases).toContain('reasoning');
    expect(phases).toContain('output');
    expect(result.content).toBe('Hello World');
  });

  it('无原生思考 token 时 onProgress 仍能追踪 content token', async () => {
    const sse = [
      sseEvent({ choices: [{ delta: { content: '番茄' } }] }),
      sseEvent({ choices: [{ delta: { content: '炒蛋' } }] }),
      'data: [DONE]\n\n',
    ].join('');
    const fetchImpl = makeFetch([
      { match: () => true, response: fakeResponse({ status: 200, body: makeSseStream([sse]) }) },
    ]);
    const progresses = [];
    const reasoningPieces = [];
    await streamChat(config, [], {
      fetchImpl,
      onProgress: (info) => progresses.push(info),
      onReasoning: (p) => reasoningPieces.push(p),
    });
    // 没有原生思考 token
    expect(reasoningPieces).toHaveLength(0);
    // 但 onProgress 仍在工作
    expect(progresses.length).toBeGreaterThanOrEqual(2);
    const last = progresses[progresses.length - 1];
    expect(last.contentTokens).toBe(2);
    expect(last.reasoningTokens).toBe(0);
    expect(last.phase).toBe('done');
  });

  it('兼容 reasoning / thinking 字段名', async () => {
    const sse = [
      sseEvent({ choices: [{ delta: { reasoning: 'A' } }] }),
      sseEvent({ choices: [{ delta: { thinking: 'B' } }] }),
      'data: [DONE]\n\n',
    ].join('');
    const fetchImpl = makeFetch([
      { match: () => true, response: fakeResponse({ status: 200, body: makeSseStream([sse]) }) },
    ]);
    const reasoning = [];
    const result = await streamChat(config, [], {
      fetchImpl,
      onReasoning: (p) => reasoning.push(p),
    });
    expect(reasoning).toEqual(['A', 'B']);
    expect(result.reasoning).toBe('AB');
  });

  it('分块边界正确处理（一个 JSON 被拆到两个 chunk）', async () => {
    const evt1 = sseEvent({ choices: [{ delta: { content: 'AB' } }] });
    const evt2 = sseEvent({ choices: [{ delta: { content: 'CD' } }] });
    const full = evt1 + evt2 + 'data: [DONE]\n\n';
    // 把完整字符串切成任意位置
    const mid = Math.floor(full.length / 2);
    const fetchImpl = makeFetch([
      {
        match: () => true,
        response: fakeResponse({
          status: 200,
          body: makeSseStream([full.slice(0, mid), full.slice(mid)]),
        }),
      },
    ]);
    const result = await streamChat(config, [], { fetchImpl });
    expect(result.content).toBe('ABCD');
  });

  it('忽略注释行和空行', async () => {
    const sse = [
      ': heartbeat\n',
      '\n',
      sseEvent({ choices: [{ delta: { content: 'X' } }] }),
      '\n',
      'data: [DONE]\n\n',
    ].join('');
    const fetchImpl = makeFetch([
      { match: () => true, response: fakeResponse({ status: 200, body: makeSseStream([sse]) }) },
    ]);
    const result = await streamChat(config, [], { fetchImpl });
    expect(result.content).toBe('X');
  });

  it('请求体含 stream:true 和 model', async () => {
    const fetchImpl = makeFetch([
      {
        match: () => true,
        response: fakeResponse({
          status: 200,
          body: makeSseStream(['data: [DONE]\n\n']),
        }),
      },
    ]);
    await streamChat(config, [{ role: 'user', content: 'hi' }], { fetchImpl });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.stream).toBe(true);
    expect(body.model).toBe('gpt-4o');
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('缺少 model 抛 BAD_REQUEST', async () => {
    await expect(
      streamChat(
        { base_url: 'https://x/v1', api_key: 'k', model: '' },
        [],
        { fetchImpl: makeFetch([]) }
      )
    ).rejects.toMatchObject({ type: AiErrorType.BAD_REQUEST });
  });

  it('HTTP 错误分类正确（403→AUTH）', async () => {
    const fetchImpl = makeFetch([
      {
        match: () => true,
        response: fakeResponse({ status: 403, body: { error: { message: 'forbidden' } } }),
      },
    ]);
    await expect(streamChat(config, [], { fetchImpl })).rejects.toMatchObject({
      type: AiErrorType.AUTH,
      status: 403,
    });
  });

  it('响应无 body 抛 PARSE', async () => {
    const fetchImpl = makeFetch([
      {
        match: () => true,
        response: { ok: true, status: 200, headers: new Map(), body: null, text: async () => '' },
      },
    ]);
    await expect(streamChat(config, [], { fetchImpl })).rejects.toMatchObject({
      type: AiErrorType.PARSE,
    });
  });

  it('AbortError 转为 ABORTED', async () => {
    const fetchImpl = vi.fn(async () => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      throw e;
    });
    await expect(streamChat(config, [], { fetchImpl })).rejects.toMatchObject({
      type: AiErrorType.ABORTED,
    });
  });

  it('AiClientError 实例携带 type/status 字段', async () => {
    const fetchImpl = makeFetch([
      { match: () => true, response: fakeResponse({ status: 401, body: 'bad' }) },
    ]);
    try {
      await fetchModels({ base_url: 'https://x/v1', api_key: 'bad' }, { fetchImpl });
    } catch (e) {
      expect(e).toBeInstanceOf(AiClientError);
      expect(e.type).toBe(AiErrorType.AUTH);
      expect(e.status).toBe(401);
    }
  });
});
