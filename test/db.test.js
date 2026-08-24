import { describe, it, expect, beforeEach } from 'vitest';
import {
  _resetDbForTesting,
  createRecipe,
  getAllRecipes,
  getRecipe,
  updateRecipe,
  deleteRecipe,
  clearAllRecipes,
  getApiConfig,
  saveApiConfig,
  clearAllSettings,
  // 新增：偏好
  addPreference,
  getAllPreferences,
  removePreference,
  clearAllPreferences,
  // 新增：分组清除 / 计数
  clearDataExceptRecipes,
  clearRecipeDataOnly,
  getDataCounts,
  // 新增：主题
  getTheme,
  saveTheme,
  THEME_DARK,
  THEME_LIGHT,
  DEFAULT_THEME,
  // 推荐缓存（用于分组清除验证）
  saveRecommendation,
  getRecommendation,
  getTodayKey,
  // 新增：冰箱食材
  addFridgeIngredient,
  getAllFridgeIngredients,
  getFridgeIngredient,
  updateFridgeIngredient,
  deleteFridgeIngredient,
  clearAllFridgeIngredients,
} from '../src/db.js';

beforeEach(async () => {
  _resetDbForTesting();
  // fake-indexeddb 每个测试都是全新内存库，但保险起见显式清空
  await clearAllRecipes().catch(() => {});
  await clearAllSettings().catch(() => {});
  await clearAllPreferences().catch(() => {});
  await clearAllFridgeIngredients().catch(() => {});
});

describe('存储层 - 菜谱 CRUD', () => {
  it('新增菜谱返回自增 id 与时间戳', async () => {
    const r = await createRecipe({
      name: '番茄炒蛋',
      intro: '家常菜',
      ingredients: [{ name: '番茄', amount: '2个' }],
      steps: ['切块', '炒'],
      tips: '',
    });
    expect(r.id).toBeTypeOf('number');
    expect(r.id).toBeGreaterThan(0);
    expect(r.created_at).toBeTypeOf('number');
    expect(r.updated_at).toBeTypeOf('number');
  });

  it('多条菜谱 id 自增', async () => {
    const a = await createRecipe({ name: 'A' });
    const b = await createRecipe({ name: 'B' });
    expect(b.id).toBeGreaterThan(a.id);
  });

  it('getAllRecipes 按 created_at 倒序', async () => {
    await createRecipe({ name: '旧', created_at: 1000 });
    await createRecipe({ name: '新', created_at: 5000 });
    const all = await getAllRecipes();
    expect(all.map((r) => r.name)).toEqual(['新', '旧']);
  });

  it('getRecipe 命中返回对象，未命中返回 null', async () => {
    const r = await createRecipe({ name: 'X' });
    expect((await getRecipe(r.id)).name).toBe('X');
    expect(await getRecipe(99999)).toBeNull();
  });

  it('updateRecipe 更新字段并刷新 updated_at，保留 created_at', async () => {
    const r = await createRecipe({ name: 'A', created_at: 1000 });
    const before = r.updated_at;
    await new Promise((res) => setTimeout(res, 5));
    const updated = await updateRecipe({ ...r, name: 'A2' });
    expect(updated.name).toBe('A2');
    expect(updated.created_at).toBe(1000);
    expect(updated.updated_at).toBeGreaterThan(before);
  });

  it('updateRecipe 缺少 id 抛错', async () => {
    await expect(updateRecipe({ name: 'X' })).rejects.toThrow(/缺少 id/);
  });

  it('updateRecipe 目标不存在抛错', async () => {
    await expect(updateRecipe({ id: 999, name: 'X' })).rejects.toThrow(/不存在/);
  });

  it('deleteRecipe 存在则删除并返回 true', async () => {
    const r = await createRecipe({ name: 'A' });
    expect(await deleteRecipe(r.id)).toBe(true);
    expect(await getRecipe(r.id)).toBeNull();
  });

  it('deleteRecipe 不存在返回 false', async () => {
    expect(await deleteRecipe(999)).toBe(false);
  });

  it('clearAllRecipes 清空全部', async () => {
    await createRecipe({ name: 'A' });
    await createRecipe({ name: 'B' });
    await clearAllRecipes();
    expect(await getAllRecipes()).toEqual([]);
  });
});

