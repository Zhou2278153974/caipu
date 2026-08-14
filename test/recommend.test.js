import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getTodayKey,
  getRecommendation,
  saveRecommendation,
  saveApiConfig,
  clearAllRecommendations,
  _resetDbForTesting,
  clearAllRecipes,
  clearAllSettings,
} from '../src/db.js';
import {
  validateRecommendation,
  parseRecommendationResponse,
  generateDailyRecommendation,
} from '../src/recommend-generator.js';
import { renderRecommendView } from '../src/views/recommend.js';
import { mountApp } from '../src/app.js';

beforeEach(async () => {
  document.body.innerHTML = '';
  _resetDbForTesting();
  await clearAllRecipes();
  await clearAllSettings();
  await clearAllRecommendations();
});

function flush(ms = 0) {
  return new Promise((res) => setTimeout(res, ms));
}

// =============== DB 层 ===============
describe('今日推荐 - DB 层', () => {
  it('getTodayKey 返回 YYYY-MM-DD 格式', () => {
    const d = new Date(2025, 0, 5); // 2025-01-05 (月份从0起)
    expect(getTodayKey(d)).toBe('2025-01-05');
    const d2 = new Date(2024, 11, 31); // 2024-12-31
    expect(getTodayKey(d2)).toBe('2024-12-31');
  });

  it('未写入时 getRecommendation 返回 null', async () => {
    const r = await getRecommendation('2025-01-01');
    expect(r).toBeNull();
  });

  it('saveRecommendation 写入后 getRecommendation 能读到三餐 dishes 结构', async () => {
    const data = {
      generated_at: 123456,
      nutrition_note: '今日营养均衡',
      meals: {
        breakfast: { dishes: [ { recipe_id: null, from_library: false, recipe: { name: '早餐1', intro: '', ingredients: [{ name: 'a', amount: '1' }], steps: ['a'], tips: '' } } ] },
        lunch:     { dishes: [ { recipe_id: 1,    from_library: true,  recipe: { name: '午餐1', intro: '', ingredients: [{ name: 'b', amount: '1' }], steps: ['b'], tips: '' } } ] },
        dinner:    { dishes: [ { recipe_id: null, from_library: false, recipe: { name: '晚餐1', intro: '', ingredients: [{ name: 'c', amount: '1' }], steps: ['c'], tips: '' } } ] },
      },
    };
    await saveRecommendation('2025-01-01', data);
    const got = await getRecommendation('2025-01-01');
    expect(got).toBeTruthy();
    expect(got.date).toBe('2025-01-01');
    expect(got.nutrition_note).toBe('今日营养均衡');
    expect(got.meals.breakfast.dishes[0].recipe.name).toBe('早餐1');
    expect(got.meals.lunch.dishes[0].from_library).toBe(true);
    expect(got.meals.lunch.dishes[0].recipe_id).toBe(1);
  });

  it('同日期两次 saveRecommendation 是覆盖式（不是新增两条）', async () => {
    const meal = (name) => ({ dishes: [ { recipe_id: null, from_library: false, recipe: makeMealRecipe(name) } ] });
    await saveRecommendation('2025-06-01', {
      generated_at: 1, nutrition_note: '第一版', meals: {
        breakfast: meal('A'),
        lunch:     meal('B'),
        dinner:    meal('C'),
      },
    });
    await saveRecommendation('2025-06-01', {
      generated_at: 2, nutrition_note: '第二版', meals: {
        breakfast: meal('A2'),
        lunch:     meal('B2'),
        dinner:    meal('C2'),
      },
    });
    const got = await getRecommendation('2025-06-01');
    expect(got.nutrition_note).toBe('第二版');
    expect(got.meals.breakfast.dishes[0].recipe.name).toBe('A2');
  });

  it('clearAllRecommendations 清空缓存', async () => {
    const meal = (name) => ({ dishes: [ { recipe_id: null, from_library: false, recipe: makeMealRecipe(name) } ] });
    const meals = {
      breakfast: meal('A'),
      lunch:     meal('B'),
      dinner:    meal('C'),
    };
    await saveRecommendation('2025-07-07', { generated_at: 1, nutrition_note: 'x', meals });
    await saveRecommendation('2025-07-08', { generated_at: 2, nutrition_note: 'y', meals });
    await clearAllRecommendations();
    expect(await getRecommendation('2025-07-07')).toBeNull();
    expect(await getRecommendation('2025-07-08')).toBeNull();
  });
});

