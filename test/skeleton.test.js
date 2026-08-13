import { describe, it, expect, beforeEach } from 'vitest';
import { mountApp } from '../src/app.js';

describe('阶段0：应用骨架', () => {
  let root;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(root);
  });

  it('挂载后渲染标题与下拉按钮（不再有两个并排 nav-btn）', () => {
    mountApp(root);
    expect(root.querySelector('.app-title').textContent).toBe('我的菜谱');
    // 下拉按钮存在
    expect(root.querySelector('#nav-toggle')).toBeTruthy();
    // 菜单项有三个：菜谱 / 今日推荐 / 设置
    const items = root.querySelectorAll('.nav-menu-item');
    expect(items.length).toBe(3);
    expect(items[0].dataset.view).toBe('recipes');
    expect(items[1].dataset.view).toBe('recommend');
    expect(items[2].dataset.view).toBe('settings');
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
