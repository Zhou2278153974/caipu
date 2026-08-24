import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountApp } from '../src/app.js';
import { getTheme, saveTheme, THEME_LIGHT, _resetDbForTesting, clearAllSettings, clearAllPreferences, clearAllRecipes } from '../src/db.js';

describe('阶段0：应用骨架', () => {
  let root;

  beforeEach(async () => {
    root = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(root);
    // 清 localStorage 与 DB 单例，避免主题跨用例污染
    try { window.localStorage.removeItem('personal-recipe-app:theme'); } catch (_) {}
    document.documentElement.removeAttribute('data-theme');
    _resetDbForTesting();
    await clearAllRecipes().catch(() => {});
    await clearAllSettings().catch(() => {});
    await clearAllPreferences().catch(() => {});
  });

  it('挂载后渲染标题与下拉按钮（不再有两个并排 nav-btn）', () => {
    mountApp(root);
    expect(root.querySelector('.app-title').textContent).toBe('吃什么');
    // 下拉按钮存在
    expect(root.querySelector('#nav-toggle')).toBeTruthy();
    // 菜单项有四个：菜谱 / 今日推荐 / 我的冰箱 / 设置
    const items = root.querySelectorAll('.nav-menu-item');
    expect(items.length).toBe(4);
    expect(items[0].dataset.view).toBe('recipes');
    expect(items[1].dataset.view).toBe('recommend');
    expect(items[2].dataset.view).toBe('fridge');
    expect(items[3].dataset.view).toBe('settings');
    // 不再有旧的并排 nav-btn
    expect(root.querySelectorAll('.nav-btn').length).toBe(0);
  });

  it('默认显示菜谱视图，菜单初始隐藏', () => {
    mountApp(root);
    expect(root.querySelector('#view-content').children.length).toBeGreaterThan(0);
    const menu = root.querySelector('#nav-menu');
    expect(menu.hidden).toBe(true);
    // toggle 按钮文字为当前视图名
    expect(root.querySelector('.nav-toggle-label').textContent).toBe('菜谱');
  });

  it('点击下拉按钮展开菜单，再点关闭', () => {
    mountApp(root);
    const toggle = root.querySelector('#nav-toggle');
    const menu = root.querySelector('#nav-menu');
    expect(menu.hidden).toBe(true);
    toggle.click();
    expect(menu.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.classList.contains('open')).toBe(true);
    // 再次点击关闭
    toggle.click();
    expect(menu.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.classList.contains('open')).toBe(false);
  });

  it('展开菜单后点击"设置"切换到设置视图并关闭菜单', () => {
    mountApp(root);
    const toggle = root.querySelector('#nav-toggle');
    toggle.click();
    const settingsItem = root.querySelector('.nav-menu-item[data-view="settings"]');
    settingsItem.click();
    // 菜单关闭
    expect(root.querySelector('#nav-menu').hidden).toBe(true);
    // toggle 文字变为"设置"
    expect(root.querySelector('.nav-toggle-label').textContent).toBe('设置');
    // 设置项标记为 active
    expect(root.querySelector('.nav-menu-item[data-view="settings"]').classList.contains('active')).toBe(true);
    expect(root.querySelector('.nav-menu-item[data-view="recipes"]').classList.contains('active')).toBe(false);
  });

  it('切换到设置后再切回菜谱视图', () => {
    mountApp(root);
    // 先到设置
    root.querySelector('#nav-toggle').click();
    root.querySelector('.nav-menu-item[data-view="settings"]').click();
    expect(root.querySelector('.nav-toggle-label').textContent).toBe('设置');
    // 再切回菜谱
    root.querySelector('#nav-toggle').click();
    root.querySelector('.nav-menu-item[data-view="recipes"]').click();
    expect(root.querySelector('.nav-toggle-label').textContent).toBe('菜谱');
    expect(root.querySelector('.nav-menu-item[data-view="recipes"]').classList.contains('active')).toBe(true);
  });

  it('点击页面外部区域关闭菜单', () => {
    mountApp(root);
    const toggle = root.querySelector('#nav-toggle');
    toggle.click();
    expect(root.querySelector('#nav-menu').hidden).toBe(false);
    // 模拟点击页面其他位置
    document.body.click();
    expect(root.querySelector('#nav-menu').hidden).toBe(true);
    expect(toggle.classList.contains('open')).toBe(false);
  });

  it('按 ESC 关闭菜单', () => {
    mountApp(root);
    const toggle = root.querySelector('#nav-toggle');
    toggle.click();
    expect(root.querySelector('#nav-menu').hidden).toBe(false);
    // 模拟 ESC
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(root.querySelector('#nav-menu').hidden).toBe(true);
    expect(toggle.classList.contains('open')).toBe(false);
  });
});

// ============ 集成测试：主题切换 → 刷新（重新挂载）→ 仍保持 light ============
function flush(ms = 0) {
  return new Promise((res) => setTimeout(res, ms));
}

