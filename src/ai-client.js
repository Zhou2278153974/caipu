// AI 客户端：OpenAI 兼容格式
// 提供：
//   - fetchModels：拉取可用模型列表
//   - streamChat：流式对话，逐 token 回调，支持思维链
//   - fileToDataUrl：文件转 base64（图片上传用）
//
// 错误分类（用户要求实时看到失败类型）：
//   network / auth / model_not_found / rate_limit / server / bad_request / parse / aborted / unknown
//
// 测试通过注入 fetchImpl 替代全局 fetch，避免依赖网络。

export const AiErrorType = {
  NETWORK: 'network', // 连接失败 / CORS / DNS
  AUTH: 'auth', // 401 / 403 鉴权失败
  MODEL_NOT_FOUND: 'model_not_found', // 404
  RATE_LIMIT: 'rate_limit', // 429
  SERVER: 'server', // 5xx
  BAD_REQUEST: 'bad_request', // 400
  PARSE: 'parse', // 响应解析失败
  ABORTED: 'aborted', // 用户中止
  UNKNOWN: 'unknown',
};

export class AiClientError extends Error {
  constructor(type, message, { status, cause } = {}) {
    super(message);
    this.name = 'AiClientError';
    this.type = type;
    this.status = status;
    this.cause = cause;
  }
}

/** 标准化 base_url：去掉尾部斜杠 */
function normalizeBase(base_url) {
  if (!base_url || typeof base_url !== 'string') {
    throw new AiClientError(AiErrorType.BAD_REQUEST, 'base_url 未配置');
  }
  return base_url.replace(/\/+$/, '');
}

/** 根据 HTTP 状态码分类错误 */
function classifyHttpError(status, bodyText) {
  let snippet = '';
  try {
    const j = JSON.parse(bodyText);
    snippet = j.error?.message || j.message || bodyText.slice(0, 200);
  } catch {
    snippet = bodyText.slice(0, 200);
  }
  switch (status) {
    case 401:
    case 403:
      return new AiClientError(AiErrorType.AUTH, `鉴权失败(${status})：${snippet}`, { status });
    case 404:
      return new AiClientError(AiErrorType.MODEL_NOT_FOUND, `资源不存在(404)：${snippet}`, {
        status,
      });
    case 429:
      return new AiClientError(AiErrorType.RATE_LIMIT, `请求过于频繁(429)：${snippet}`, {
        status,
      });
    default:
      if (status >= 500) {
        return new AiClientError(AiErrorType.SERVER, `服务器错误(${status})：${snippet}`, {
          status,
        });
      }
      if (status >= 400) {
        return new AiClientError(AiErrorType.BAD_REQUEST, `请求错误(${status})：${snippet}`, {
          status,
        });
      }
      return new AiClientError(AiErrorType.UNKNOWN, `未知HTTP错误(${status})：${snippet}`, {
        status,
      });
  }
}

/**
 * 拉取模型列表
 * @param {{base_url, api_key}} config
 * @returns Promise<Array<{id:string, raw:object}>>
 */
