// UI 共享工具：把 AI 客户端错误转为面向用户的中文说明
import { AiErrorType } from './ai-client.js';

const ERROR_MESSAGES = {
  [AiErrorType.NETWORK]:
    '网络连接失败。请检查 base_url 是否正确、网络是否通畅；部分服务不允许浏览器跨域访问(CORS)，可能需要联系服务商开启。',
  [AiErrorType.AUTH]: '鉴权失败。请检查 api_key 是否正确。',
  [AiErrorType.MODEL_NOT_FOUND]: '资源不存在(404)。请检查 base_url 路径或模型名是否正确。',
  [AiErrorType.RATE_LIMIT]: '请求过于频繁(429)，请稍后再试。',
  [AiErrorType.SERVER]: '服务器内部错误，请稍后再试。',
  [AiErrorType.BAD_REQUEST]: '请求参数有误，请检查配置。',
  [AiErrorType.PARSE]: '响应解析失败，可能是该服务返回格式不兼容。',
  [AiErrorType.ABORTED]: '请求已取消。',
  [AiErrorType.UNKNOWN]: '发生未知错误。',
};

/** 返回面向用户的错误说明（含原始 message） */
export function aiErrorMessage(error) {
  if (!error) return '未知错误';
  const type = error.type || AiErrorType.UNKNOWN;
  const base = ERROR_MESSAGES[type] || ERROR_MESSAGES[AiErrorType.UNKNOWN];
  const detail = error.message ? `（${error.message}）` : '';
  return `${base}${detail}`;
}
