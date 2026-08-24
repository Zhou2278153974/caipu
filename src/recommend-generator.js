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
import { getAllRecipes, getAllPreferences, getAllFridgeIngredients } from './db.js';

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
5. **一日三餐营养健康**（注：此项优先级最低，若与下方第 9 条用户偏好冲突，**完全服从第 9 条**）：
   - 早餐：以易消化、有碳水+蛋白为主（如粥、面、蛋、包子、牛奶麦片等家常菜）。
   - 午餐：以饱腹、主菜+荤素搭配为主。
   - 晚餐：清淡不过饱，荤素合理，避免过油。
   - 整体一天的搭配：要尽量覆盖蛋白质（肉/蛋/豆制品）、蔬菜（绿叶菜、瓜类等）、主食（米饭/面/馒头/杂粮等），营养均衡丰富。
6. **荤素区分参考**（供你搭配时判断，不必写出来）：明显含猪/牛/羊/鸡/鸭/鱼/虾等动物肉类的视为荤；蛋、奶、豆腐、素菜等可灵活搭配。
7. 三餐的菜可以有不同的烹饪风格（炒、蒸、炖、煮、凉拌），但都是普通家庭能做的家常菜，不要出现高端食材或专业厨房设备。
8. 输出必须是合法 JSON，不要加任何前后文字。
9. ⭐ **用户个人偏好（最高优先级，本条无条件压倒所有其他规则）**：
   用户消息中会附带一份「用户饮食偏好标签」列表（如"不吃辣""不要油炸""爱吃甜"等，也可能为空列表表示没特别偏好）。
   如果这份列表里的任何一条，与上面第 5 条的「营养均衡 / 荤素合理 / 少盐少油」存在冲突，
   **必须 100% 服从用户偏好，绝不要用健康理由否决用户**。
   例如：用户说「爱吃高油高糖」→ 推荐就允许偏油偏甜的菜，不要强行塞清淡健康。
   例如：用户说「不吃辣」→ 所有菜都不能用辣椒/辣酱/麻辣口味。
   如果存在这种"冲突但按用户要求"的搭配，请在 nutrition_note 里**用一句话向用户说明**（例如："根据你偏好高油高糖，本次推荐口味偏重，已尽量在配菜里加入少量绿叶菜平衡维生素"），这样用户知道你是按他的喜好执行。`;

/** 构建用户消息（把用户菜谱库 + 偏好标签 + 冰箱食材 以文字方式提供给 AI）
 * @param {Array} libraryRecipes 菜谱库
 * @param {string[]} preferences 用户偏好标签（纯文字数组，空数组表示没设置偏好）
 * @param {Array<{name:string, amount?:string, unit?:string}>} [fridgeIngredients] 冰箱现有食材
 */
function buildUserMessage(libraryRecipes, preferences = [], fridgeIngredients = []) {
  const safeLib = Array.isArray(libraryRecipes) ? libraryRecipes : [];
  const userPrefs = Array.isArray(preferences)
    ? preferences.map((p) => String(p || '').trim()).filter(Boolean)
    : [];
  const prefBlock =
    userPrefs.length > 0
      ? `【用户个人偏好（本项优先级最高，冲突时无条件压倒营养均衡规则）】
以下是用户输入的饮食偏好 / 忌口列表，每条必须严格遵守：
${userPrefs.map((p, i) => `${i + 1}. ${p}`).join('\n')}

重要：若其中任何偏好与"健康、清淡、少盐少油"等通用营养原则冲突，请**完全按用户偏好执行**，不要用"不健康"为由调整，最多在 nutrition_note 里写一句"按你的偏好，本次×××，但保留了少量×××作补充"。\n\n`
      : '【用户个人偏好】：用户暂未设置任何偏好标签，请按默认的营养均衡原则搭配即可。\n\n';

  // 冰箱食材块：优先级仅低于用户偏好，高于菜谱库挑选
  const fridgeList = Array.isArray(fridgeIngredients)
    ? fridgeIngredients
        .map((i) => (i && i.name ? i : null))
        .filter(Boolean)
        .map((i) => {
          const amount = (i.amount || '').trim();
          const unit = (i.unit || '').trim();
          return `${i.name}${amount || unit ? ` ${amount}${unit}` : ''}`.trim();
        })
        .filter(Boolean)
    : [];
  const fridgeBlock =
    fridgeList.length > 0
      ? `【冰箱现有食材（优先级：仅次于用户偏好，优先于菜谱库挑选）】
以下是用户冰箱里目前有的食材清单，请在搭配今日三餐时**优先考虑使用这些食材**，帮助用户消耗冰箱库存、减少浪费，并据此减少重复采购（若用户偏好明确禁止某食材则除外）：
${fridgeList.map((f, i) => `${i + 1}. ${f}`).join('\n')}

