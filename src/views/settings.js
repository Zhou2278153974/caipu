// 设置视图（两级结构）：
//   一级（settings-home）：三个分类卡片 —— API设置 / 偏好设置 / 数据管理
//   二级：
//     - api：原有的 API 配置页（带返回）
//     - preferences：偏好标签（输入→气泡标签→删除）
//     - data-mgmt：两个清除分组（二次确认）
//
// 依赖通过 services 注入，便于测试

import {
  getApiConfig,
  saveApiConfig,
  getAllPreferences,
  addPreference,
  removePreference,
  clearDataExceptRecipes,
  clearRecipeDataOnly,
  getDataCounts,
  getTheme as _dbGetTheme,
  saveTheme as _dbSaveTheme,
  THEME_DARK,
  THEME_LIGHT,
} from '../db.js';
import { fetchModels } from '../ai-client.js';
import { aiErrorMessage } from '../ui-utils.js';

export function renderSettingsView(container, services = {}) {
  const THEME_DARK_VAL = typeof services.THEME_DARK === 'string' ? services.THEME_DARK : THEME_DARK;
  const THEME_LIGHT_VAL = typeof services.THEME_LIGHT === 'string' ? services.THEME_LIGHT : THEME_LIGHT;
  const injected = {
    getApiConfig: services.getApiConfig || getApiConfig,
    saveApiConfig: services.saveApiConfig || saveApiConfig,
    fetchModels: services.fetchModels || fetchModels,
    getAllPreferences: services.getAllPreferences || getAllPreferences,
    addPreference: services.addPreference || addPreference,
    removePreference: services.removePreference || removePreference,
    clearDataExceptRecipes: services.clearDataExceptRecipes || clearDataExceptRecipes,
    clearRecipeDataOnly: services.clearRecipeDataOnly || clearRecipeDataOnly,
    getDataCounts: services.getDataCounts || getDataCounts,
    getTheme: services.getTheme || _dbGetTheme,
    saveTheme: services.saveTheme || _dbSaveTheme,
    applyTheme: services.applyTheme || null,
  };

  // 当前所在子页：home | api | preferences | data-mgmt | theme
  let currentPage = services.initialSubpage && ['api', 'preferences', 'data-mgmt', 'theme'].includes(services.initialSubpage)
    ? services.initialSubpage
    : 'home';

  function navigate(name) {
    currentPage = name;
    render();
    if (name !== 'home') {
      // 回到视口顶部（防止进入二级页时停在页面中间）
      try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch (_) {}
    }
  }

  function render() {
    if (currentPage === 'home') return renderHome();
    if (currentPage === 'api') return renderApiPage();
    if (currentPage === 'preferences') return renderPreferencesPage();
    if (currentPage === 'data-mgmt') return renderDataMgmtPage();
    if (currentPage === 'theme') return renderThemePage();
    return renderHome();
  }

  // ============ 一级：设置首页（四个分类卡片） ============
  function renderHome() {
    container.innerHTML = `
      <section class="settings-view">
        <h2 class="section-title">设置</h2>
        <p class="section-desc">选择你要进入的设置分类。</p>

        <div class="settings-categories">
          <button class="settings-category-card" data-cat="api" type="button">
            <div class="settings-category-icon">🔑</div>
            <div class="settings-category-body">
              <div class="settings-category-title">API 设置</div>
              <div class="settings-category-desc">配置大模型的 Base URL、API Key、模型名。</div>
            </div>
            <div class="settings-category-arrow">›</div>
          </button>

          <button class="settings-category-card" data-cat="theme" type="button">
            <div class="settings-category-icon">🎨</div>
            <div class="settings-category-body">
              <div class="settings-category-title">主题设置</div>
              <div class="settings-category-desc">切换浅色（白天）与深色（黑夜）主题。</div>
            </div>
            <div class="settings-category-arrow">›</div>
          </button>

          <button class="settings-category-card" data-cat="preferences" type="button">
            <div class="settings-category-icon">🍽️</div>
            <div class="settings-category-body">
              <div class="settings-category-title">偏好设置</div>
              <div class="settings-category-desc">管理个人饮食喜好与忌口（如不吃辣、爱吃甜），今日推荐会参考。</div>
            </div>
            <div class="settings-category-arrow">›</div>
          </button>

          <button class="settings-category-card" data-cat="data-mgmt" type="button">
            <div class="settings-category-icon">🗂️</div>
            <div class="settings-category-body">
              <div class="settings-category-title">数据管理</div>
              <div class="settings-category-desc">分组清除数据：可清空菜谱，或清空 API / 偏好 / 推荐缓存而保留菜谱。</div>
            </div>
            <div class="settings-category-arrow">›</div>
          </button>
        </div>
      </section>
    `;
    container.querySelectorAll('.settings-category-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        if (cat === 'api') navigate('api');
        else if (cat === 'theme') navigate('theme');
        else if (cat === 'preferences') navigate('preferences');
        else if (cat === 'data-mgmt') navigate('data-mgmt');
      });
    });
  }

  // ============ 返回按钮（通用） ============
  function backButtonHtml(label = '返回设置') {
    return `<button class="btn btn-back" data-action="back-to-home" type="button">‹ ${escapeText(label)}</button>`;
  }
  function bindBackButton($root) {
    const $btn = $root.querySelector('[data-action="back-to-home"]');
    if ($btn) $btn.addEventListener('click', () => navigate('home'));
  }

  // ============ 二级：API 设置 ============
  function renderApiPage() {
    container.innerHTML = `
      <section class="settings-view">
        ${backButtonHtml('返回设置')}
        <h2 class="section-title">API 设置</h2>
        <p class="section-desc">配置 OpenAI 兼容的 API 地址、密钥和模型。所有信息仅保存在本机浏览器中。</p>

        <div class="field">
          <label for="cfg-base-url">Base URL</label>
          <input id="cfg-base-url" type="text" placeholder="https://api.openai.com/v1" autocomplete="off" />
        </div>

        <div class="field">
          <label for="cfg-api-key">API Key</label>
          <input id="cfg-api-key" type="password" placeholder="sk-..." autocomplete="off" />
        </div>

        <div class="field">
          <label for="cfg-model-select">模型名（从拉取列表选择）</label>
          <select id="cfg-model-select" autocomplete="off">
            <option value="">（尚未拉取模型）</option>
          </select>
        </div>
        <div class="field">
          <label for="cfg-model-manual">或手动输入模型名（填写后优先使用此值，可用于自定义模型）</label>
          <input id="cfg-model-manual" type="text" placeholder="留空则使用上面的下拉选择" autocomplete="off" />
        </div>

        <div class="settings-actions">
          <button id="btn-fetch-models" class="btn" type="button">拉取模型</button>
          <button id="btn-save-config" class="btn btn-primary" type="button">保存配置</button>
        </div>

        <div id="cfg-status" class="status-box" role="status" aria-live="polite"></div>
      </section>
    `;
    bindBackButton(container);

    const $base = container.querySelector('#cfg-base-url');
    const $key = container.querySelector('#cfg-api-key');
    const $modelSelect = container.querySelector('#cfg-model-select');
    const $modelManual = container.querySelector('#cfg-model-manual');
    const $btnFetch = container.querySelector('#btn-fetch-models');
    const $btnSave = container.querySelector('#btn-save-config');
    const $status = container.querySelector('#cfg-status');

    let fetchedModelIds = [];

    function setStatus(text, kind = 'info') {
      $status.textContent = text;
      $status.className = `status-box status-${kind}`;
    }
    function currentModel() {
      const manual = $modelManual ? $modelManual.value.trim() : '';
      if (manual) return manual;
      return $modelSelect.value.trim();
    }
    function currentConfig() {
      return {
        base_url: $base.value.trim(),
        api_key: $key.value.trim(),
        model: currentModel(),
      };
    }
    function populateModelSelect(models, savedModel) {
      fetchedModelIds = models.map((m) => m.id);
      const options = ['<option value="">（未拉取，可在下方手动输入）</option>'].concat(
        models.map((m) => `<option value="${escapeAttr(m.id)}">${escapeText(m.id)}</option>`)
      );
      $modelSelect.innerHTML = options.join('');
      if (savedModel) {
        const idx = fetchedModelIds.indexOf(savedModel);
        if (idx >= 0) {
          $modelSelect.value = savedModel;
          $modelManual.value = '';
        } else {
          $modelManual.value = savedModel;
        }
      }
    }

    injected.getApiConfig().then((cfg) => {
      $base.value = cfg.base_url || '';
      $key.value = cfg.api_key || '';
      if (cfg.model) {
        const selectOptions = Array.from($modelSelect.options).map((o) => o.value);
        if (selectOptions.indexOf(cfg.model) !== -1) {
          $modelSelect.value = cfg.model;
        } else {
          $modelManual.value = cfg.model;
        }
      }
    });

    $btnSave.addEventListener('click', async () => {
      try {
        await injected.saveApiConfig(currentConfig());
        setStatus('配置已保存', 'success');
      } catch (e) {
        setStatus(`保存失败：${e.message}`, 'error');
      }
    });

    $btnFetch.addEventListener('click', async () => {
      const currentSavedCfg = await injected.getApiConfig().catch(() => ({}));
      const manualText = $modelManual.value.trim();
      const cfg = {
        base_url: $base.value.trim(),
        api_key: $key.value.trim(),
        model: manualText || $modelSelect.value || currentSavedCfg.model || '',
      };
      if (!cfg.base_url) cfg.base_url = currentSavedCfg.base_url || '';
      if (!cfg.api_key) cfg.api_key = currentSavedCfg.api_key || '';

      if (!cfg.base_url || !cfg.api_key) {
        setStatus('请先填写 Base URL 和 API Key', 'error');
        return;
      }
      $btnFetch.disabled = true;
      const oldText = $btnFetch.textContent;
      $btnFetch.textContent = '拉取中…';
      setStatus('正在拉取模型列表…', 'info');
      try {
        const models = await injected.fetchModels({ base_url: cfg.base_url, api_key: cfg.api_key });
        populateModelSelect(models, cfg.model);
        if (models.length === 0) {
          setStatus('拉取成功，但返回的模型列表为空。（可在手动输入框中自定义）', 'warning');
        } else {
          if (!manualText && !$modelSelect.value) {
            $modelSelect.value = models[0].id;
          }
          setStatus(`已拉取 ${models.length} 个模型，已在上方下拉显示。保存配置后生效。`, 'success');
        }
      } catch (e) {
        setStatus(`拉取失败：${aiErrorMessage(e)}`, 'error');
      } finally {
        $btnFetch.disabled = false;
        $btnFetch.textContent = oldText;
      }
    });
  }

  // ============ 二级：偏好设置（输入 → 气泡标签 → 删除） ============
  function renderPreferencesPage() {
    container.innerHTML = `
      <section class="settings-view">
        ${backButtonHtml('返回设置')}
        <h2 class="section-title">偏好设置</h2>
        <p class="section-desc">
          管理你的个人饮食喜好和忌口，例如<em>"不吃辣"</em>、<em>"不要油炸"</em>、<em>"爱吃甜"</em>。
          今日推荐生成时会把这些偏好带给 AI，若与默认营养原则冲突，<strong>无条件服从你的偏好</strong>。
        </p>

        <div class="pref-input-wrap">
          <input id="pref-input" type="text" class="pref-input" placeholder="输入一个偏好（如"不吃香菜"），回车或点按钮添加" maxlength="60" autocomplete="off" />
          <button id="pref-add-btn" class="btn btn-primary" type="button">＋ 添加偏好</button>
        </div>
        <div id="pref-status" class="status-box" role="status" aria-live="polite"></div>

        <h3 class="settings-subtitle">已添加的偏好</h3>
        <div id="pref-list" class="pref-bubble-list">
          <div class="pref-empty">暂无偏好标签，添加一个试试～</div>
        </div>
      </section>
    `;
    bindBackButton(container);

    const $input = container.querySelector('#pref-input');
    const $addBtn = container.querySelector('#pref-add-btn');
    const $status = container.querySelector('#pref-status');
    const $list = container.querySelector('#pref-list');

    function setStatus(text, kind = 'info') {
      $status.textContent = text;
      $status.className = `status-box status-${kind}`;
    }

    async function refreshList() {
      try {
        const list = await injected.getAllPreferences();
        if (!list || list.length === 0) {
          $list.innerHTML = `<div class="pref-empty">暂无偏好标签，添加一个试试～</div>`;
          return;
        }
        $list.innerHTML = list
          .map(
            (p) => `
          <span class="pref-bubble" data-id="${escapeAttr(p.id)}">
            <span class="pref-bubble-text">${escapeText(p.value)}</span>
            <button class="pref-bubble-remove" type="button" aria-label="删除偏好 ${escapeAttr(p.value)}">−</button>
          </span>
        `
          )
          .join('');
        // 绑定删除
        $list.querySelectorAll('.pref-bubble-remove').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const bubble = btn.closest('.pref-bubble');
            const id = bubble ? bubble.dataset.id : '';
            if (!id) return;
            try {
              const ok = await injected.removePreference(id);
              if (ok) {
                setStatus('已删除该偏好', 'success');
                await refreshList();
              } else {
                setStatus('删除失败（可能已被删掉）', 'warning');
              }
            } catch (e) {
              setStatus(`删除失败：${e.message}`, 'error');
            }
          });
        });
      } catch (e) {
        $list.innerHTML = `<div class="pref-empty" style="color:var(--accent-danger)">加载偏好失败：${escapeText(e.message)}</div>`;
      }
    }

    async function doAdd() {
      const val = $input.value.trim();
      if (!val) {
        setStatus('请输入内容', 'warning');
        $input.focus();
        return;
      }
      try {
        await injected.addPreference(val);
        $input.value = '';
        setStatus('已添加偏好', 'success');
        await refreshList();
        $input.focus();
      } catch (e) {
        setStatus(`添加失败：${e.message}`, 'error');
      }
    }

    $addBtn.addEventListener('click', doAdd);
    $input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doAdd();
      }
    });

    refreshList();
  }

  // ============ 二级：主题设置（白天 / 黑夜切换） ============
  function renderThemePage() {
    container.innerHTML = `
      <section class="settings-view">
        ${backButtonHtml('返回设置')}
        <h2 class="section-title">主题设置</h2>
        <p class="section-desc">选择白天（浅色）或黑夜（深色）主题，选择后立即生效并自动保存。</p>

        <div id="theme-status" class="status-box" role="status" aria-live="polite"></div>

        <div class="theme-selector">
          <button class="theme-card" data-theme="${THEME_DARK_VAL}" type="button">
            <div class="theme-preview theme-preview-dark" aria-hidden="true">
              <div class="theme-preview-header"></div>
              <div class="theme-preview-body">
                <span class="theme-preview-bar"></span>
                <span class="theme-preview-bar long"></span>
                <span class="theme-preview-card"></span>
                <span class="theme-preview-card"></span>
              </div>
            </div>
            <div class="theme-card-title">🌙 黑夜主题</div>
            <div class="theme-card-badge" data-active-theme="${THEME_DARK_VAL}">当前使用</div>
          </button>

          <button class="theme-card" data-theme="${THEME_LIGHT_VAL}" type="button">
            <div class="theme-preview theme-preview-light" aria-hidden="true">
              <div class="theme-preview-header"></div>
              <div class="theme-preview-body">
                <span class="theme-preview-bar"></span>
                <span class="theme-preview-bar long"></span>
                <span class="theme-preview-card"></span>
                <span class="theme-preview-card"></span>
              </div>
            </div>
            <div class="theme-card-title">☀️ 白天主题</div>
            <div class="theme-card-badge" data-active-theme="${THEME_LIGHT_VAL}">当前使用</div>
          </button>
        </div>
      </section>
    `;
    bindBackButton(container);
    const $status = container.querySelector('#theme-status');

    function setStatus(text, kind = 'info') {
      $status.textContent = text;
      $status.className = `status-box status-${kind}`;
    }

    const LOCAL_THEME_KEY = 'personal-recipe-app:theme';
    function syncLocalStorage(theme) {
      try { window.localStorage.setItem(LOCAL_THEME_KEY, String(theme)); } catch (_) { /* ignore */ }
    }

    function markActive(theme) {
      container.querySelectorAll('.theme-card-badge').forEach((b) => {
        b.style.visibility = (b.dataset.activeTheme === theme) ? 'visible' : 'hidden';
      });
      container.querySelectorAll('.theme-card').forEach((card) => {
        if (card.dataset.theme === theme) card.classList.add('active');
        else card.classList.remove('active');
      });
    }

    // 读当前主题，标记 active
    injected.getTheme().then((t) => markActive(t)).catch(() => {});

    // 点击卡片切换
    container.querySelectorAll('.theme-card').forEach((card) => {
      card.addEventListener('click', async () => {
        const theme = card.dataset.theme;
        if (theme !== THEME_DARK_VAL && theme !== THEME_LIGHT_VAL) return;
        try {
          if (typeof injected.applyTheme === 'function') {
            // 优先用 app.js 注入的 applyTheme（DOM + localStorage + DB 原子化）
            const actual = await injected.applyTheme(theme);
            markActive(actual);
          } else {
            // 降级：自己写 DB + DOM + localStorage
            await injected.saveTheme(theme);
            if (document.documentElement) document.documentElement.setAttribute('data-theme', theme);
            syncLocalStorage(theme);
            markActive(theme);
          }
          setStatus(`已切换为「${theme === THEME_DARK_VAL ? '黑夜' : '白天'}主题」`, 'success');
        } catch (e) {
          setStatus(`主题切换失败：${e.message}`, 'error');
        }
      });
    });
  }

  // ============ 二级：数据管理（两个清除分组 + 二次确认） ============
  function renderDataMgmtPage() {
    container.innerHTML = `
      <section class="settings-view">
        ${backButtonHtml('返回设置')}
        <h2 class="section-title">数据管理</h2>
        <p class="section-desc">分组清除本地数据。所有操作<strong>仅影响本机浏览器存储</strong>，请谨慎操作。</p>

        <div id="data-mgmt-counts" class="data-counts-box">正在统计数据量…</div>

        <div class="data-clear-section data-clear-warn">
          <h3 class="settings-subtitle">① 清除「除菜谱以外」的所有数据</h3>
          <p class="data-clear-desc">
            范围：<strong>API 配置</strong>（Base URL / Key / 模型名）＋ <strong>偏好标签</strong> ＋ <strong>今日推荐缓存</strong>（按日期存的三餐）。
          </p>
          <p class="data-clear-desc data-clear-keep">保留：我的菜谱里的全部菜谱，一条都不会动。</p>
          <div class="data-clear-actions">
            <button id="btn-clear-except-recipes" class="btn btn-warn" type="button">清除除菜谱外的数据</button>
          </div>
        </div>

        <div class="data-clear-section data-clear-danger">
          <h3 class="settings-subtitle">② 清除菜谱数据（危险操作）</h3>
          <p class="data-clear-desc">
            范围：<strong>我的菜谱里的全部菜谱</strong>，所有菜谱将被永久删除。
          </p>
          <p class="data-clear-desc data-clear-keep">保留：API 配置、偏好标签、今日推荐缓存。</p>
          <div class="data-clear-actions">
            <button id="btn-clear-recipes" class="btn btn-danger" type="button">⚠ 清除所有菜谱</button>
          </div>
        </div>

        <div id="data-mgmt-status" class="status-box" role="status" aria-live="polite"></div>

        <!-- 二次确认弹框（同一个复用） -->
        <div id="confirm-modal" class="confirm-overlay" hidden>
          <div class="confirm-card">
            <div class="confirm-title" id="confirm-title">确认清除？</div>
            <div class="confirm-desc" id="confirm-desc">此操作不可恢复，确定要继续吗？</div>
            <div class="confirm-actions">
              <button class="btn" id="confirm-cancel" type="button">取消</button>
              <button class="btn btn-warn" id="confirm-ok" type="button">确认清除</button>
            </div>
          </div>
        </div>
      </section>
    `;
    bindBackButton(container);

    const $counts = container.querySelector('#data-mgmt-counts');
    const $status = container.querySelector('#data-mgmt-status');
    const $btnClearExcept = container.querySelector('#btn-clear-except-recipes');
    const $btnClearRecipes = container.querySelector('#btn-clear-recipes');
    const $modal = container.querySelector('#confirm-modal');
    const $modalTitle = container.querySelector('#confirm-title');
    const $modalDesc = container.querySelector('#confirm-desc');
    const $modalOK = container.querySelector('#confirm-ok');
    const $modalCancel = container.querySelector('#confirm-cancel');

    let pendingAction = null; // 确认后要执行的函数

    function setStatus(text, kind = 'info') {
      $status.textContent = text;
      $status.className = `status-box status-${kind}`;
    }

    async function refreshCounts() {
      try {
        const c = await injected.getDataCounts();
        $counts.innerHTML = `
          <div class="data-count-row"><span class="data-count-label">📑 我的菜谱</span><span class="data-count-value"><strong>${c.recipes}</strong> 条</span></div>
          <div class="data-count-row"><span class="data-count-label">🍽️ 偏好标签</span><span class="data-count-value"><strong>${c.preferences}</strong> 个</span></div>
          <div class="data-count-row"><span class="data-count-label">🍱 今日推荐缓存</span><span class="data-count-value"><strong>${c.recommendations}</strong> 天</span></div>
          <div class="data-count-row"><span class="data-count-label">🔑 API 配置</span><span class="data-count-value"><strong>${c.hasApiConfig ? '已配置' : '未配置'}</strong></span></div>
        `;
      } catch (e) {
        $counts.innerHTML = `<div class="data-count-row" style="color:var(--accent-red)">统计失败：${escapeText(e.message)}</div>`;
      }
    }

    function openConfirm({ title, desc, danger = false, onOK }) {
      $modalTitle.textContent = title;
      $modalDesc.textContent = desc;
      $modalOK.textContent = danger ? '确认删除（不可恢复）' : '确认清除';
      $modalOK.classList.toggle('btn-danger', !!danger);
      $modalOK.classList.toggle('btn-warn', !danger);
      pendingAction = onOK;
      $modal.hidden = false;
    }
    function closeConfirm() {
      $modal.hidden = true;
      pendingAction = null;
    }
    $modalCancel.addEventListener('click', closeConfirm);
    // 点遮罩（非卡片区域）关闭
    $modal.addEventListener('click', (e) => {
      if (e.target === $modal) closeConfirm();
    });
    $modalOK.addEventListener('click', async () => {
      const fn = pendingAction;
      closeConfirm();
      if (typeof fn === 'function') {
        try {
          await fn();
        } catch (e) {
          setStatus(`操作失败：${e.message}`, 'error');
        }
      }
    });

    $btnClearExcept.addEventListener('click', async () => {
      const c = await injected.getDataCounts().catch(() => ({}));
      const prefN = Number(c.preferences) || 0;
      const recN = Number(c.recommendations) || 0;
      const apiSet = !!c.hasApiConfig;
      openConfirm({
        title: '确认清除「除菜谱外」的数据？',
        desc: `即将删除：${apiSet ? 'API 配置（已配置）' : 'API 配置（未配置）'}、${prefN} 个偏好标签、${recN} 天的今日推荐缓存。我的菜谱不会被删除。此操作不可恢复。`,
        danger: false,
        onOK: async () => {
          await injected.clearDataExceptRecipes();
          setStatus('已清除 API / 偏好 / 推荐缓存，菜谱已保留。', 'success');
          await refreshCounts();
        },
      });
    });

    $btnClearRecipes.addEventListener('click', async () => {
      const c = await injected.getDataCounts().catch(() => ({}));
      const n = Number(c.recipes) || 0;
      openConfirm({
        title: '⚠ 确认清除所有菜谱？',
        desc: `我的菜谱里当前共有 ${n} 条菜谱。点确认后将被全部永久删除，无法恢复。其他数据（API / 偏好 / 推荐缓存）不动。`,
        danger: true,
        onOK: async () => {
          await injected.clearRecipeDataOnly();
          setStatus(`已清除全部 ${n} 条菜谱，其他数据均已保留。`, 'success');
          await refreshCounts();
        },
      });
    });

    refreshCounts();
  }

  // 首次渲染
  render();
}

// ============ 工具函数 ============
function escapeText(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
function escapeAttr(s) {
  return escapeText(s).replace(/"/g, '&quot;');
}