export async function fetchModels(config, { fetchImpl } = {}) {
  const fetchFn = fetchImpl || globalThis.fetch;
  if (!fetchFn) throw new AiClientError(AiErrorType.BAD_REQUEST, 'fetch 不可用');
  const base = normalizeBase(config.base_url);
  if (!config.api_key) throw new AiClientError(AiErrorType.AUTH, 'api_key 未配置');
  const url = `${base}/models`;
  let resp;
  try {
    resp = await fetchFn(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${config.api_key}` },
    });
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new AiClientError(AiErrorType.ABORTED, '请求已取消', { cause: e });
    }
    throw new AiClientError(AiErrorType.NETWORK, `网络连接失败：${e.message}`, { cause: e });
  }
  const bodyText = await resp.text();
  if (!resp.ok) throw classifyHttpError(resp.status, bodyText);
  let json;
  try {
    json = JSON.parse(bodyText);
  } catch (e) {
    throw new AiClientError(AiErrorType.PARSE, `模型列表响应不是合法JSON：${bodyText.slice(0, 200)}`, {
      cause: e,
    });
  }
  const list = Array.isArray(json) ? json : json.data;
  if (!Array.isArray(list)) {
    throw new AiClientError(AiErrorType.PARSE, '模型列表响应缺少 data 数组');
  }
  return list
    .filter((m) => m && (m.id || m.name))
    .map((m) => ({ id: m.id || m.name, raw: m }));
}

/**
 * 流式对话
 * @param {{base_url, api_key, model}} config
 * @param {Array} messages OpenAI messages 格式
 * @param {{onDelta?, onReasoning?, onProgress?, signal?, fetchImpl?, temperature?}} opts
 *   onDelta(piece, full)      - 每收到一段 content token 触发
 *   onReasoning(piece, full)  - 每收到一段 reasoning token 触发
 *   onProgress(info)          - 每收到一个 SSE chunk 都触发（心跳/进度），info: {totalTokens, contentTokens, reasoningTokens, phase}
 * @returns Promise<{content:string, reasoning:string}>
 */
export async function streamChat(config, messages, opts = {}) {
  const { onDelta, onReasoning, onProgress, signal, fetchImpl, temperature = 0.2 } = opts;
  const fetchFn = fetchImpl || globalThis.fetch;
  if (!fetchFn) throw new AiClientError(AiErrorType.BAD_REQUEST, 'fetch 不可用');
  const base = normalizeBase(config.base_url);
  if (!config.api_key) throw new AiClientError(AiErrorType.AUTH, 'api_key 未配置');
  if (!config.model) throw new AiClientError(AiErrorType.BAD_REQUEST, 'model 未配置');
  const url = `${base}/chat/completions`;

  let resp;
  try {
    resp = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.api_key}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: true,
        temperature,
      }),
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new AiClientError(AiErrorType.ABORTED, '请求已取消', { cause: e });
    }
    throw new AiClientError(AiErrorType.NETWORK, `网络连接失败：${e.message}`, { cause: e });
  }

  if (!resp.ok) {
    const bodyText = await resp.text().catch(() => '');
    throw classifyHttpError(resp.status, bodyText);
  }
  if (!resp.body) {
    throw new AiClientError(AiErrorType.PARSE, '响应没有可读流（可能不支持流式）');
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullContent = '';
  let fullReasoning = '';
  let contentTokenCount = 0;
  let reasoningTokenCount = 0;

  try {
    while (true) {
      let { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          onProgress?.({
            totalTokens: contentTokenCount + reasoningTokenCount,
            contentTokens: contentTokenCount,
            reasoningTokens: reasoningTokenCount,
            phase: 'done',
          });
          continue;
        }
        let chunk;
        try {
          chunk = JSON.parse(data);
        } catch {
          continue;
        }
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta || {};

        const reasoningText =
          delta.reasoning_content ?? delta.reasoning ?? delta.thinking ?? '';
        if (reasoningText) {
          fullReasoning += reasoningText;
          reasoningTokenCount++;
          onReasoning?.(reasoningText, fullReasoning);
        }

        const contentText = delta.content ?? '';
        if (contentText) {
          fullContent += contentText;
          contentTokenCount++;
          onDelta?.(contentText, fullContent);
        }

        onProgress?.({
          totalTokens: contentTokenCount + reasoningTokenCount,
          contentTokens: contentTokenCount,
          reasoningTokens: reasoningTokenCount,
          phase: reasoningTokenCount > 0 && contentTokenCount === 0 ? 'reasoning' : contentTokenCount > 0 ? 'output' : 'connecting',
        });
      }
    }
    // 处理 buffer 中残留的最后一段
    const trimmed = buffer.trim();
    if (trimmed.startsWith('data:') && trimmed.slice(5).trim() !== '[DONE]') {
      try {
        const chunk = JSON.parse(trimmed.slice(5).trim());
        const delta = chunk.choices?.[0]?.delta || {};
        if (delta.content) {
          fullContent += delta.content;
          contentTokenCount++;
          onDelta?.(delta.content, fullContent);
        }
        const r = delta.reasoning_content ?? delta.reasoning ?? delta.thinking;
        if (r) {
          fullReasoning += r;
          reasoningTokenCount++;
          onReasoning?.(r, fullReasoning);
        }
        onProgress?.({
          totalTokens: contentTokenCount + reasoningTokenCount,
          contentTokens: contentTokenCount,
          reasoningTokens: reasoningTokenCount,
          phase: 'done',
        });
      } catch {
        // 忽略
      }
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new AiClientError(AiErrorType.ABORTED, '请求已取消', { cause: e });
    }
    throw new AiClientError(AiErrorType.NETWORK, `流读取中断：${e.message}`, { cause: e });
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // 忽略
    }
  }

  return { content: fullContent, reasoning: fullReasoning };
}

/** 文件转 data URL（base64），用于图片上传 */
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new AiClientError(AiErrorType.PARSE, '文件读取失败'));
    reader.readAsDataURL(file);
  });
}
