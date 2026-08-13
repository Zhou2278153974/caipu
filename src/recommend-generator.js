// 今日推荐生成器：
//   - 构建营养搭配提示词
//   - 调用 AI 生成一日三餐（优先从用户菜谱库选，不足时 AI 自行推荐补齐）
//   - 解析并校验推荐结果结构
//
// 推荐结果结构：
// {
//   nutrition_note: "简短营养点评：说明今日搭配的荤素平衡、营养亮点",
//   meals: {
//     breakfast: { dishes: [ {recipe_id|null, recipe:{...}, from_library:bool}, ... ] },
//     lunch:     { dishes: [ ... ] },  // 午餐必须3道菜：一荤一素+第三道
//     dinner:    { dishes: [ ... ] }   // 晚餐必须3道菜：一荤一素+第三道
//   }
// }
//
// 设计原则：
//   - 优先从用户菜谱库中挑选搭配（from_library=true，recipe_id 有效）
//   - 菜谱库不足或空缺时，AI 自行设计菜谱（from_library=false，recipe_id=null）
//   - 所有返回菜谱都带完整 recipe 对象，方便直接收藏或展示
//   - 可测试：通过注入 services 替换 AI 调用、菜谱查询等依赖

import { streamChat } from './ai-client.js';
import { getAllRecipes } from './db.js';

// ================== 提示词 ==================

const SYSTEM_PROMPT = `你是一位专业的营养师与家常菜搭配顾问，擅长根据已有的家常菜菜谱设计一日三餐。

请严格按以下要求输出 JSON，不要任何前缀或后缀说明文字，不要用 \`\`\` 包裹。

输出结构：
{
  "nutrition_note": "一两句简短点评，说明今日三餐的荤素搭配、营养亮点（如蛋白质来源、维生素覆盖、粗粮等），不要长篇大论",
  "meals": {
    "breakfast": {
      "dishes": [
        { "recipe_id": null, "recipe": {...菜谱对象...}, "from_library": false }
      ]
    },
    "lunch": {
      "dishes": [
        { "recipe_id": null, "recipe": {...菜谱对象...}, "from_library": false },
        { "recipe_id": null, "recipe": {...菜谱对象...}, "from_library": false },
        { "recipe_id": null, "recipe": {...菜谱对象...}, "from_library": false }
      ]
    },
    "dinner": {
      "dishes": [
        { "recipe_id": null, "recipe": {...菜谱对象...}, "from_library": false },
        { "recipe_id": null, "recipe": {...菜谱对象...}, "from_library": false },
        { "recipe_id": null, "recipe": {...菜谱对象...}, "from_library": false }
      ]
    }
  }
}

菜谱对象结构（和系统其它模块一致）：
{
  "name": "菜名",
  "intro": "一两句话简介，没有则留空字符串",
  "ingredients": [ { "name": "食材名", "amount": "用量（如 2个 / 100g / 适量）" } ],
  "steps": ["步骤1完整一句话", "步骤2完整一句话"],
  "tips": "小贴士或注意事项，没有则留空字符串"
}

设计规则：
1. **每餐菜品数量**：
   - 早餐：1～3 道菜均可，由你根据营养需要自行决定（如一碗粥+一个蛋饼，或一个包子+一杯豆浆）。
   - 午餐：必须 3 道菜。
   - 晚餐：必须 3 道菜。
2. **午餐和晚餐的荤素搭配（必须严格遵守）**：
   - 3 道菜中必须包含至少 1 道荤菜和 1 道素菜。
   - 第 3 道菜可以是：花荤（半荤半素，如青椒炒肉丝）、汤类（如番茄蛋汤）、或其他菜品。
   - 总之每餐务必保证"一荤一素 + 第三道菜"的结构。
3. **优先从用户菜谱库挑选**：下面会给你一份用户已有的菜谱列表（JSON 数组）。如果有合适的，直接选它，并把菜谱的 id 填入 dish.recipe_id，dish.from_library=true，recipe 内容完整复制用户菜谱内容。
4. **AI 自行补齐**：如果用户菜谱库是空的、或搭配上缺少某餐合适的菜、或用户菜谱不够荤素平衡，请由你自行设计家常菜菜谱，并把 dish.recipe_id=null，dish.from_library=false，recipe 内容由你填写完整。
5. **一日三餐营养健康**：
   - 早餐：以易消化、有碳水+蛋白为主（如粥、面、蛋、包子、牛奶麦片等家常菜）。
   - 午餐：以饱腹、主菜+荤素搭配为主。
   - 晚餐：清淡不过饱，荤素合理，避免过油。
   - 整体一天的搭配：要尽量覆盖蛋白质（肉/蛋/豆制品）、蔬菜（绿叶菜、瓜类等）、主食（米饭/面/馒头/杂粮等），营养均衡丰富。
6. **荤素区分参考**（供你搭配时判断，不必写出来）：明显含猪/牛/羊/鸡/鸭/鱼/虾等动物肉类的视为荤；蛋、奶、豆腐、素菜等可灵活搭配。
7. 三餐的菜可以有不同的烹饪风格（炒、蒸、炖、煮、凉拌），但都是普通家庭能做的家常菜，不要出现高端食材或专业厨房设备。
8. 输出必须是合法 JSON，不要加任何前后文字。
`;

