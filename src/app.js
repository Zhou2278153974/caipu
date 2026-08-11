// 应用主框架：顶部导航 + 两个视图（菜谱 / 设置）
import { renderRecipesView } from './views/recipes.js';
import { renderSettingsView } from './views/settings.js';

const VIEWS = {
  recipes: renderRecipesView,
  settings: renderSettingsView,
};

export function mountApp(rootEl) {
  let currentView = 'recipes';

  function render() {
    const view = VIEWS[currentView] || VIEWS.recipes;
    rootEl.innerHTML = '';
    rootEl.appendChild(renderShell());
    const content = rootEl.querySelector('#view-content');
    content.innerHTML = '';
    view(content);
  }

  function renderShell() {
    const wrap = document.createElement('div');
    wrap.className = 'app-shell';
    wrap.innerHTML = `
      <header class="app-header">
        <h1 class="app-title">我的菜谱</h1>
        <nav class="app-nav">
          <button class="nav-btn ${currentView === 'recipes' ? 'active' : ''}" data-view="recipes">菜谱</button>
          <button class="nav-btn ${currentView === 'settings' ? 'active' : ''}" data-view="settings">设置</button>
        </nav>
      </header>
      <main id="view-content" class="app-content"></main>
    `;
    wrap.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentView = btn.dataset.view;
        render();
      });
    });
    return wrap;
  }

  render();
}