// =============== 解析层 ===============
function makeMealRecipe(name = '菜', extra = {}) {
  return {
    name,
    intro: '',
    ingredients: [{ name: '鸡蛋', amount: '2个' }],
    steps: ['第一步怎么做'],
    tips: '',
    ...extra,
  };
}
function fullRecommendation() {
  return {
    nutrition_note: '今天有荤有素',
    meals: {
      breakfast: { dishes: [
        { recipe_id: null, from_library: false, recipe: makeMealRecipe('燕麦牛奶') },
      ] },
      lunch:     { dishes: [
        { recipe_id: 7,    from_library: true,  recipe: makeMealRecipe('番茄牛腩') },
        { recipe_id: null, from_library: false, recipe: makeMealRecipe('清炒菠菜') },
        { recipe_id: null, from_library: false, recipe: makeMealRecipe('紫菜蛋汤') },
      ] },
      dinner:    { dishes: [
        { recipe_id: null, from_library: false, recipe: makeMealRecipe('清炒时蔬') },
        { recipe_id: null, from_library: false, recipe: makeMealRecipe('红烧豆腐') },
        { recipe_id: null, from_library: false, recipe: makeMealRecipe('小米粥') },
      ] },
    },
  };
}

describe('今日推荐 - 解析与校验', () => {
  it('validateRecommendation: 完整结构返回 valid=true', () => {
    const r = validateRecommendation(fullRecommendation());
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.data.meals.breakfast.dishes[0].recipe.name).toBe('燕麦牛奶');
    // 来自菜谱库的 recipe_id 保留
    expect(r.data.meals.lunch.dishes[0].recipe_id).toBe(7);
    expect(r.data.meals.lunch.dishes[0].from_library).toBe(true);
  });

  it('validateRecommendation: 非 AI 原创的菜，recipe_id 非法会被置 null 且 from_library=false', () => {
    const data = fullRecommendation();
    data.meals.lunch.dishes[0].recipe_id = 'abc'; // 非法 id
    data.meals.lunch.dishes[0].from_library = true;
    const r = validateRecommendation(data);
    expect(r.valid).toBe(true);
    expect(r.data.meals.lunch.dishes[0].recipe_id).toBeNull();
    expect(r.data.meals.lunch.dishes[0].from_library).toBe(false);
  });

  it('validateRecommendation: 缺某一餐 → invalid', () => {
    const data = fullRecommendation();
    delete data.meals.dinner;
    const r = validateRecommendation(data);
    expect(r.valid).toBe(false);
    expect(r.errors.join('')).toContain('dinner');
  });

  it('validateRecommendation: 某餐菜谱结构不完整（无步骤）→ invalid', () => {
    const data = fullRecommendation();
    data.meals.breakfast.dishes[0].recipe.steps = [];
    const r = validateRecommendation(data);
    expect(r.valid).toBe(false);
    expect(r.errors.join('')).toContain('breakfast');
  });

  it('parseRecommendationResponse: 直接裸 JSON', () => {
    const raw = JSON.stringify(fullRecommendation());
    const r = parseRecommendationResponse(raw);
    expect(r.valid).toBe(true);
    expect(r.data.meals.lunch.dishes[0].recipe_id).toBe(7);
  });

  it('parseRecommendationResponse: 支持 ```json ... ``` 包裹', () => {
    const raw = '好的，以下是推荐：\n```json\n' + JSON.stringify(fullRecommendation()) + '\n```\n希望你喜欢！';
    const r = parseRecommendationResponse(raw);
    expect(r.valid).toBe(true);
    expect(r.data.nutrition_note).toBe('今天有荤有素');
  });

  it('parseRecommendationResponse: AI 输出不是 JSON 时 valid=false', () => {
    const r = parseRecommendationResponse('抱歉我无法推荐任何内容');
    expect(r.valid).toBe(false);
    expect(r.errors.join('')).toContain('JSON');
  });
});