describe('存储层 - 设置', () => {
  it('未配置时返回默认空配置', async () => {
    const cfg = await getApiConfig();
    expect(cfg).toEqual({ base_url: '', api_key: '', model: '' });
  });

  it('保存后能读回', async () => {
    await saveApiConfig({
      base_url: 'https://api.example.com/v1',
      api_key: 'sk-xxx',
      model: 'gpt-4o',
    });
    const cfg = await getApiConfig();
    expect(cfg.base_url).toBe('https://api.example.com/v1');
    expect(cfg.api_key).toBe('sk-xxx');
    expect(cfg.model).toBe('gpt-4o');
  });

  it('二次保存为覆盖式', async () => {
    await saveApiConfig({ base_url: 'a', api_key: 'k1', model: 'm1' });
    await saveApiConfig({ base_url: 'b', api_key: 'k2', model: 'm2' });
    const cfg = await getApiConfig();
    expect(cfg).toEqual({ base_url: 'b', api_key: 'k2', model: 'm2' });
  });

  it('部分字段保存时与默认值合并', async () => {
    await saveApiConfig({ base_url: 'only-base', api_key: '', model: '' });
    const cfg = await getApiConfig();
    expect(cfg.base_url).toBe('only-base');
    expect(cfg).toHaveProperty('api_key');
    expect(cfg).toHaveProperty('model');
  });

  it('clearAllSettings 清空后回到默认', async () => {
    await saveApiConfig({ base_url: 'x', api_key: 'y', model: 'z' });
    await clearAllSettings();
    expect(await getApiConfig()).toEqual({ base_url: '', api_key: '', model: '' });
  });
});

// ============ 新增：用户饮食偏好 ============
describe('存储层 - 偏好标签 CRUD', () => {
  it('addPreference 空字符串/全空格 → 抛错', async () => {
    await expect(addPreference('')).rejects.toThrow(/不能为空/);
    await expect(addPreference('   ')).rejects.toThrow(/不能为空/);
    await expect(addPreference(null)).rejects.toThrow(/不能为空/);
    await expect(addPreference(undefined)).rejects.toThrow(/不能为空/);
  });

  it('addPreference 返回带 id/value/created_at 的对象，value 已 trim', async () => {
    const p = await addPreference('  不吃辣  ');
    expect(typeof p.id).toBe('string');
    expect(p.id.startsWith('p_')).toBe(true); // uid 前缀
    expect(p.value).toBe('不吃辣'); // trim 生效
    expect(typeof p.created_at).toBe('number');
    expect(p.created_at).toBeGreaterThan(0);
  });

  it('getAllPreferences 初始为空数组', async () => {
    const list = await getAllPreferences();
    expect(Array.isArray(list)).toBe(true);
    expect(list).toEqual([]);
  });

  it('getAllPreferences 按 created_at 升序（先加的在前）', async () => {
    // 用固定 created_at 保证顺序
    const a = await addPreference('先加');
    await new Promise((res) => setTimeout(res, 2));
    const b = await addPreference('后加');
    const list = await getAllPreferences();
    expect(list.map((p) => p.value)).toEqual(['先加', '后加']);
    // 值正确
    expect(list[0].id).toBe(a.id);
    expect(list[1].id).toBe(b.id);
  });

  it('removePreference 存在则删除返回 true，不存在返回 false', async () => {
    const p = await addPreference('要删除的');
    expect(await getAllPreferences()).toHaveLength(1);
    expect(await removePreference(p.id)).toBe(true);
    expect(await getAllPreferences()).toHaveLength(0);
    // 再删一次 → false
    expect(await removePreference(p.id)).toBe(false);
    // 假 id → false
    expect(await removePreference('')).toBe(false);
    expect(await removePreference(null)).toBe(false);
  });

  it('clearAllPreferences 清空全部', async () => {
    await addPreference('A');
    await addPreference('B');
    await addPreference('C');
    expect(await getAllPreferences()).toHaveLength(3);
    await clearAllPreferences();
    expect(await getAllPreferences()).toEqual([]);
  });
});

// ============ 新增：主题持久化 ============
describe('存储层 - 主题', () => {
  it('默认未保存主题时返回 DEFAULT_THEME (dark)', async () => {
    expect(await getTheme()).toBe(DEFAULT_THEME);
    expect(DEFAULT_THEME).toBe(THEME_DARK);
  });

  it('saveTheme(THEME_LIGHT) → getTheme 返回 light', async () => {
    await saveTheme(THEME_LIGHT);
    expect(await getTheme()).toBe(THEME_LIGHT);
  });

  it('saveTheme(THEME_DARK) → getTheme 返回 dark', async () => {
    await saveTheme(THEME_LIGHT);
    await saveTheme(THEME_DARK);
    expect(await getTheme()).toBe(THEME_DARK);
  });

  it('saveTheme 非法值抛错', async () => {
    await expect(saveTheme('banana')).rejects.toThrow(/不支持的主题/);
    await expect(saveTheme('')).rejects.toThrow(/不支持的主题/);
    await expect(saveTheme(null)).rejects.toThrow(/不支持的主题/);
  });

  it('clearAllSettings 后 getTheme 回落到 DEFAULT_THEME', async () => {
    await saveTheme(THEME_LIGHT);
    expect(await getTheme()).toBe(THEME_LIGHT);
    await clearAllSettings();
    expect(await getTheme()).toBe(DEFAULT_THEME);
  });
});