describe('集成：主题切换的持久化（核心回归用例）', () => {
  let root;
  beforeEach(async () => {
    root = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(root);
    try { window.localStorage.removeItem('personal-recipe-app:theme'); } catch (_) {}
    document.documentElement.removeAttribute('data-theme');
    _resetDbForTesting();
    await clearAllRecipes().catch(() => {});
    await clearAllSettings().catch(() => {});
    await clearAllPreferences().catch(() => {});
  });

  it('用户点设置→主题设置→切白天 → IndexedDB / localStorage / DOM 三处都是 light', async () => {
    mountApp(root);
    await flush(10);
    // 进入设置
    root.querySelector('#nav-toggle').click();
    root.querySelector('.nav-menu-item[data-view="settings"]').click();
    await flush();
    // 进入主题二级页
    const themeCard = root.querySelector('.settings-category-card[data-cat="theme"]');
    expect(themeCard, '首页要有主题分类卡片').toBeTruthy();
    themeCard.click();
    await flush();
    const lightCard = root.querySelector('.theme-card[data-theme="light"]');
    expect(lightCard, '主题页要有白天卡片').toBeTruthy();
    lightCard.click();
    await flush(30); // 等待 applyTheme 的 saveTheme 异步落盘

    // ① DOM 立切 light
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    // ② localStorage 同步写入 light
    expect(window.localStorage.getItem('personal-recipe-app:theme')).toBe('light');
    // ③ IndexedDB 异步写入 light（这是用户强调的：必须真的存进数据库！）
    expect(await getTheme()).toBe(THEME_LIGHT);
    // ④ UI 状态框提示成功
    const status = root.querySelector('#theme-status');
    expect(status.className).toContain('status-success');
    expect(status.textContent).toContain('白天');
  });

  it('切到白天 → 模拟刷新（销毁 root 重新 mountApp）→ data-theme 仍然是 light', async () => {
    // Step A：正常切换到白天
    mountApp(root);
    await flush(10);
    root.querySelector('#nav-toggle').click();
    root.querySelector('.nav-menu-item[data-view="settings"]').click();
    await flush();
    root.querySelector('.settings-category-card[data-cat="theme"]').click();
    await flush();
    root.querySelector('.theme-card[data-theme="light"]').click();
    await flush(30);
    // 切换瞬间三项都 light
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem('personal-recipe-app:theme')).toBe('light');
    expect(await getTheme()).toBe('light');

    // Step B：模拟浏览器刷新 —— 清掉整个 root、重置 DB 单例（但保留 fake-indexeddb 数据本体 + localStorage）
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
    // 注意：不 removeItem，不 clearAllSettings；只清 app 内部单例
    _resetDbForTesting();
    // 模拟 index.html 里的首帧同步脚本（浏览器刷新时这段是真实运行的，测试环境不会自动跑）
    try {
      const raw = window.localStorage.getItem('personal-recipe-app:theme');
      const t = (raw === 'light' || raw === 'dark') ? raw : 'dark';
      document.documentElement.setAttribute('data-theme', t);
    } catch (_) {}

    // Step C：重新挂载（等于刷新后的初始化）
    mountApp(root);
    await flush(20); // 让挂载时的异步校正 IIFE 执行完

    // 刷新后仍是白天！
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem('personal-recipe-app:theme')).toBe('light');
    expect(await getTheme()).toBe('light');
  });

  it('（核心回归）localStorage 过时=dark 但 DB=light → 挂载后 DB 权威校正为 light，不再反过来用 localStorage 覆盖 DB', async () => {
    // 复现用户的 bug 场景：
    //   localStorage 里残留了一个过时的 'dark'（比如首次使用时 IIFE 写入的 DEFAULT_DARK）
    //   但 DB 里用户真的存了 'light'
    // 正确行为：DB 是权威源 → 挂载后 DOM=light、localStorage 被纠正为 light
    //           （绝不能反过来用 localStorage 的 dark 覆盖 DB 的 light！）
    await saveTheme(THEME_LIGHT);                           // DB = light
    window.localStorage.setItem('personal-recipe-app:theme', 'dark'); // localStorage 过时 = dark
    expect(await getTheme()).toBe('light');

    mountApp(root);
    await flush(20);

    // DB 权威 → DOM = light（不是 dark！）
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    // localStorage 被 DB 值纠正
    expect(window.localStorage.getItem('personal-recipe-app:theme')).toBe('light');
    // DB 仍然 = light（没被 localStorage 的 dark 覆盖！）
    expect(await getTheme()).toBe('light');
  });

  it('（空 DB 场景）localStorage 和 DB 都没值 → 挂载后 = dark（DEFAULT_THEME），不会无中生有变 light', async () => {
    // 全新用户：localStorage 空、DB 空
    mountApp(root);
    await flush(20);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem('personal-recipe-app:theme')).toBe('dark');
    expect(await getTheme()).toBe('dark');
  });
});