/** 构建用户消息（把用户菜谱库以 JSON 方式提供给 AI） */
function buildUserMessage(libraryRecipes) {
  let text;
  if (!libraryRecipes || libraryRecipes.length === 0) {
    text = `当前我的菜谱库里没有任何菜谱。请由你自行搭配推荐今天的一日三餐，要求健康丰富，荤素合理。\n直接输出 JSON。`;
  } else {
    // 只挑必要字段传给AI，节省token：id, name, intro, ingredients(只name+amount), steps, tips
    const compact = libraryRecipes.map((r) => ({
      id: r.id,
      name: r.name,
      intro: r.intro || '',
      ingredients: (r.ingredients || []).map((i) => ({
        name: i.name,
        amount: i.amount || '适量',
      })),
      steps: Array.isArray(r.steps) ? r.steps : [],
      tips: r.tips || '',
      // 给 AI 的搭配线索：判断荤素（粗略提示，让AI更懂）
      _hint_tags: guessTags(r),
    }));
    text = `以下是我已有的菜谱库（JSON 数组），每条都有 id 字段：
${JSON.stringify(compact, null, 2)}

请参考上面的菜谱，为我推荐今天的一日三餐。
要求：
1. 早餐 1～3 道菜，午餐和晚餐各 3 道菜。
2. 午餐和晚餐必须"一荤一素 + 第三道菜"（花荤/汤/其他），保证荤素搭配。
3. 优先从菜谱库里挑合适的菜（填入 recipe_id 和完整 recipe，from_library=true）。
4. 如果菜谱库里某餐没有合适的菜，或者为了营养均衡需要搭配新菜，就由你自行设计菜谱（recipe_id=null，from_library=false）。
5. 注意整体营养均衡，一天的三餐尽量覆盖蛋白质、蔬菜、主食。
6. 直接按系统提示的 JSON 结构输出，每餐的菜品放在 dishes 数组里。`;
  }
  return { role: 'user', content: text };
}

/** 粗略给菜谱打标签，帮助 AI 快速判断荤素（仅作提示） */
function guessTags(recipe) {
  const tags = [];
  const name = (recipe.name || '').toLowerCase();
  const ingNames = (recipe.ingredients || []).map((i) => (i.name || '').toLowerCase());
  const allText = [name, ...ingNames].join(' ');
  const meatKeywords = ['肉', '猪', '牛', '羊', '鸡', '鸭', '鱼', '虾', '排骨', '五花', '里脊', '腿', '翅', '腩', '肝', '肚', '肠', '蟹', '贝', '鱿', '墨', '骨', '牛腩', '猪肉', '牛肉', '羊肉', '鸡肉', '鱼肉', 'beef', 'pork', 'chicken', 'fish', 'shrimp'];
  const vegKeywords = ['蔬', '菜', '青', '瓜', '番茄', '西红柿', '茄', '椒', '土豆', '萝卜', '白菜', '生菜', '菠菜', '豆腐', '豆干', '豆', '菇', '菌', '笋', '藕', '海带', '木耳'];
  const eggKeywords = ['蛋', '鸡蛋', '煎蛋', '蒸蛋', '蛋饼'];
  if (meatKeywords.some((k) => allText.includes(k))) tags.push('荤');
  if (eggKeywords.some((k) => allText.includes(k))) tags.push('含蛋');
  if (vegKeywords.some((k) => allText.includes(k))) tags.push('素');
  if (tags.length === 0) tags.push('家常菜');
  return tags;
}

// ================== 解析与校验 ==================

/** 从原始文本中提取 JSON（和 recipe-parser 类似的兜底策略） */
function extractJsonString(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) return fenceMatch[1].trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}

/** 校验单个菜谱对象（最小可用） */
function normalizeRecipe(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const name = typeof obj.name === 'string' ? obj.name.trim() : '';
  if (!name) return null;
  const intro = typeof obj.intro === 'string' ? obj.intro.trim() : '';
  const tips = typeof obj.tips === 'string' ? obj.tips.trim() : '';
  const ingredients = [];
  for (const ing of Array.isArray(obj.ingredients) ? obj.ingredients : []) {
    if (!ing || typeof ing !== 'object') continue;
    const n = typeof ing.name === 'string' ? ing.name.trim() : '';
    if (!n) continue;
    ingredients.push({ name: n, amount: typeof ing.amount === 'string' ? ing.amount.trim() : '适量' });
  }
  if (ingredients.length === 0) return null;
  const steps = [];
  for (const s of Array.isArray(obj.steps) ? obj.steps : []) {
    if (typeof s !== 'string') continue;
    const t = s.trim();
    if (t) steps.push(t);
  }
  if (steps.length === 0) return null;
  return { name, intro, ingredients, steps, tips };
}

