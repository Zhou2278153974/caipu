// 本地存储层：基于 IndexedDB 的封装
// 四个 store：
//   - recipes：菜谱（自增主键 id）
//   - settings：键值对（keyPath = key），其中 key='api_config' 存 API 配置
//   - recommendations：按日期存今日推荐结果（keyPath = date，YYYY-MM-DD）
//   - preferences：用户饮食偏好标签（keyPath = id，uuid；value = 标签文字）
//
// 设计原则：
//   - 所有方法返回 Promise
//   - 不在存储层做业务校验，由调用方保证数据结构
//   - DB 单例，首次访问时自动打开

const DB_NAME = 'personal-recipe-app';
const DB_VERSION = 3;
const RECIPES_STORE = 'recipes';
const SETTINGS_STORE = 'settings';
const RECOMMENDATIONS_STORE = 'recommendations';
const PREFERENCES_STORE = 'preferences';
const SETTINGS_KEY_API_CONFIG = 'api_config';
const SETTINGS_KEY_THEME = 'theme';
export const THEME_DARK = 'dark';
export const THEME_LIGHT = 'light';
export const DEFAULT_THEME = THEME_DARK;

let dbPromise = null;

/** 打开/获取 DB 单例 */
export function getDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(RECIPES_STORE)) {
          db.createObjectStore(RECIPES_STORE, {
            keyPath: 'id',
            autoIncrement: true,
          });
        }
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(RECOMMENDATIONS_STORE)) {
          // 按日期存：keyPath = date (YYYY-MM-DD)
          db.createObjectStore(RECOMMENDATIONS_STORE, { keyPath: 'date' });
        }
        if (!db.objectStoreNames.contains(PREFERENCES_STORE)) {
          // 用户偏好标签：id（字符串uuid）、value（用户输入的偏好文字）、created_at
          db.createObjectStore(PREFERENCES_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

/** 仅供测试用：重置单例（不关闭真实连接，仅清缓存） */
export function _resetDbForTesting() {
  dbPromise = null;
}

function tx(db, store, mode) {
  return db.transaction(store, mode).objectStore(store);
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ============ 菜谱 CRUD ============

/** 新增菜谱，返回带 id 的菜谱对象 */
export async function createRecipe(recipe) {
  const db = await getDb();
  const now = Date.now();
  const record = {
    ...recipe,
    created_at: recipe.created_at ?? now,
    updated_at: recipe.updated_at ?? now,
  };
  const id = await reqToPromise(tx(db, RECIPES_STORE, 'readwrite').add(record));
  return { ...record, id };
}

/** 获取全部菜谱，按 created_at 倒序（新→旧） */
export async function getAllRecipes() {
  const db = await getDb();
  const all = await reqToPromise(tx(db, RECIPES_STORE, 'readonly').getAll());
  return all.sort((a, b) => b.created_at - a.created_at);
}

/** 按 id 获取单条菜谱，未找到返回 null */
export async function getRecipe(id) {
  const db = await getDb();
  return (await reqToPromise(tx(db, RECIPES_STORE, 'readonly').get(id))) ?? null;
}

/** 更新菜谱（需带 id），返回更新后的对象 */
export async function updateRecipe(recipe) {
  if (!recipe.id) throw new Error('updateRecipe: 缺少 id');
  const db = await getDb();
  const existing = await getRecipe(recipe.id);
  if (!existing) throw new Error(`updateRecipe: 菜谱 id=${recipe.id} 不存在`);
  const updated = {
    ...existing,
    ...recipe,
    id: existing.id,
    created_at: existing.created_at,
    updated_at: Date.now(),
  };
  await reqToPromise(tx(db, RECIPES_STORE, 'readwrite').put(updated));
  return updated;
}

/** 按 id 删除菜谱，返回是否删除成功 */
export async function deleteRecipe(id) {
  const db = await getDb();
  const existing = await getRecipe(id);
  if (!existing) return false;
  await reqToPromise(tx(db, RECIPES_STORE, 'readwrite').delete(id));
  return true;
}

/** 清空所有菜谱（测试/管理用） */
export async function clearAllRecipes() {
  const db = await getDb();
  await reqToPromise(tx(db, RECIPES_STORE, 'readwrite').clear());
}

// ============ 设置 ============

const DEFAULT_API_CONFIG = {
  base_url: '',
  api_key: '',
  model: '',
};

/** 读取 API 配置，未配置时返回默认空对象 */
export async function getApiConfig() {
  const db = await getDb();
  const record = await reqToPromise(
    tx(db, SETTINGS_STORE, 'readonly').get(SETTINGS_KEY_API_CONFIG)
  );
  if (!record) return { ...DEFAULT_API_CONFIG };
  return { ...DEFAULT_API_CONFIG, ...record.value };
}

/** 保存 API 配置（覆盖式） */
export async function saveApiConfig(config) {
  const db = await getDb();
  const record = { key: SETTINGS_KEY_API_CONFIG, value: { ...config } };
  await reqToPromise(tx(db, SETTINGS_STORE, 'readwrite').put(record));
  return record.value;
}

/** 读取主题，未配置时返回默认深色主题 */
export async function getTheme() {
  const db = await getDb();
  const record = await reqToPromise(
    tx(db, SETTINGS_STORE, 'readonly').get(SETTINGS_KEY_THEME)
  );
  const val = record?.value;
  if (val === THEME_DARK || val === THEME_LIGHT) return val;
  return DEFAULT_THEME;
}

/** 保存主题，非法值抛出错误 */
export async function saveTheme(theme) {
  if (theme !== THEME_DARK && theme !== THEME_LIGHT) {
    throw new Error(`不支持的主题：${String(theme)}`);
  }
  const db = await getDb();
  await reqToPromise(tx(db, SETTINGS_STORE, 'readwrite').put({ key: SETTINGS_KEY_THEME, value: theme }));
  return theme;
}

/** 清空所有设置 */
export async function clearAllSettings() {
  const db = await getDb();
  await reqToPromise(tx(db, SETTINGS_STORE, 'readwrite').clear());
}

// ============ 今日推荐 ============

/** 获取今日日期字符串（本地时区，YYYY-MM-DD） */
export function getTodayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 获取指定日期的推荐缓存
 * @param {string} dateKey 日期字符串 YYYY-MM-DD
 * @returns {Promise<object|null>}
 */
export async function getRecommendation(dateKey) {
  const db = await getDb();
  const record = await reqToPromise(
    tx(db, RECOMMENDATIONS_STORE, 'readonly').get(dateKey)
  );
  return record ?? null;
}

/**
 * 保存指定日期的推荐结果（覆盖式）
 * @param {string} dateKey
 * @param {object} data {generated_at, nutrition_note, meals: {breakfast, lunch, dinner}}
 */
export async function saveRecommendation(dateKey, data) {
  const db = await getDb();
  const record = { date: dateKey, ...data };
  await reqToPromise(tx(db, RECOMMENDATIONS_STORE, 'readwrite').put(record));
  return record;
}

/** 清空所有推荐缓存 */
export async function clearAllRecommendations() {
  const db = await getDb();
  await reqToPromise(tx(db, RECOMMENDATIONS_STORE, 'readwrite').clear());
}

// ============ 用户饮食偏好 ============

/** 生成简单唯一ID（无需严格uuid，够用即可） */
function uid() {
  return (
    'p_' +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).slice(2, 8)
  );
}

/**
 * 新增一个偏好标签
 * @param {string} value 用户输入的偏好文字（如"不吃辣"），trim后非空才能存入
 * @returns {Promise<{id:string, value:string, created_at:number}>} 保存后的偏好对象
 */
export async function addPreference(valueRaw) {
  const value = String(valueRaw || '').trim();
  if (!value) throw new Error('偏好内容不能为空');
  const db = await getDb();
  const record = { id: uid(), value, created_at: Date.now() };
  await reqToPromise(tx(db, PREFERENCES_STORE, 'readwrite').add(record));
  return record;
}

/**
 * 获取全部偏好标签，按 created_at 升序（先加的在前）
 * @returns {Promise<Array<{id:string, value:string, created_at:number}>>}
 */
export async function getAllPreferences() {
  const db = await getDb();
  const all = await reqToPromise(tx(db, PREFERENCES_STORE, 'readonly').getAll());
  return all.sort((a, b) => a.created_at - b.created_at);
}

/** 按 id 删除单个偏好，返回是否删除成功 */
export async function removePreference(id) {
  if (!id) return false;
  const db = await getDb();
  const existing = await reqToPromise(tx(db, PREFERENCES_STORE, 'readonly').get(id));
  if (!existing) return false;
  await reqToPromise(tx(db, PREFERENCES_STORE, 'readwrite').delete(id));
  return true;
}

/** 清空全部偏好 */
export async function clearAllPreferences() {
  const db = await getDb();
  await reqToPromise(tx(db, PREFERENCES_STORE, 'readwrite').clear());
}

// ============ 分组批量清除（数据管理专用） ============

/**
 * ① 清除「除我的菜谱」以外的所有数据：
 *   - settings（含 API 配置）
 *   - preferences（偏好标签）
 *   - recommendations（今日推荐缓存）
 * recipes 一条不动
 */
export async function clearDataExceptRecipes() {
  const db = await getDb();
  const stores = [SETTINGS_STORE, PREFERENCES_STORE, RECOMMENDATIONS_STORE];
  const transaction = db.transaction(stores, 'readwrite');
  await Promise.all(
    stores.map((name) => reqToPromise(transaction.objectStore(name).clear()))
  );
}

/**
 * ② 仅清除菜谱数据（recipes store），其他（API、偏好、推荐缓存）都不动
 */
export async function clearRecipeDataOnly() {
  const db = await getDb();
  await reqToPromise(tx(db, RECIPES_STORE, 'readwrite').clear());
}

/**
 * 获取各模块当前数据量，供数据管理页展示文案用
 * @returns {Promise<{recipes:number, preferences:number, recommendations:number, hasApiConfig:boolean}>}
 */
export async function getDataCounts() {
  const db = await getDb();
  const stores = [RECIPES_STORE, PREFERENCES_STORE, RECOMMENDATIONS_STORE, SETTINGS_STORE];
  const txn = db.transaction(stores, 'readonly');
  const [recipes, preferences, recommendations, apiCfg] = await Promise.all([
    reqToPromise(txn.objectStore(RECIPES_STORE).count()),
    reqToPromise(txn.objectStore(PREFERENCES_STORE).count()),
    reqToPromise(txn.objectStore(RECOMMENDATIONS_STORE).count()),
    reqToPromise(txn.objectStore(SETTINGS_STORE).get(SETTINGS_KEY_API_CONFIG)),
  ]);
  return {
    recipes: Number(recipes) || 0,
    preferences: Number(preferences) || 0,
    recommendations: Number(recommendations) || 0,
    hasApiConfig: !!(apiCfg && apiCfg.value && (apiCfg.value.api_key || apiCfg.value.base_url || apiCfg.value.model)),
  };
}
