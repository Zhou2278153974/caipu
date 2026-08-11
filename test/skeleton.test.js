import { describe, it, expect, beforeEach } from 'vitest';
import { mountApp } from '../src/app.js';

describe('阶段0：应用骨架', () => {
  let root;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(root);
  });

  it('挂载后渲染标题与两个导航按钮', () => {
    mountApp(root);
    expect(root.querySelector('.app-title').textContent).toBe('我的菜谱');
    const navBtns = root.querySelectorAll('.nav-btn');
    expect(navBtns.length).toBe(2);
    expect(navBtns[0].dataset.view).toBe('recipes');
    expect(navBtns[1].dataset.view).toBe('settings');
  });

  it('默认显示菜谱视图', () => {
    mountApp(root);
    expect(root.querySelector('.nav-btn.active').dataset.view).toBe('recipes');
    expect(root.querySelector('#view-content').children.length).toBeGreaterThan(0);
  });

  it('点击设置按钮切换到设置视图', () => {
    mountApp(root);
    const settingsBtn = Array.from(root.querySelectorAll('.nav-btn'))
      .find((b) => b.dataset.view === 'settings');
    settingsBtn.click();
    expect(root.querySelector('.nav-btn.active').dataset.view).toBe('settings');
  });

  it('切换视图后再切回菜谱视图', () => {
    mountApp(root);
    root.querySelector('[data-view="settings"]').click();
    root.querySelector('[data-view="recipes"]').click();
    expect(root.querySelector('.nav-btn.active').dataset.view).toBe('recipes');
  });
});
