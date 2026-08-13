// 应用主框架：顶部导航 + 三个视图（菜谱 / 今日推荐 / 设置）
import { renderRecipesView } from './views/recipes.js';
import { renderSettingsView } from './views/settings.js';
import { renderRecommendView } from './views/recommend.js';

const VIEWS = {
  recipes: { label: '菜谱', render: renderRecipesView },
  recommend: { label: '今日推荐', render: renderRecommendView },
  settings: { label: '设置', render: renderSettingsView },
};

export function mountApp(rootEl) {
  let currentView = 'recipes';

  function render() {
    const view = VIEWS[currentView] || VIEWS.recipes;
    rootEl.innerHTML = '';
    rootEl.appendChild(renderShell());
    const content = rootEl.querySelector('#view-content');
    content.innerHTML = '';
    view.render(content, {
      goToView: (name) => {
        if (VIEWS[name]) {
          currentView = name;
          render();
        }
      },
    });
  }

  function renderShell() {
    const wrap = document.createElement('div');
    wrap.className = 'app-shell';
    wrap.innerHTML = `
      <header class="app-header">
        <h1 class="app-title">我的菜谱</h1>
        <div class="nav-dropdown">
          <button id="nav-toggle" class="nav-toggle" type="button" aria-haspopup="true" aria-expanded="false">
            <span class="nav-toggle-label">${VIEWS[currentView].label}</span>
            <span class="nav-toggle-caret">▾</span>
          </button>
          <div id="nav-menu" class="nav-menu" hidden>
            <button class="nav-menu-item ${currentView === 'recipes' ? 'active' : ''}" data-view="recipes" type="button">
              <span class="nav-menu-icon">📑</span>菜谱
            </button>
            <button class="nav-menu-item ${currentView === 'recommend' ? 'active' : ''}" data-view="recommend" type="button">
              <span class="nav-menu-icon">🍱</span>今日推荐
            </button>
            <button class="nav-menu-item ${currentView === 'settings' ? 'active' : ''}" data-view="settings" type="button">
              <span class="nav-menu-icon">⚙</span>设置
            </button>
          </div>
        </div>
      </header>
      <main id="view-content" class="app-content"></main>
    `;

    const $toggle = wrap.querySelector('#nav-toggle');
    const $menu = wrap.querySelector('#nav-menu');

    // 点击下拉按钮：切换菜单显隐
    $toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = !$menu.hidden;
      $menu.hidden = isOpen;
      $toggle.setAttribute('aria-expanded', String(!isOpen));
      $toggle.classList.toggle('open', !isOpen);
    });

    // 选择菜单项：切换视图并关闭菜单
    wrap.querySelectorAll('.nav-menu-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentView = btn.dataset.view;
        $menu.hidden = true;
        $toggle.setAttribute('aria-expanded', 'false');
        $toggle.classList.remove('open');
        render();
      });
    });

    // 点击页面其他位置关闭菜单
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) {
        $menu.hidden = true;
        $toggle.setAttribute('aria-expanded', 'false');
        $toggle.classList.remove('open');
      }
    });

    // ESC 关闭菜单
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$menu.hidden) {
        $menu.hidden = true;
        $toggle.setAttribute('aria-expanded', 'false');
        $toggle.classList.remove('open');
        $toggle.focus();
      }
    });

    return wrap;
  }

  render();
}