// ============ 新增：冰箱食材 ============
describe('存储层 - 冰箱食材 CRUD', () => {
  it('初始为空数组', async () => {
    expect(await getAllFridgeIngredients()).toEqual([]);
  });

  it('addFridgeIngredient 返回自增 id 与 added_at，字段已 trim', async () => {
    const r = await addFridgeIngredient({ name: '  排骨  ', amount: ' 2 ', unit: ' 斤 ' });
    expect(r.id).toBeTypeOf('number');
    expect(r.id).toBeGreaterThan(0);
    expect(r.name).toBe('排骨');
    expect(r.amount).toBe('2');
    expect(r.unit).toBe('斤');
    expect(r.added_at).toBeTypeOf('number');
    expect(r.added_at).toBeGreaterThan(0);
  });

  it('食材名为空/全空格 → 抛错', async () => {
    await expect(addFridgeIngredient({ name: '' })).rejects.toThrow(/不能为空/);
    await expect(addFridgeIngredient({ name: '   ' })).rejects.toThrow(/不能为空/);
    await expect(addFridgeIngredient({})).rejects.toThrow(/不能为空/);
    await expect(addFridgeIngredient(null)).rejects.toThrow(/不能为空/);
  });

  it('多条食材 id 自增；getAllFridgeIngredients 按 added_at 倒序（后加的在前）', async () => {
    const a = await addFridgeIngredient({ name: 'A' });
    await new Promise((res) => setTimeout(res, 3));
    const b = await addFridgeIngredient({ name: 'B' });
    expect(b.id).toBeGreaterThan(a.id);
    const all = await getAllFridgeIngredients();
    expect(all.map((i) => i.name)).toEqual(['B', 'A']);
  });

  it('getFridgeIngredient 命中返回对象，未命中返回 null', async () => {
    const r = await addFridgeIngredient({ name: '白菜' });
    expect((await getFridgeIngredient(r.id)).name).toBe('白菜');
    expect(await getFridgeIngredient(99999)).toBeNull();
  });

  it('updateFridgeIngredient 更新字段，保留 id/added_at', async () => {
    const r = await addFridgeIngredient({ name: '土豆', amount: '1', unit: '斤' });
    const updated = await updateFridgeIngredient({ id: r.id, name: '土豆', amount: '2', unit: '个' });
    expect(updated.name).toBe('土豆');
    expect(updated.amount).toBe('2');
    expect(updated.unit).toBe('个');
    expect(updated.id).toBe(r.id);
    expect(updated.added_at).toBe(r.added_at);
    expect((await getFridgeIngredient(r.id)).amount).toBe('2');
  });

  it('updateFridgeIngredient 缺少 id 抛错；目标不存在抛错', async () => {
    await expect(updateFridgeIngredient({ name: 'X' })).rejects.toThrow(/缺少 id/);
    await expect(updateFridgeIngredient({ id: 999, name: 'X' })).rejects.toThrow(/不存在/);
  });

  it('deleteFridgeIngredient 存在则删除返回 true，不存在返回 false', async () => {
    const r = await addFridgeIngredient({ name: '番茄' });
    expect(await deleteFridgeIngredient(r.id)).toBe(true);
    expect(await getFridgeIngredient(r.id)).toBeNull();
    expect(await deleteFridgeIngredient(r.id)).toBe(false);
    expect(await deleteFridgeIngredient(undefined)).toBe(false);
    expect(await deleteFridgeIngredient(null)).toBe(false);
  });

  it('clearAllFridgeIngredients 清空全部', async () => {
    await addFridgeIngredient({ name: 'A' });
    await addFridgeIngredient({ name: 'B' });
    expect(await getAllFridgeIngredients()).toHaveLength(2);
    await clearAllFridgeIngredients();
    expect(await getAllFridgeIngredients()).toEqual([]);
  });

  it('冰箱数据独立于菜谱库（互不影响）', async () => {
    await createRecipe({ name: '菜谱菜' });
    await addFridgeIngredient({ name: '冰箱菜' });
    const recipes = await getAllRecipes();
    const fridge = await getAllFridgeIngredients();
    expect(recipes).toHaveLength(1);
    expect(recipes[0].name).toBe('菜谱菜');
    expect(fridge).toHaveLength(1);
    expect(fridge[0].name).toBe('冰箱菜');
  });
});