\n\n`
      : '';

  const hasFridge = fridgeList.length > 0;
  let text;
  if (safeLib.length === 0) {
    const fridgeLine = hasFridge
      ? '请尽量使用上方【冰箱现有食材】里已有的食材，避免浪费。'
      : '';
    text = `${prefBlock}${fridgeBlock}当前我的菜谱库里没有任何菜谱。请由你自行搭配推荐今天的一日三餐，要求健康丰富，荤素合理（除非用户偏好另有要求）。${fridgeLine}\n直接输出 JSON。`;
  } else {
    // 只挑必要字段传给AI，节省token：id, name, intro, ingredients(只name+amount), steps, tips
    const compact = safeLib.map((r) => ({
      id: r.id,
      name: r.name,
      intro: r.intro || '',
      ingredients: Array.isArray(r.ingredients)
        ? r.ingredients.map((i) => ({
            name: i?.name || '',
            amount: i?.amount || '适量',
          }))
        : [],
      steps: Array.isArray(r.steps) ? r.steps : [],
      tips: r.tips || '',
      // 给 AI 的搭配线索：判断荤素（粗略提示，让AI更懂）
      _hint_tags: guessTags(r),
    }));
    const requirements = [
      '1. 早餐 1～3 道菜，午餐和晚餐各 3 道菜。',
      '2. 午餐和晚餐必须"一荤一素 + 第三道菜"（花荤/汤/其他），保证荤素搭配（用户偏好明确禁止的菜式可以例外，服从偏好）。',
      '3. 优先从菜谱库里挑合适的菜（填入 recipe_id 和完整 recipe，from_library=true）。',
      '4. 如果菜谱库里某餐没有合适的菜，或者为了营养均衡需要搭配新菜，就由你自行设计菜谱（recipe_id=null，from_library=false）。',
    ];
    if (hasFridge) requirements.push('5. 尽量优先使用上方【冰箱现有食材】里的食材（其次才是菜谱库），避免浪费。');
    requirements.push('6. 默认注意整体营养均衡；但用户偏好永远是第一优先级。');
    requirements.push('7. 直接按系统提示的 JSON 结构输出，每餐的菜品放在 dishes 数组里。');
    text = `${prefBlock}${fridgeBlock}以下是我已有的菜谱库（JSON 数组），每条都有 id 字段：
${JSON.stringify(compact, null, 2)}

请参考上面的菜谱${hasFridge ? '、冰箱食材' : ''}和用户偏好，为我推荐今天的一日三餐。
要求：
${requirements.join('\n')}`;
  }
  return { role: 'user', content: text };
}

/** 粗略给菜谱打标签，帮助 AI 快速判断荤素（仅作提示） */
function guessTags(recipe) {
  const tags = [];
  const name = (recipe?.name || '').toLowerCase();
  const ingNames = Array.isArray(recipe?.ingredients)
    ? recipe.ingredients.map((i) => (i?.name || '').toLowerCase())
    : [];
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
 * @param {()=>Promise<Array<{id:string, value:string}>>} [opts.getAllPreferences] 获取用户偏好标签
 * @param {()=>Promise<Array>} [opts.getAllFridgeIngredients] 获取冰箱食材
 * @param {Function} [opts.streamChat] 流式聊天
 * @param {Function} [opts.onDelta] 每段 content token 回调（用于UI实时显示）
 * @param {Function} [opts.onReasoning] 思维链回调
 * @param {Function} [opts.onProgress] 进度回调
 * @param {AbortSignal} [opts.signal] 取消信号
 * @returns {Promise<{nutrition_note:string, meals:object}>}
 */
export async function generateDailyRecommendation(opts = {}) {
  const _getAllRecipes = opts.getAllRecipes || getAllRecipes;
  const _getAllPreferences = opts.getAllPreferences || getAllPreferences;
  const _getAllFridgeIngredients = opts.getAllFridgeIngredients || getAllFridgeIngredients;
  const _streamChat = opts.streamChat || streamChat;
  if (!opts.config) throw new Error('缺少 API 配置');
  if (!opts.config.base_url || !opts.config.api_key || !opts.config.model) {
    throw new Error('API 配置不完整');
  }

  // 1. 先拿菜谱库 + 偏好标签 + 冰箱食材（并行加速）
  const [library, prefRecords, fridgeRecords] = await Promise.all([
    _getAllRecipes(),
    _getAllPreferences().catch(() => []), // 失败降级为空数组
    _getAllFridgeIngredients().catch(() => []), // 失败降级为空数组
  ]);
  // 偏好只取 value 纯文本数组
  const preferenceValues = Array.isArray(prefRecords)
    ? prefRecords.map((p) => (p && typeof p.value === 'string' ? p.value : '')).filter(Boolean)
    : [];

  // 2. 构建 messages（把偏好 + 冰箱食材送入用户消息）
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    buildUserMessage(library, preferenceValues, fridgeRecords),
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
