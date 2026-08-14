// 应用主框架：顶部导航 + 三个视图（菜谱 / 今日推荐 / 设置）
import { renderRecipesView } from './views/recipes.js';
import { renderSettingsView } from './views/settings.js';
import { renderRecommendView } from './views/recommend.js';
import { getTheme, saveTheme, THEME_DARK, THEME_LIGHT, DEFAULT_THEME } from './db.js';

const VIEWS = {
  recipes: { label: '菜谱', render: renderRecipesView },
  recommend: { label: '今日推荐', render: renderRecommendView },
  settings: { label: '设置', render: renderSettingsView },
};

// localStorage key：与 index.html 内联脚本保持一致
const LOCAL_STORAGE_THEME_KEY = 'personal-recipe-app:theme';
const VALID_THEMES = new Set([THEME_DARK, THEME_LIGHT]);

/** 读 localStorage 主题值（非法/缺失 → null） */
function readLocalStorageTheme() {
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_THEME_KEY);
    return VALID_THEMES.has(raw) ? raw : null;
  } catch (_) {
    return null;
  }
}

/** 同步写 localStorage（隐私模式下静默失败） */
function writeThemeToLocalStorage(theme) {
  try {
    window.localStorage.setItem(LOCAL_STORAGE_THEME_KEY, String(theme));
  } catch (_) { /* ignore */ }
}

/** 将主题立即应用到 <html data-theme="...">，供 styles.css 选择器使用 */
function applyThemeToDocument(theme) {
  const actual = VALID_THEMES.has(theme) ? theme : DEFAULT_THEME;
  document.documentElement.setAttribute('data-theme', actual);
}

export function mountApp(rootEl) {
  let currentView = 'recipes';
  let pendingSubpage = null;
  // 当前激活的 shell 内元素引用（每次 renderShell 时更新）
  let uiRefs = { toggle: null, menu: null, wrap: null };
  // 全局监听器只注册一次，避免泄漏
  let globalListenersRegistered = false;

  /** 切换主题：
   *  1. 同步更新 DOM 与 localStorage（保证刷新首帧立即生效）
   *  2. 异步持久化 IndexedDB（DB 为权威值），失败会抛出异常由调用方展示
   */
  async function applyTheme(theme, { save = true } = {}) {
    const actual = VALID_THEMES.has(theme) ? theme : DEFAULT_THEME;
    applyThemeToDocument(actual);
    writeThemeToLocalStorage(actual);
    if (save) {
      try {
        await saveTheme(actual);
      } catch (e) {
        // 把 DB 写入失败明确抛给调用方，便于 UI 提示；不要静默吞
        throw new Error(`主题保存失败：${e && e.message ? e.message : String(e)}`);
      }
    }
    return actual;
  }

  // 挂载时的权威校正（异步）
  // 核心原则：IndexedDB 是权威源，localStorage 仅做首帧同步缓存。
  //   - 挂载后用 DB 值校正 DOM 和 localStorage（即使 localStorage 过时了也会被纠正）
  //   - 首帧由 index.html 内联脚本用 localStorage 做最佳猜测（可能短暂过时，但 IIFE 会立即纠正）
  (async () => {
    try {
      const fromDb = await getTheme();
      applyThemeToDocument(fromDb);
      writeThemeToLocalStorage(fromDb);
    } catch {
      // DB 读取失败 → 回退到 localStorage 或默认 dark
      const fromStorage = readLocalStorageTheme();
      const fallback = fromStorage !== null ? fromStorage : DEFAULT_THEME;
      applyThemeToDocument(fallback);
      writeThemeToLocalStorage(fallback);
    }
  })();

  function render() {
    const view = VIEWS[currentView] || VIEWS.recipes;
    rootEl.innerHTML = '';
    rootEl.appendChild(renderShell());
    const content = rootEl.querySelector('#view-content');
    content.innerHTML = '';
    view.render(content, {
      goToView: (name, options = {}) => {
        if (VIEWS[name]) {
          currentView = name;
          pendingSubpage = options.subpage || null;
          render();
        }
      },
      initialSubpage: pendingSubpage,
      applyTheme,
      THEME_DARK,
      THEME_LIGHT,
      getTheme,
    });
    pendingSubpage = null;
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
    // 更新当前激活的 ui 引用
    uiRefs = { toggle: $toggle, menu: $menu, wrap };

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

    // 全局监听器只注册一次，动态引用 uiRefs
    if (!globalListenersRegistered) {
      globalListenersRegistered = true;
      // 点击页面其他位置关闭菜单
      document.addEventListener('click', () => {
        const { toggle, menu } = uiRefs;
        if (!toggle || !menu) return;
        if (!menu.hidden) {
          menu.hidden = true;
          toggle.setAttribute('aria-expanded', 'false');
          toggle.classList.remove('open');
        }
      });
      // ESC 关闭菜单
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const { toggle, menu } = uiRefs;
        if (!toggle || !menu || menu.hidden) return;
        menu.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        toggle.classList.remove('open');
        toggle.focus();
      });
    }

    return wrap;
  }

  render();
}