// ============ 新增：分组清除 + 数据计数 ============
describe('存储层 - 分组清除与计数', () => {
  /** 写入一些基础数据，用于分组清除测试 */
  async function seedAll() {
    // 菜谱 2 条
    const r1 = await createRecipe({ name: '菜谱1' });
    const r2 = await createRecipe({ name: '菜谱2' });
    // API 配置
    await saveApiConfig({ base_url: 'https://x/v1', api_key: 'sk-x', model: 'm-x' });
    // 偏好 2 条
    const p1 = await addPreference('不吃辣');
    const p2 = await addPreference('爱吃甜');
    // 推荐缓存 2 天
    const today = getTodayKey();
    const tomorrow = getTodayKey(new Date(Date.now() + 86400000));
    const mealStub = {
      breakfast: { dishes: [] },
      lunch: { dishes: [] },
      dinner: { dishes: [] },
    };
    await saveRecommendation(today, { generated_at: 1, nutrition_note: 'A', meals: mealStub });
    await saveRecommendation(tomorrow, { generated_at: 2, nutrition_note: 'B', meals: mealStub });
    return { r1, r2, p1, p2, today, tomorrow };
  }

  it('getDataCounts 初始状态：全部为 0 / 未配置', async () => {
    const c = await getDataCounts();
    expect(c.recipes).toBe(0);
    expect(c.preferences).toBe(0);
    expect(c.recommendations).toBe(0);
    expect(c.hasApiConfig).toBe(false);
  });

  it('getDataCounts 写入后计数正确，hasApiConfig 判断合理', async () => {
    await seedAll();
    const c = await getDataCounts();
    expect(c.recipes).toBe(2);
    expect(c.preferences).toBe(2);
    expect(c.recommendations).toBe(2);
    expect(c.hasApiConfig).toBe(true);
  });

  it('clearDataExceptRecipes：清除 API/偏好/推荐缓存，菜谱保留', async () => {
    const { r1, r2, today, tomorrow } = await seedAll();
    // 执行清除
    await clearDataExceptRecipes();

    // 菜谱应该还在
    const recipesAfter = await getAllRecipes();
    expect(recipesAfter.map((r) => r.id).sort()).toEqual([r1.id, r2.id].sort());

    // 其他应该清空
    expect((await getApiConfig())).toEqual({ base_url: '', api_key: '', model: '' });
    expect(await getAllPreferences()).toEqual([]);
    expect(await getRecommendation(today)).toBeNull();
    expect(await getRecommendation(tomorrow)).toBeNull();

    // 计数验证
    const c = await getDataCounts();
    expect(c.recipes).toBe(2); // 菜谱不动
    expect(c.preferences).toBe(0);
    expect(c.recommendations).toBe(0);
    expect(c.hasApiConfig).toBe(false);
  });

  it('clearRecipeDataOnly：只清除菜谱，API/偏好/推荐缓存都保留', async () => {
    const { p1, p2, today, tomorrow } = await seedAll();
    // 执行清除
    await clearRecipeDataOnly();

    // 菜谱应该清空
    expect(await getAllRecipes()).toEqual([]);

    // API 配置保留
    const cfg = await getApiConfig();
    expect(cfg.base_url).toBe('https://x/v1');
    expect(cfg.api_key).toBe('sk-x');
    expect(cfg.model).toBe('m-x');

    // 偏好保留
    const prefs = await getAllPreferences();
    expect(prefs.map((p) => p.id).sort()).toEqual([p1.id, p2.id].sort());

    // 推荐缓存保留
    expect(await getRecommendation(today)).not.toBeNull();
    expect(await getRecommendation(tomorrow)).not.toBeNull();

    // 计数验证
    const c = await getDataCounts();
    expect(c.recipes).toBe(0);
    expect(c.preferences).toBe(2);
    expect(c.recommendations).toBe(2);
    expect(c.hasApiConfig).toBe(true);
  });

  it('getDataCounts: hasApiConfig 仅其中一个字段有值也算 true', async () => {
    // 只有 base_url
    await saveApiConfig({ base_url: 'https://only-base', api_key: '', model: '' });
    expect((await getDataCounts()).hasApiConfig).toBe(true);
    await clearAllSettings();

    // 只有 api_key
    await saveApiConfig({ base_url: '', api_key: 'sk-only', model: '' });
    expect((await getDataCounts()).hasApiConfig).toBe(true);
    await clearAllSettings();

    // 只有 model
    await saveApiConfig({ base_url: '', api_key: '', model: 'only-model' });
    expect((await getDataCounts()).hasApiConfig).toBe(true);
    await clearAllSettings();

    // 全空 = 未配置
    await saveApiConfig({ base_url: '', api_key: '', model: '' });
    expect((await getDataCounts()).hasApiConfig).toBe(false);
  });
});