/** 校验单个 dish（一道菜） */
function normalizeDish(obj) {
  if (!obj || typeof obj !== 'object') return { valid: false, errors: ['菜品为空'] };
  const errors = [];
  const recipe = normalizeRecipe(obj.recipe);
  if (!recipe) errors.push('菜谱结构不完整（name/ingredients/steps 缺一）');
  let recipe_id = null;
  if (obj.recipe_id !== null && obj.recipe_id !== undefined && obj.recipe_id !== '') {
    recipe_id = Number(obj.recipe_id);
    if (Number.isNaN(recipe_id) || recipe_id <= 0) recipe_id = null;
  }
  const from_library = !!obj.from_library && recipe_id !== null;
  return {
    valid: errors.length === 0,
    errors,
    dish: {
      recipe_id: from_library ? recipe_id : null,
      from_library,
      recipe: recipe || { name: '', intro: '', ingredients: [], steps: [], tips: '' },
    },
  };
}

/** 校验一餐（包含 dishes 数组） */
function normalizeMeal(obj) {
  if (!obj || typeof obj !== 'object') return { valid: false, errors: ['餐段为空'] };
  const errors = [];
  const rawDishes = Array.isArray(obj.dishes) ? obj.dishes : [];
  if (rawDishes.length === 0) {
    return { valid: false, errors: ['dishes 为空（至少需要1道菜）'] };
  }
  const dishes = [];
  for (let i = 0; i < rawDishes.length; i++) {
    const r = normalizeDish(rawDishes[i]);
    if (!r.valid) {
      errors.push(`第${i + 1}道菜：${r.errors.join('；')}`);
    } else {
      dishes.push(r.dish);
    }
  }
  return {
    valid: errors.length === 0,
    errors,
    meal: { dishes },
  };
}

/** 校验整体推荐结构 */
export function validateRecommendation(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') {
    return { valid: false, errors: ['响应不是对象'], data: null };
  }
  const nutrition_note = typeof obj.nutrition_note === 'string' ? obj.nutrition_note.trim() : '';
  if (!obj.meals || typeof obj.meals !== 'object') {
    errors.push('缺少 meals 字段');
    return { valid: false, errors, data: null };
  }
  const result = { nutrition_note, meals: {} };
  for (const slot of ['breakfast', 'lunch', 'dinner']) {
    const r = normalizeMeal(obj.meals[slot]);
    if (!r.valid) {
      errors.push(`${slot}：${r.errors.join('；')}`);
    } else {
      result.meals[slot] = r.meal;
    }
  }
  return { valid: errors.length === 0, errors, data: errors.length === 0 ? result : null };
}

/** 解析 AI 返回的完整文本为推荐结果 */
export function parseRecommendationResponse(rawText) {
  const jsonString = extractJsonString(rawText);
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    return {
      valid: false,
      errors: [`AI 响应不是合法 JSON：${e.message}`],
      data: null,
      raw: rawText,
    };
  }
  const r = validateRecommendation(parsed);
  return { ...r, raw: rawText };
}

// ================== 主入口 ==================

/**
 * 生成今日三餐推荐（真实流式调用 + 解析校验）
 * 所有依赖通过 services 注入，便于测试。
 *
 * @param {object} opts
 * @param {object} opts.config API 配置 {base_url, api_key, model}
 * @param {()=>Promise<Array>} [opts.getAllRecipes] 获取用户菜谱库
 * @param {Function} [opts.streamChat] 流式聊天
 * @param {Function} [opts.onDelta] 每段 content token 回调（用于UI实时显示）
 * @param {Function} [opts.onReasoning] 思维链回调
 * @param {Function} [opts.onProgress] 进度回调
 * @param {AbortSignal} [opts.signal] 取消信号
 * @returns {Promise<{nutrition_note:string, meals:object}>}
 */
export async function generateDailyRecommendation(opts = {}) {
  const _getAllRecipes = opts.getAllRecipes || getAllRecipes;
  const _streamChat = opts.streamChat || streamChat;
  if (!opts.config) throw new Error('缺少 API 配置');
  if (!opts.config.base_url || !opts.config.api_key || !opts.config.model) {
    throw new Error('API 配置不完整');
  }

  // 1. 先拿菜谱库
  const library = await _getAllRecipes();

  // 2. 构建 messages
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    buildUserMessage(library),
  ];

  // 3. 流式调用 AI
  const result = await _streamChat(opts.config, messages, {
    signal: opts.signal,
    temperature: opts.temperature ?? 0.7,
    onDelta: opts.onDelta,
    onReasoning: opts.onReasoning,
    onProgress: opts.onProgress,
  });
  const finalText = result.content || '';

  // 4. 解析 + 校验
  const parsed = parseRecommendationResponse(finalText);
  if (!parsed.valid) {
    const err = new Error(`推荐解析失败：${parsed.errors.join('；')}`);
    err.raw = finalText;
    err.errors = parsed.errors;
    throw err;
  }
  return {
    generated_at: Date.now(),
    nutrition_note: parsed.data.nutrition_note,
    meals: parsed.data.meals,
  };
}
