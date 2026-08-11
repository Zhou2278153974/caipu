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
} from '../src/db.js';

beforeEach(async () => {
  _resetDbForTesting();
  // fake-indexeddb 每个测试都是全新内存库，但保险起见显式清空
  await clearAllRecipes();
  await clearAllSettings();
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
