// 菜谱解析器：
//   - 构建给 AI 的提示词与消息
//   - 从 AI 文本响应中提取 JSON（容忍 ```json 包裹与多余文字）
//   - 校验并规范化为标准菜谱结构
//
// 菜谱结构（基础版）：
//   {
//     name: string,            // 菜名（必填非空）
//     intro: string,           // 简介（可空）
//     ingredients: [{name, amount}],  // 食材（必填，至少1项）
//     steps: [string],         // 步骤（必填，至少1项）
//     tips: string,            // 小贴士（可空）
//   }

export const RECIPE_SYSTEM_PROMPT = `你是一个菜谱整理助手。用户会给你一段来自社交媒体的菜谱内容（可能是文字，也可能是图片，或两者都有）。
请把它整理成结构化的菜谱，并严格以 JSON 格式输出，不要输出 JSON 之外的任何说明文字。

JSON 结构如下：
{
  "name": "菜名",
  "intro": "一两句话简介，没有则留空字符串",
  "ingredients": [
    { "name": "食材名", "amount": "用量，如 2个 / 100g / 适量" }
  ],
  "steps": ["步骤1", "步骤2"],
  "tips": "小贴士或注意事项，没有则留空字符串"
}

要求：
1. 只输出一个 JSON 对象，不要用 \`\`\` 包裹，不要有任何前后缀文字。
2. name 必须是非空字符串。
3. ingredients 至少 1 项，每项必须有 name（amount 可为"适量"等模糊描述，但不能省略字段）。
4. steps 至少 1 项，每个步骤是完整的一句话。
5. 如果输入内容明显不是菜谱（比如是广告、闲聊、无关内容），请输出：{"name": "", "ingredients": [], "steps": [], "intro": "", "tips": ""}。
6. 食材用量尽量保留原文信息，不要臆造。
7. 步骤按烹饪顺序排列。`;

/** 构造用户消息：支持纯文字、纯图片、或两者 */
export function buildUserMessage({ text, imageDataUrl } = {}) {
  if (!text && !imageDataUrl) {
    throw new Error('buildUserMessage: 至少需要 text 或 imageDataUrl 之一');
  }
  const parts = [];
  if (imageDataUrl) {
    parts.push({
      type: 'image_url',
      image_url: { url: imageDataUrl },
    });
  }
  parts.push({
    type: 'text',
    text: text || '请识别图片中的菜谱内容并整理成结构化菜谱。',
  });
  return { role: 'user', content: parts };
}

/** 从 AI 响应文本中提取 JSON 字符串 */
function extractJsonString(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  // 1. 直接是合法 JSON
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }
  // 2. ```json ... ``` 或 ``` ... ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) return fenceMatch[1].trim();
  // 3. 找第一个 { 到最后一个 } 之间的内容
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    return trimmed.slice(first, last + 1);
  }
  return trimmed;
}

/** 校验并规范化菜谱对象，返回 {valid, errors, recipe} */
export function validateRecipe(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valid: false, errors: ['响应不是 JSON 对象'], recipe: null };
  }
  const name = typeof obj.name === 'string' ? obj.name.trim() : '';
  if (!name) errors.push('菜名(name)为空');

  const intro = typeof obj.intro === 'string' ? obj.intro.trim() : '';
  const tips = typeof obj.tips === 'string' ? obj.tips.trim() : '';

  const rawIngredients = Array.isArray(obj.ingredients) ? obj.ingredients : [];
  const ingredients = [];
  for (const ing of rawIngredients) {
    if (!ing || typeof ing !== 'object') continue;
    const ingName = typeof ing.name === 'string' ? ing.name.trim() : '';
    const ingAmount = typeof ing.amount === 'string' ? ing.amount.trim() : '';
    if (ingName) ingredients.push({ name: ingName, amount: ingAmount || '适量' });
  }
  if (ingredients.length === 0) errors.push('食材(ingredients)为空');

  const rawSteps = Array.isArray(obj.steps) ? obj.steps : [];
  const steps = [];
  for (const s of rawSteps) {
    if (typeof s === 'string') {
      const t = s.trim();
      if (t) steps.push(t);
    }
  }
  if (steps.length === 0) errors.push('步骤(steps)为空');

  const recipe = { name, intro, ingredients, steps, tips };
  return { valid: errors.length === 0, errors, recipe };
}

/**
 * 解析 AI 响应文本为菜谱
 * @returns {{valid:boolean, errors:string[], recipe:object|null, raw:string}}
 */
export function parseRecipeResponse(rawText) {
  const jsonString = extractJsonString(rawText);
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    return {
      valid: false,
      errors: [`AI 响应不是合法 JSON：${e.message}`],
      recipe: null,
      raw: rawText,
    };
  }
  const result = validateRecipe(parsed);
  return { ...result, raw: rawText };
}
