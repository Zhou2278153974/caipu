// 本地存储层：基于 IndexedDB 的封装
// 两个 store：
//   - recipes：菜谱（自增主键 id）
//   - settings：键值对（keyPath = key），其中 key='api_config' 存 API 配置
//
// 设计原则：
//   - 所有方法返回 Promise
//   - 不在存储层做业务校验，由调用方保证数据结构
//   - DB 单例，首次访问时自动打开

const DB_NAME = 'personal-recipe-app';
const DB_VERSION = 1;
const RECIPES_STORE = 'recipes';
const SETTINGS_STORE = 'settings';
const SETTINGS_KEY_API_CONFIG = 'api_config';

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

/** 清空所有设置 */
export async function clearAllSettings() {
  const db = await getDb();
  await reqToPromise(tx(db, SETTINGS_STORE, 'readwrite').clear());
}