// =============== 生成层 ===============
describe('今日推荐 - generateDailyRecommendation', () => {
  const CONFIG = { base_url: 'https://x/v1', api_key: 'sk-1', model: 'm1' };

  it('必须提供完整 API 配置，否则抛错', async () => {
    await expect(generateDailyRecommendation({ config: {} })).rejects.toThrow(/API 配置不完整/);
  });

  it('会读取菜谱库并传给 AI，再解析结果', async () => {
    const libraryRecipes = [
      { id: 5, name: '红烧肉', intro: '', ingredients: [{ name: '猪肉', amount: '500g' }], steps: ['切块下锅炖'], tips: '小火慢炖' },
      { id: 6, name: '凉拌黄瓜', intro: '', ingredients: [{ name: '黄瓜', amount: '2根' }], steps: ['拍碎拌蒜泥'], tips: '冷藏更好吃' },
    ];
    const fakeGenerateResult = fullRecommendation();
    // 让 AI 从菜谱库挑红烧肉当午餐第一道菜
    fakeGenerateResult.meals.lunch = {
      dishes: [
        { recipe_id: 5, from_library: true, recipe: { ...libraryRecipes[0] } },
      ],
    };

    const streamChat = vi.fn().mockResolvedValue({
      content: JSON.stringify(fakeGenerateResult),
      reasoning: '',
    });

    const result = await generateDailyRecommendation({
      config: CONFIG,
      getAllRecipes: vi.fn().mockResolvedValue(libraryRecipes),
      streamChat,
    });

    expect(streamChat).toHaveBeenCalledTimes(1);
    const callArg = streamChat.mock.calls[0];
    // 第二个参数是 messages 数组
    const messages = callArg[1];
    expect(messages.length).toBe(2);
    // 用户消息里包含了菜谱库的菜名
    const userText = typeof messages[1].content === 'string' ? messages[1].content : '';
    expect(userText).toContain('红烧肉');
    expect(userText).toContain('凉拌黄瓜');
    // 解析结果正确
    expect(result.meals.lunch.dishes[0].recipe.name).toBe('红烧肉');
    expect(result.meals.lunch.dishes[0].recipe_id).toBe(5);
    expect(result.meals.lunch.dishes[0].from_library).toBe(true);
    expect(typeof result.generated_at).toBe('number');
  });

  it('菜谱库为空时，user message 明确告知 AI 自行设计', async () => {
    const streamChat = vi.fn().mockResolvedValue({
      content: JSON.stringify(fullRecommendation()),
      reasoning: '',
    });
    await generateDailyRecommendation({
      config: CONFIG,
      getAllRecipes: vi.fn().mockResolvedValue([]),
      streamChat,
    });
    const userText = streamChat.mock.calls[0][1][1].content;
    expect(userText).toContain('没有任何菜谱');
    expect(userText).toContain('自行搭配');
  });

  it('AI 输出解析失败时抛错并附带 errors', async () => {
    const streamChat = vi.fn().mockResolvedValue({
      content: '随便说点话不是 JSON',
      reasoning: '',
    });
    try {
      await generateDailyRecommendation({
        config: CONFIG,
        getAllRecipes: vi.fn().mockResolvedValue([]),
        streamChat,
      });
      expect.fail('预期抛出错误');
    } catch (e) {
      expect(e.errors).toBeTruthy();
      expect(e.errors.join('')).toContain('JSON');
    }
  });

  it('AbortSignal 取消时透传 streamChat 的错误', async () => {
    const ctrl = new AbortController();
    const err = new Error('aborted');
    err.name = 'AbortError';
    const streamChat = vi.fn().mockImplementation(() => {
      ctrl.abort();
      return Promise.reject(err);
    });
    await expect(
      generateDailyRecommendation({
        config: CONFIG,
        getAllRecipes: vi.fn().mockResolvedValue([]),
        streamChat,
        signal: ctrl.signal,
      })
    ).rejects.toThrow();
  });
});

// =============== 视图层 ===============
describe('今日推荐 - 视图', () => {
  function mountView(services = {}) {
    const c = document.createElement('div');
    document.body.appendChild(c);
    renderRecommendView(c, services);
    return c;
  }

  it('未配置 API 时弹出配置提示弹框（不是空状态按钮）', async () => {
    const c = mountView({
      getApiConfig: vi.fn().mockResolvedValue({ base_url: '', api_key: '', model: '' }),
    });
    await flush();
    // 弹框出现在 body 上
    const overlay = document.querySelector('.recommend-modal-overlay');
    expect(overlay).toBeTruthy();
    // 弹框标题和描述
    expect(overlay.textContent).toContain('需要配置 API');
    expect(overlay.textContent).toContain('设置');
    // 确认和取消按钮都存在
    expect(overlay.querySelector('#recommend-modal-confirm')).toBeTruthy();
    expect(overlay.querySelector('#recommend-modal-cancel')).toBeTruthy();
    // 操作栏不再有"去设置"按钮
    const btns = c.querySelectorAll('#recommend-actions button');
    expect(btns.length).toBe(0);
  });

  it('弹框点击「确认」会调用 goToView(settings, { subpage: "api" }) 并关闭弹框', async () => {
    const goToView = vi.fn();
    const c = mountView({
      getApiConfig: vi.fn().mockResolvedValue({ base_url: '', api_key: '', model: '' }),
      goToView,
    });
    await flush();
    const overlay = document.querySelector('.recommend-modal-overlay');
    expect(overlay).toBeTruthy();
    overlay.querySelector('#recommend-modal-confirm').click();
    await flush();
    expect(goToView).toHaveBeenCalledWith('settings', { subpage: 'api' });
    // 弹框已关闭
    expect(document.querySelector('.recommend-modal-overlay')).toBeNull();
  });

  it('弹框点击「取消」关闭弹框但不跳转', async () => {
    const goToView = vi.fn();
    mountView({
      getApiConfig: vi.fn().mockResolvedValue({ base_url: '', api_key: '', model: '' }),
      goToView,
    });
    await flush();
    const overlay = document.querySelector('.recommend-modal-overlay');
    expect(overlay).toBeTruthy();
    overlay.querySelector('#recommend-modal-cancel').click();
    await flush();
    expect(goToView).not.toHaveBeenCalled();
    expect(document.querySelector('.recommend-modal-overlay')).toBeNull();
  });

  it('已配置 API + 今日有缓存 → 直接显示三餐折叠面板，不调 AI', async () => {
    const today = getTodayKey();
    const meals = {
      breakfast: { dishes: [ { recipe_id: null, from_library: false, recipe: makeMealRecipe('三明治') } ] },
      lunch:     { dishes: [ { recipe_id: 2,    from_library: true,  recipe: makeMealRecipe('红烧排骨') } ] },
      dinner:    { dishes: [ { recipe_id: null, from_library: false, recipe: makeMealRecipe('冬瓜汤') } ] },
    };
    await saveRecommendation(today, {
      generated_at: Date.now(),
      nutrition_note: '今天吃的不错',
      meals,
    });
    // clearAllRecipes 不影响已保存的推荐，但这里 save 是真实 DB 写入没问题
    const generateSpy = vi.fn();
    const c = mountView({
      getApiConfig: vi.fn().mockResolvedValue({ base_url: 'x', api_key: 'x', model: 'x' }),
      getRecommendation,
      generateDailyRecommendation: generateSpy,
    });
    await flush(50);
    expect(generateSpy).not.toHaveBeenCalled();
    // 三个折叠面板（早/午/晚）
    const panels = c.querySelectorAll('.meal-accordion-item');
    expect(panels.length).toBe(3);
    // 菜名正确渲染（折叠面板内容仍在 DOM 中）
    expect(c.textContent).toContain('三明治');
    expect(c.textContent).toContain('红烧排骨');
    expect(c.textContent).toContain('冬瓜汤');
    // 营养点评显示
    const note = c.querySelector('#recommend-nutrition');
    expect(note).toBeTruthy();
    expect(note.style.display).not.toBe('none');
  });

  it('AI 原创菜点击收藏会调 createRecipe，并变更按钮文案', async () => {
    const today = getTodayKey();
    const meals = {
      breakfast: { dishes: [ { recipe_id: null, from_library: false, recipe: makeMealRecipe('新菜早餐') } ] },
      lunch:     { dishes: [ { recipe_id: null, from_library: false, recipe: makeMealRecipe('新菜午餐') } ] },
      dinner:    { dishes: [ { recipe_id: null, from_library: false, recipe: makeMealRecipe('新菜晚餐') } ] },
    };
    await saveRecommendation(today, {
      generated_at: Date.now(),
      nutrition_note: '',
      meals,
    });
    const createRecipe = vi.fn().mockImplementation((r) => Promise.resolve({ ...r, id: 999 }));
    const c = mountView({
      getApiConfig: vi.fn().mockResolvedValue({ base_url: 'x', api_key: 'x', model: 'x' }),
      getRecommendation,
      createRecipe,
    });
    await flush(30);
    const saveBtn = c.querySelector('#save-dish-breakfast-0');
    expect(saveBtn).toBeTruthy();
    expect(saveBtn.disabled).toBe(false);
    expect(saveBtn.textContent).toBe('收藏到我的菜谱');
    saveBtn.click();
    await flush(30);
    expect(createRecipe).toHaveBeenCalledTimes(1);
    // 参数是完整菜谱
    const arg = createRecipe.mock.calls[0][0];
    expect(arg.name).toBe('新菜早餐');
    expect(Array.isArray(arg.ingredients)).toBe(true);
    // 按钮文本变了
    expect(saveBtn.textContent).toBe('已收藏 ✓');
  });

  it('已在菜谱库的菜：收藏按钮是禁用状态', async () => {
    const today = getTodayKey();
    const meals = {
      breakfast: { dishes: [ { recipe_id: 3,    from_library: true,  recipe: makeMealRecipe('库里的菜') } ] },
      lunch:     { dishes: [ { recipe_id: null, from_library: false, recipe: makeMealRecipe('新菜午餐') } ] },
      dinner:    { dishes: [ { recipe_id: null, from_library: false, recipe: makeMealRecipe('新菜晚餐') } ] },
    };
    await saveRecommendation(today, { generated_at: Date.now(), nutrition_note: '', meals });
    const createRecipe = vi.fn();
    const c = mountView({
      getApiConfig: vi.fn().mockResolvedValue({ base_url: 'x', api_key: 'x', model: 'x' }),
      getRecommendation,
      createRecipe,
    });
    await flush(30);
    const btn = c.querySelector('#save-dish-breakfast-0');
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain('已在菜谱库');
    // badge 是来自菜谱库
    expect(c.textContent).toContain('来自菜谱库');
  });

  it('菜谱数据异常：ingredients 或 steps 为 undefined/null 时不崩溃（显示空列表）', async () => {
    const today = getTodayKey();
    // 构造有缺陷的菜谱数据（模拟 AI 返回异常结构）
    const meals = {
      breakfast: { dishes: [
        // ingredients 为 undefined
        { recipe_id: null, from_library: false, recipe: { name: '异常早餐', intro: '', ingredients: undefined, steps: ['步骤1'], tips: '' } },
        // steps 为 null
        { recipe_id: null, from_library: false, recipe: { name: '异常早餐2', intro: '', ingredients: [{ name: '盐', amount: '少许' }], steps: null, tips: '' } },
      ] },
      lunch:     { dishes: [
        // ingredients 和 steps 都缺失
        { recipe_id: null, from_library: false, recipe: { name: '异常午餐', intro: '', tips: '' } },
      ] },
      dinner:    { dishes: [
        // 正常菜谱（对比用）
        { recipe_id: null, from_library: false, recipe: makeMealRecipe('正常晚餐') },
      ] },
    };
    await saveRecommendation(today, { generated_at: Date.now(), nutrition_note: '测试异常数据', meals });

    const c = mountView({
      getApiConfig: vi.fn().mockResolvedValue({ base_url: 'x', api_key: 'x', model: 'x' }),
      getRecommendation,
    });
    await flush(50);

    // 页面应该正常渲染，不崩溃
    expect(c.querySelector('.meal-accordion-item')).toBeTruthy();
    // 三个餐段都渲染出来
    const panels = c.querySelectorAll('.meal-accordion-item');
    expect(panels.length).toBe(3);
    // 异常菜谱也显示出来（菜名存在）
    expect(c.textContent).toContain('异常早餐');
    expect(c.textContent).toContain('异常早餐2');
    expect(c.textContent).toContain('异常午餐');
    expect(c.textContent).toContain('正常晚餐');
    // 营养点评正常显示
    expect(c.querySelector('#recommend-nutrition')).toBeTruthy();
  });

  it('换一批按钮点击后会走重新生成流程（确认后调用 generate 并写入缓存）', async () => {
    const today = getTodayKey();
    const meal = (name) => ({ dishes: [ { recipe_id: null, from_library: false, recipe: makeMealRecipe(name) } ] });
    const mealsOld = {
      breakfast: meal('旧早餐'),
      lunch:     meal('旧午餐'),
      dinner:    meal('旧晚餐'),
    };
    const mealsNew = {
      breakfast: meal('新早餐'),
      lunch:     meal('新午餐'),
      dinner:    meal('新晚餐'),
    };
    await saveRecommendation(today, { generated_at: 1, nutrition_note: '旧', meals: mealsOld });

    const generateDailyRecommendation = vi.fn().mockResolvedValue({
      generated_at: Date.now(),
      nutrition_note: '新版营养',
      meals: mealsNew,
    });

    const c = mountView({
      getApiConfig: vi.fn().mockResolvedValue({ base_url: 'x', api_key: 'x', model: 'x' }),
      getRecommendation,
      saveRecommendation,
      generateDailyRecommendation,
    });
    await flush(30);
    expect(c.textContent).toContain('旧早餐');
    const btn = c.querySelector('#btn-refresh');
    expect(btn.textContent).toBe('换一批');
    btn.click();
    await flush(30);
    // 现在用的是自定义 asyncConfirm 弹框，需要点弹框的确认按钮
    const okBtn = document.querySelector('#async-confirm-ok');
    expect(okBtn).toBeTruthy();
    okBtn.click();
    await flush(50);
    expect(generateDailyRecommendation).toHaveBeenCalledTimes(1);
    // 页面内容被更新
    expect(c.textContent).toContain('新早餐');
    // 缓存被写入（今天）
    const after = await getRecommendation(today);
    expect(after.nutrition_note).toBe('新版营养');
    expect(after.meals.breakfast.dishes[0].recipe.name).toBe('新早餐');
  });

  it('每餐 dishes 数组结构：午餐折叠面板内渲染3道菜卡片，晚餐3道，早餐1道', async () => {
    const today = getTodayKey();
    await saveRecommendation(today, {
      generated_at: Date.now(),
      nutrition_note: '今天有荤有素',
      meals: fullRecommendation().meals,
    });
    const c = mountView({
      getApiConfig: vi.fn().mockResolvedValue({ base_url: 'x', api_key: 'x', model: 'x' }),
      getRecommendation,
    });
    await flush(30);

    const breakfastDishes = c.querySelectorAll('.meal-accordion-item[data-slot="breakfast"] .dish-card');
    const lunchDishes = c.querySelectorAll('.meal-accordion-item[data-slot="lunch"] .dish-card');
    const dinnerDishes = c.querySelectorAll('.meal-accordion-item[data-slot="dinner"] .dish-card');
    expect(breakfastDishes.length).toBe(1);
    expect(lunchDishes.length).toBe(3);
    expect(dinnerDishes.length).toBe(3);

    // 午餐3道菜菜名都渲染了
    expect(c.textContent).toContain('番茄牛腩');
    expect(c.textContent).toContain('清炒菠菜');
    expect(c.textContent).toContain('紫菜蛋汤');
  });

  it('折叠面板：三餐默认全部收起（都没有 open 属性）', async () => {
    const today = getTodayKey();
    await saveRecommendation(today, {
      generated_at: Date.now(),
      nutrition_note: '',
      meals: fullRecommendation().meals,
    });
    const c = mountView({
      getApiConfig: vi.fn().mockResolvedValue({ base_url: 'x', api_key: 'x', model: 'x' }),
      getRecommendation,
    });
    await flush(30);

    const breakfast = c.querySelector('.meal-accordion-item[data-slot="breakfast"]');
    const lunch = c.querySelector('.meal-accordion-item[data-slot="lunch"]');
    const dinner = c.querySelector('.meal-accordion-item[data-slot="dinner"]');
    expect(breakfast).toBeTruthy();
    expect(lunch).toBeTruthy();
    expect(dinner).toBeTruthy();
    // 三餐默认全部收起
    expect(breakfast.hasAttribute('open')).toBe(false);
    expect(lunch.hasAttribute('open')).toBe(false);
    expect(dinner.hasAttribute('open')).toBe(false);
  });

  it('多道菜的收藏按钮分别可独立点击收藏', async () => {
    const today = getTodayKey();
    const meals = {
      breakfast: { dishes: [ { recipe_id: null, from_library: false, recipe: makeMealRecipe('燕麦牛奶') } ] },
      lunch: { dishes: [
        { recipe_id: null, from_library: false, recipe: makeMealRecipe('番茄炒蛋') },
        { recipe_id: null, from_library: false, recipe: makeMealRecipe('清炒菠菜') },
        { recipe_id: null, from_library: false, recipe: makeMealRecipe('紫菜蛋汤') },
      ] },
      dinner: { dishes: [
        { recipe_id: null, from_library: false, recipe: makeMealRecipe('红烧豆腐') },
        { recipe_id: null, from_library: false, recipe: makeMealRecipe('小米粥') },
        { recipe_id: null, from_library: false, recipe: makeMealRecipe('凉拌黄瓜') },
      ] },
    };
    await saveRecommendation(today, { generated_at: Date.now(), nutrition_note: '', meals });

    let idSeq = 100;
    const createRecipe = vi.fn().mockImplementation((r) => Promise.resolve({ ...r, id: ++idSeq }));
    const c = mountView({
      getApiConfig: vi.fn().mockResolvedValue({ base_url: 'x', api_key: 'x', model: 'x' }),
      getRecommendation,
      createRecipe,
    });
    await flush(30);

    // 午餐3道菜各有独立收藏按钮
    const btn0 = c.querySelector('#save-dish-lunch-0');
    const btn1 = c.querySelector('#save-dish-lunch-1');
    const btn2 = c.querySelector('#save-dish-lunch-2');
    expect(btn0).toBeTruthy();
    expect(btn1).toBeTruthy();
    expect(btn2).toBeTruthy();
    expect(btn0.disabled).toBe(false);
    expect(btn1.disabled).toBe(false);
    expect(btn2.disabled).toBe(false);

    // 分别点击收藏
    btn0.click();
    await flush(10);
    btn1.click();
    await flush(10);
    btn2.click();
    await flush(30);

    expect(createRecipe).toHaveBeenCalledTimes(3);
    const names = createRecipe.mock.calls.map((call) => call[0].name);
    expect(names).toEqual(['番茄炒蛋', '清炒菠菜', '紫菜蛋汤']);
    // 三个按钮文案都变成已收藏
    expect(btn0.textContent).toBe('已收藏 ✓');
    expect(btn1.textContent).toBe('已收藏 ✓');
    expect(btn2.textContent).toBe('已收藏 ✓');
  });
});

// =============== 集成：app.js 导航 ===============
describe('今日推荐 - app 导航集成', () => {
  it('mountApp 下拉菜单里包含「今日推荐」选项', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    mountApp(root);
    // 打开下拉
    root.querySelector('#nav-toggle').click();
    const items = root.querySelectorAll('.nav-menu-item');
    const labels = Array.from(items).map((b) => b.textContent.replace(/\s+/g, ''));
    expect(labels).toEqual(expect.arrayContaining([expect.stringContaining('今日推荐')]));
    const recipes = Array.from(items).find((b) => b.dataset.view === 'recipes');
    const recommend = Array.from(items).find((b) => b.dataset.view === 'recommend');
    const settings = Array.from(items).find((b) => b.dataset.view === 'settings');
    expect(recipes).toBeTruthy();
    expect(recommend).toBeTruthy();
    expect(settings).toBeTruthy();
  });

  it('点击「今日推荐」菜单会切到 recommend 视图（标题变更）', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    mountApp(root);
    // 默认是菜谱页
    const toggle = root.querySelector('#nav-toggle');
    toggle.click();
    const recBtn = root.querySelector('.nav-menu-item[data-view="recommend"]');
    recBtn.click();
    const label = root.querySelector('.nav-toggle-label').textContent;
    expect(label).toBe('今日推荐');
    // 标题里出现「今日推荐」
    expect(root.querySelector('.section-title').textContent).toContain('今日推荐');
  });

  it('首次点击今日推荐（无API配置）→ 自动弹框提示需配置API', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    mountApp(root);
    // 确保无API配置（beforeEach 已 clearAllSettings）
    const toggle = root.querySelector('#nav-toggle');
    toggle.click();
    const recBtn = root.querySelector('.nav-menu-item[data-view="recommend"]');
    recBtn.click();
    // init 是 async，必须等待 flush 让 await _getApiConfig() 完成
    await flush(30);
    // 弹框出现在 body 上
    const overlay = document.querySelector('.recommend-modal-overlay');
    expect(overlay).toBeTruthy();
    expect(overlay.textContent).toContain('需要配置 API');
    expect(overlay.querySelector('#recommend-modal-confirm')).toBeTruthy();
  });

  it('弹框点确认 → 自动跳转到设置页', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    mountApp(root);
    // 切到今日推荐
    root.querySelector('#nav-toggle').click();
    root.querySelector('.nav-menu-item[data-view="recommend"]').click();
    await flush(30);
    const overlay = document.querySelector('.recommend-modal-overlay');
    expect(overlay).toBeTruthy();
    // 点确认
    overlay.querySelector('#recommend-modal-confirm').click();
    await flush(10);
    // 弹框关闭
    expect(document.querySelector('.recommend-modal-overlay')).toBeNull();
    // 已跳转到设置页（标题变更 + 内容包含设置表单）
    expect(root.querySelector('.nav-toggle-label').textContent).toBe('设置');
    expect(root.querySelector('.section-title').textContent).toContain('设置');
  });

  it('首次点击今日推荐（有API配置 + 无缓存）→ 自动进入AI生成流程', async () => {
    // 先写入 API 配置到真实 DB
    await saveApiConfig({ base_url: 'https://x/v1', api_key: 'sk-test', model: 'm1' });
    const root = document.createElement('div');
    document.body.appendChild(root);
    mountApp(root);
    // 切到今日推荐
    root.querySelector('#nav-toggle').click();
    root.querySelector('.nav-menu-item[data-view="recommend"]').click();
    // 等待 init 完成（读配置 + 读缓存 + 进入 startGenerate）
    await flush(50);
    // 没有弹框（因为有配置）
    expect(document.querySelector('.recommend-modal-overlay')).toBeNull();
    // 没有显示"需要配置API"的空状态
    expect(root.textContent).not.toContain('需要配置');
    // startGenerate 被调用了：页面出现生成界面（stream-progress）或生成失败错误
    // jsdom 中真实 streamChat 会失败，所以会走到 catch → showError
    const hasStreamUI = root.querySelector('#stream-progress') || root.querySelector('#stream-reasoning');
    const hasError = root.querySelector('.status-error');
    expect(hasStreamUI || hasError).toBeTruthy();
  });
});

// =============== 新增：用户偏好注入 prompt ===============
describe('今日推荐 - 用户偏好注入 prompt', () => {
  const CONFIG = { base_url: 'https://x/v1', api_key: 'sk-1', model: 'm1' };

  function makeRecipe(name, extra = {}) {
    return {
      name,
      intro: '',
      ingredients: [{ name: '鸡蛋', amount: '2个' }],
      steps: ['第一步怎么做'],
      tips: '',
      ...extra,
    };
  }
  function fullRecommendation() {
    return {
      nutrition_note: '今天有荤有素',
      meals: {
        breakfast: { dishes: [{ recipe_id: null, from_library: false, recipe: makeRecipe('燕麦牛奶') }] },
        lunch: { dishes: [
          { recipe_id: null, from_library: false, recipe: makeRecipe('A') },
          { recipe_id: null, from_library: false, recipe: makeRecipe('B') },
          { recipe_id: null, from_library: false, recipe: makeRecipe('C') },
        ] },
        dinner: { dishes: [
          { recipe_id: null, from_library: false, recipe: makeRecipe('D') },
          { recipe_id: null, from_library: false, recipe: makeRecipe('E') },
          { recipe_id: null, from_library: false, recipe: makeRecipe('F') },
        ] },
      },
    };
  }

  it('generateDailyRecommendation 会并行调用 getAllRecipes 和 getAllPreferences', async () => {
    const getAllRecipes = vi.fn().mockResolvedValue([]);
    const getAllPreferences = vi.fn().mockResolvedValue([]);
    const streamChat = vi.fn().mockResolvedValue({
      content: JSON.stringify(fullRecommendation()),
      reasoning: '',
    });
    await generateDailyRecommendation({
      config: CONFIG,
      getAllRecipes,
      getAllPreferences,
      streamChat,
    });
    expect(getAllRecipes).toHaveBeenCalledTimes(1);
    expect(getAllPreferences).toHaveBeenCalledTimes(1);
  });

  it('3 条偏好：user message 里包含偏好块标题、编号列表、"优先级最高"和"冲突时压倒营养均衡"', async () => {
    const prefRecords = [
      { id: 'p1', value: '不吃辣', created_at: 1 },
      { id: 'p2', value: '不要油炸', created_at: 2 },
      { id: 'p3', value: '爱吃高油高糖', created_at: 3 },
    ];
    const streamChat = vi.fn().mockResolvedValue({
      content: JSON.stringify(fullRecommendation()),
      reasoning: '',
    });
    await generateDailyRecommendation({
      config: CONFIG,
      getAllRecipes: vi.fn().mockResolvedValue([]),
      getAllPreferences: vi.fn().mockResolvedValue(prefRecords),
      streamChat,
    });
    expect(streamChat).toHaveBeenCalledTimes(1);
    const messages = streamChat.mock.calls[0][1];
    const userText = typeof messages[1].content === 'string' ? messages[1].content : '';

    // 偏好块标题与优先级声明
    expect(userText).toContain('用户个人偏好');
    expect(userText).toContain('优先级最高');
    expect(userText).toContain('压倒营养均衡');

    // 三条偏好逐条列入，编号 1/2/3
    expect(userText).toMatch(/1\.\s*不吃辣/);
    expect(userText).toMatch(/2\.\s*不要油炸/);
    expect(userText).toMatch(/3\.\s*爱吃高油高糖/);
  });

  it('偏好为空（空数组）：user message 写"暂未设置任何偏好标签"并要求默认营养均衡', async () => {
    const streamChat = vi.fn().mockResolvedValue({
      content: JSON.stringify(fullRecommendation()),
      reasoning: '',
    });
    await generateDailyRecommendation({
      config: CONFIG,
      getAllRecipes: vi.fn().mockResolvedValue([]),
      getAllPreferences: vi.fn().mockResolvedValue([]),
      streamChat,
    });
    const userText = streamChat.mock.calls[0][1][1].content;
    expect(userText).toContain('用户暂未设置任何偏好标签');
    expect(userText).toContain('营养均衡原则');
  });

  it('偏好数组里含空字符串/非字符串 → filter 过滤掉，只保留纯文字', async () => {
    // 模拟 getAllPreferences 返回一些脏数据（value 为空或非字符串，实际 db 层应已过滤，但生成层做了二次兜底）
    const prefRecords = [
      { id: 'p1', value: '', created_at: 1 },           // 空 → 应被过滤
      { id: 'p2', value: '少盐少油', created_at: 2 },   // 正常
      { id: 'p3', value: null, created_at: 3 },         // null → 过滤
      { id: 'p4', value: undefined, created_at: 4 },    // undefined → 过滤
      { id: 'p5', value: '   ', created_at: 5 },        // 全空格 → trim 后为空，会被过滤
      { id: 'p6', value: ' 不要香菜  ', created_at: 6 }, // trim → "不要香菜"
    ];
    const streamChat = vi.fn().mockResolvedValue({
      content: JSON.stringify(fullRecommendation()),
      reasoning: '',
    });
    await generateDailyRecommendation({
      config: CONFIG,
      getAllRecipes: vi.fn().mockResolvedValue([]),
      getAllPreferences: vi.fn().mockResolvedValue(prefRecords),
      streamChat,
    });
    const userText = streamChat.mock.calls[0][1][1].content;

    // 只有两条有效偏好
    expect(userText).toMatch(/1\.\s*少盐少油/);
    expect(userText).toMatch(/2\.\s*不要香菜/);
    // 脏值不应出现
    expect(userText).not.toContain('p1');
    expect(userText).not.toMatch(/null/);
  });

  it('getAllPreferences 抛错时降级为空数组，不影响推荐流程', async () => {
    const streamChat = vi.fn().mockResolvedValue({
      content: JSON.stringify(fullRecommendation()),
      reasoning: '',
    });
    // 让 getAllPreferences 抛错
    const getPrefs = vi.fn().mockRejectedValue(new Error('preferences store 不存在'));
    // 不能抛错出来，必须正常返回推荐
    const result = await generateDailyRecommendation({
      config: CONFIG,
      getAllRecipes: vi.fn().mockResolvedValue([]),
      getAllPreferences: getPrefs,
      streamChat,
    });
    expect(getPrefs).toHaveBeenCalledTimes(1);
    expect(result.meals.breakfast.dishes[0].recipe.name).toBe('燕麦牛奶');
    // 用户消息里是"暂未设置任何偏好"（因为降级为空数组）
    const userText = streamChat.mock.calls[0][1][1].content;
    expect(userText).toContain('暂未设置任何偏好标签');
  });

  it('system prompt 中明确声明：用户偏好无条件压倒第 5 条营养均衡规则', () => {
    // 通过静态导入的 SYSTEM_PROMPT 不好直接拿到（是模块内部变量），
    // 改用实际调用后看 streamChat 收到的 messages[0].content 来断言
    const streamChat = vi.fn().mockResolvedValue({
      content: JSON.stringify(fullRecommendation()),
      reasoning: '',
    });
    return generateDailyRecommendation({
      config: CONFIG,
      getAllRecipes: vi.fn().mockResolvedValue([]),
      getAllPreferences: vi.fn().mockResolvedValue([]),
      streamChat,
    }).then(() => {
      const sysText = streamChat.mock.calls[0][1][0].content;
      // 第 9 条的关键字
      expect(sysText).toContain('用户个人偏好');
      expect(sysText).toContain('最高优先级');
      expect(sysText).toContain('无条件压倒所有其他规则');
      expect(sysText).toContain('100% 服从用户偏好');
      // 示例：爱吃高油高糖 → 允许偏油偏甜
      expect(sysText).toContain('爱吃高油高糖');
      // 示例：在 nutrition_note 里向用户说明
      expect(sysText).toContain('nutrition_note');
    });
  });
});
