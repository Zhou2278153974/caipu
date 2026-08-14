// 今日推荐视图
//   - 读取今日缓存 / 调 AI 生成一日三餐
//   - 显示营养点评 + 三餐卡片（早/午/晚）
//   - 换一批：重新生成并覆盖当日缓存
//   - 每道菜可一键收藏到"我的菜谱"（若 from_library=true 则是已在库里的菜）
//   - 流式显示 AI 思维链与输出过程（和新增菜谱页一致）

import { generateDailyRecommendation } from '../recommend-generator.js';
import {
  getApiConfig,
  getAllRecipes,
  createRecipe,
  getTodayKey,
  getRecommendation,
  saveRecommendation,
} from '../db.js';
import { aiErrorMessage } from '../ui-utils.js';

const MEAL_META = {
  breakfast: { label: '早餐', icon: '🌅', emoji: '🍳' },
  lunch:     { label: '午餐', icon: '☀️', emoji: '🍱' },
  dinner:    { label: '晚餐', icon: '🌙', emoji: '🍽️' },
};

export function renderRecommendView(container, services = {}) {
  const _getApiConfig = services.getApiConfig || getApiConfig;
  const _getAllRecipes = services.getAllRecipes || getAllRecipes;
  const _createRecipe = services.createRecipe || createRecipe;
  const _getRecommendation = services.getRecommendation || getRecommendation;
  const _saveRecommendation = services.saveRecommendation || saveRecommendation;
  const _generateDailyRecommendation = services.generateDailyRecommendation || generateDailyRecommendation;
  const _aiErrorMessage = services.aiErrorMessage || aiErrorMessage;

  let abortController = null;
  const todayKey = getTodayKey();

  init();

  // ============ 初始化：先尝试读缓存，否则进入生成 ============
  async function init() {
    renderShell();
    try {
      const cfg = await _getApiConfig();
      const configured = !!(cfg.base_url && cfg.api_key && cfg.model);
      if (!configured) {
        setMain(`
          <div class="empty-state">
            <p>🥢 今日推荐需要调用 AI 生成一日三餐搭配。</p>
            <p>配置完成后即可让 AI 为你生成营养均衡的一日三餐推荐～</p>
          </div>
        `);
        setActions([]);
        showConfigRequiredModal();
        return;
      }
      const cached = await _getRecommendation(todayKey);
      if (cached && cached.meals && cached.meals.breakfast && cached.meals.lunch && cached.meals.dinner
        && Array.isArray(cached.meals.breakfast.dishes)
        && Array.isArray(cached.meals.lunch.dishes)
        && Array.isArray(cached.meals.dinner.dishes)) {
        renderResult(cached);
        return;
      }
      startGenerate({ cfg });
    } catch (e) {
      setMain(`
        <div class="status-box status-error">读取配置失败：${escapeText(e.message || String(e))}</div>
      `);
      setActions([]);
      setStatus('初始化失败，请重试或检查浏览器 IndexedDB 是否可用', 'error');
    }
  }

  // ============ 弹框：提示需要配置 API ============
  function showConfigRequiredModal() {
    // 先移除已有的弹框（避免重复）
    document.querySelectorAll('.recommend-modal-overlay').forEach((el) => el.remove());

    const overlay = document.createElement('div');
    overlay.className = 'recommend-modal-overlay';
    overlay.innerHTML = `
      <div class="recommend-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="recommend-modal-icon">⚙️</div>
        <div class="recommend-modal-title" id="modal-title">需要配置 API</div>
        <div class="recommend-modal-desc">
          今日推荐需要调用 AI 生成一日三餐搭配，请先到「设置」页面填写 OpenAI 兼容 API（Base URL、API Key、模型名）。
        </div>
        <div class="recommend-modal-actions">
          <button class="btn btn-primary" id="recommend-modal-confirm" type="button">确认</button>
          <button class="btn" id="recommend-modal-cancel" type="button">取消</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const $confirm = overlay.querySelector('#recommend-modal-confirm');
    const $cancel = overlay.querySelector('#recommend-modal-cancel');

    $confirm.addEventListener('click', () => {
      overlay.remove();
      services.goToView?.('settings', { subpage: 'api' });
    });
    $cancel.addEventListener('click', () => {
      overlay.remove();
    });
    // 点击遮罩层外部关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  // ============ 页面外壳：标题 + 操作栏 + 主内容区 + 状态区 ============
  function renderShell() {
    container.innerHTML = `
      <section class="recommend-view">
        <div class="list-header">
          <h2 class="section-title">
            今日推荐
            <span class="recipe-count">· ${todayKey}</span>
          </h2>
          <div id="recommend-actions" class="sub-nav"></div>
        </div>
        <div id="recommend-nutrition" class="nutrition-note" style="display:none"></div>
        <div id="recommend-main"></div>
        <div id="recommend-status" class="status-box" role="status" aria-live="polite"></div>
      </section>
    `;
    // 动态测量顶部 app-header 高度，写入 CSS 变量，让折叠面板悬浮时精确紧贴
    // —— 比在 CSS 里写死 top: 62px 更可靠（字体/缩放/浏览器差异都能正确匹配）
    try {
      const header = document.querySelector('.app-header');
      if (header) {
        const h = header.getBoundingClientRect().height;
        if (h > 0) {
          const root = document.documentElement;
          root.style.setProperty('--app-header-height', `${h}px`);
        }
      }
    } catch (_) { /* 不影响主功能 */ }
  }

  function setMain(html) {
    const $main = container.querySelector('#recommend-main');
    if ($main) $main.innerHTML = html;
  }

  function setActions(btns) {
    const $actions = container.querySelector('#recommend-actions');
    if (!$actions) return;
    $actions.innerHTML = '';
    for (const b of btns || []) {
      const btn = document.createElement('button');
      btn.className = 'btn' + (b.kind === 'primary' ? ' btn-primary' : b.kind === 'danger' ? ' btn-danger' : '');
      btn.type = 'button';
      btn.textContent = b.text;
      if (b.id) btn.id = b.id;
      btn.addEventListener('click', b.onClick);
      $actions.appendChild(btn);
    }
  }

  function setStatus(text, kind = 'info') {
    const $s = container.querySelector('#recommend-status');
    if (!$s) return;
    $s.textContent = text;
    $s.className = `status-box status-${kind}`;
  }

  // ============ 生成中（流式） ============
  async function startGenerate({ cfg }) {
    abortController = new AbortController();
    renderGenerating();
    const $reasoning = container.querySelector('#stream-reasoning');
    const $content = container.querySelector('#stream-content');
    const $progressLabel = container.querySelector('#progress-label');
    const $reasoningMode = container.querySelector('#reasoning-mode');
    const $tokenCount = container.querySelector('#token-count');

    $progressLabel.textContent = '正在连接 API…';
    let hasNativeReasoning = false;
    let reasoningTokenCount = 0;
    let contentTokenCount = 0;

    try {
      const result = await _generateDailyRecommendation({
        config: cfg,
        signal: abortController.signal,
        onReasoning: (piece, full) => {
          hasNativeReasoning = true;
          reasoningTokenCount++;
          $reasoning.textContent = full;
          $reasoning.parentElement.classList.add('has-content');
          $reasoningMode.textContent = `（原生思考 · ${reasoningTokenCount} tokens）`;
          $progressLabel.textContent = 'AI 正在思考营养搭配…';
        },
        onDelta: (piece, full) => {
          contentTokenCount++;
          $content.textContent = full;
          if (!hasNativeReasoning) {
            $reasoning.textContent = full;
            $reasoning.parentElement.classList.add('has-content');
            $reasoningMode.textContent = `（流式回显 · ${contentTokenCount} tokens）`;
          }
          $progressLabel.textContent = 'AI 正在输出三餐菜谱…';
        },
        onProgress: (info) => {
          $tokenCount.textContent = info.totalTokens;
          if (info.reasoningTokens > 0) {
            $reasoningMode.textContent = `（原生思考 · ${info.reasoningTokens} tokens）`;
          } else if (info.contentTokens > 0) {
            if (!hasNativeReasoning) {
              $reasoningMode.textContent = `（流式回显 · ${info.contentTokens} tokens）`;
            }
          }
          if (info.phase === 'done') {
            $progressLabel.textContent = '接收完成，正在解析菜谱结构…';
          } else if (info.phase === 'reasoning') {
            $progressLabel.textContent = 'AI 正在思考营养搭配…';
          } else if (info.phase === 'output') {
            $progressLabel.textContent = 'AI 正在输出三餐菜谱…';
          }
        },
      });
      // 防御性检查：确保 result 结构完整再保存和渲染
      const hasValidMeals = result
        && result.meals
        && result.meals.breakfast && Array.isArray(result.meals.breakfast.dishes)
        && result.meals.lunch && Array.isArray(result.meals.lunch.dishes)
        && result.meals.dinner && Array.isArray(result.meals.dinner.dishes);
      if (!hasValidMeals) {
        throw new Error('AI 返回的推荐数据结构不完整，请重试');
      }
      // 缓存到今日
      await _saveRecommendation(todayKey, {
        generated_at: result.generated_at,
        nutrition_note: result.nutrition_note,
        meals: result.meals,
      });
      $progressLabel.textContent = '完成';
      renderResult(result);
      setStatus('已为你生成今日营养搭配', 'success');
    } catch (e) {
      if (e.name === 'AiClientError' && e.type === 'aborted') {
        setStatus('已取消生成', 'info');
        $progressLabel.textContent = '已取消';
        const $btnBack = container.querySelector('#btn-back-after-cancel');
        if ($btnBack) $btnBack.style.display = '';
        return;
      }
      showError(_aiErrorMessage(e), e.message || 'AI 生成失败');
    }
  }

  function renderGenerating() {
    setMain(`
      <section class="add-view">
        <h2 class="section-title">AI 正在推荐一日三餐</h2>
        <p class="section-desc">AI 正在根据你的菜谱库与营养原则，为你搭配今日的早中晚三餐。</p>

        <div id="stream-progress" class="stream-progress">
          <span id="progress-label" class="progress-label">正在连接 AI 服务…</span>
          <span class="progress-meta">
            <span id="token-count" class="token-count">0</span> tokens
          </span>
        </div>

        <details class="stream-panel" open>
          <summary>
            思维链
            <span id="reasoning-mode" class="hint">（等待响应…）</span>
          </summary>
          <pre id="stream-reasoning" class="stream-text"></pre>
        </details>

        <details class="stream-panel">
          <summary>AI 输出（最终推荐 JSON）</summary>
          <pre id="stream-content" class="stream-text"></pre>
        </details>

        <div class="add-actions">
          <button id="btn-cancel" class="btn btn-danger" type="button">取消</button>
          <button id="btn-back-after-cancel" class="btn" type="button" style="display:none">返回今日推荐</button>
        </div>
      </section>
    `);
    setActions([]);
    const $cancel = container.querySelector('#btn-cancel');
    if ($cancel) $cancel.addEventListener('click', () => abortController?.abort());
    const $back = container.querySelector('#btn-back-after-cancel');
    if ($back) $back.addEventListener('click', () => init());
  }

  function showError(detail, summary) {
    setMain(`
      <div class="status-box status-error">${escapeText(summary)}：${escapeText(detail)}</div>
    `);
    setActions([
      { text: '重试', id: 'btn-retry', kind: 'primary', onClick: async () => {
        const cfg = await _getApiConfig();
        if (!cfg.base_url || !cfg.api_key || !cfg.model) return;
        startGenerate({ cfg });
      } },
    ]);
  }

  // ============ 结果展示 ============
  function renderResult(data) {
    try {
      const safeData = data && typeof data === 'object' ? data : {};
      const safeMeals = (safeData.meals && typeof safeData.meals === 'object') ? safeData.meals : {};

      // 营养点评
      const $note = container.querySelector('#recommend-nutrition');
      if ($note) {
        if (safeData.nutrition_note) {
          $note.style.display = '';
          $note.textContent = safeData.nutrition_note;
        } else {
          $note.style.display = 'none';
        }
      }

      // 三餐折叠面板（默认全部收起，用户需要哪个自己点开）
      const slots = ['breakfast', 'lunch', 'dinner'];
      const mealsHtml = slots
        .map((slot) => renderMealSection(slot, safeMeals[slot], false))
        .join('');
      setMain(`<div class="meals-accordion">${mealsHtml}</div>`);

      // 绑定每道菜的收藏按钮
      slots.forEach((slot) => {
        const meal = safeMeals[slot];
        if (!meal || !Array.isArray(meal.dishes)) return;
        meal.dishes.forEach((dish, idx) => {
          const $btn = container.querySelector(`#save-dish-${slot}-${idx}`);
          if (!$btn) return;
          $btn.addEventListener('click', async () => {
            if (!dish || !dish.recipe || !dish.recipe.name) return;
            if (dish.from_library) {
              setStatus('这道菜已经在你的菜谱库里啦～', 'info');
              return;
            }
            $btn.disabled = true;
            $btn.textContent = '收藏中…';
            try {
              const saved = await _createRecipe({ ...dish.recipe });
              dish.from_library = true;
              dish.recipe_id = saved.id;
              $btn.textContent = '已收藏 ✓';
              $btn.classList.remove('btn-primary');
              setStatus(`已收藏「${saved.name}」到我的菜谱`, 'success');
            } catch (e) {
              $btn.disabled = false;
              $btn.textContent = '收藏到我的菜谱';
              setStatus(`收藏失败：${e.message}`, 'error');
            }
          });
        });
      });

      // 动作栏：换一批
      setActions([
        {
          text: '换一批',
          id: 'btn-refresh',
          kind: 'primary',
          onClick: async () => {
            const ok = await asyncConfirm('确定要重新生成今天的推荐吗？这会覆盖当前推荐。', '换一批提醒', '重新生成');
            if (!ok) return;
            const cfg = await _getApiConfig();
            if (!cfg.base_url || !cfg.api_key || !cfg.model) {
              setStatus('API 配置不完整', 'error');
              return;
            }
            startGenerate({ cfg });
          },
        },
      ]);
    } catch (e) {
      console.error('renderResult error:', e);
      setMain(`<div class="status-box status-error">推荐渲染失败：${escapeText(e.message)}</div>`);
      setActions([]);
      setStatus('渲染出错：' + e.message, 'error');
    }
  }

  /** 渲染一餐的折叠面板（大标题 + 可展开菜谱列表） */
  function renderMealSection(slot, meal, defaultOpen) {
    try {
      const meta = MEAL_META[slot];
      const dishes = (meal && Array.isArray(meal.dishes)) ? meal.dishes : [];
      const dishCount = dishes.length;
      const openAttr = defaultOpen ? 'open' : '';

      const dishNames = dishes.map((d) => d?.recipe?.name || '').filter(Boolean).join('、');
      const summaryText = dishCount > 0
        ? `${dishCount} 道菜${dishNames ? ' · ' + escapeText(dishNames) : ''}`
        : '暂无推荐';

      const dishesHtml = dishCount > 0
        ? dishes.map((dish, idx) => renderDishCard(slot, dish, idx)).join('')
        : `<div class="empty-state" style="padding:26px 10px"><p>暂无推荐</p></div>`;

      return `
        <details class="meal-accordion-item" data-slot="${slot}" ${openAttr}>
          <summary class="meal-accordion-header">
            <span class="meal-accordion-icon">${meta.icon}</span>
            <span class="meal-accordion-title">${meta.label}</span>
            <span class="meal-accordion-summary">${summaryText}</span>
            <span class="meal-accordion-caret">▾</span>
          </summary>
          <div class="meal-accordion-body">
            ${dishesHtml}
          </div>
        </details>
      `;
    } catch (e) {
      console.error('renderMealSection error:', slot, e);
      const meta = MEAL_META[slot];
      return `<details class="meal-accordion-item" data-slot="${slot}">
        <summary class="meal-accordion-header">
          <span class="meal-accordion-icon">${meta.icon}</span>
          <span class="meal-accordion-title">${meta.label}</span>
          <span class="meal-accordion-summary">渲染异常</span>
          <span class="meal-accordion-caret">▾</span>
        </summary>
        <div class="meal-accordion-body">
          <div class="empty-state" style="padding:26px 10px"><p>渲染出错，请重试</p></div>
        </div>
      </details>`;
    }
  }

  /** 渲染单道菜的卡片 */
  function renderDishCard(slot, dish, idx) {
    try {
      const meta = MEAL_META[slot];
      if (!dish || !dish.recipe || !dish.recipe.name) {
        return `<div class="empty-state" style="padding:16px"><p>菜品数据不完整</p></div>`;
      }
      const r = dish.recipe;
      const ingredients = Array.isArray(r.ingredients) ? r.ingredients : [];
      const steps = Array.isArray(r.steps) ? r.steps : [];
      const fromLib = !!dish.from_library;
      const libBadge = fromLib
        ? `<span class="meal-badge meal-badge-lib" title="来自你的菜谱库">📚 来自菜谱库</span>`
        : `<span class="meal-badge meal-badge-ai" title="AI 原创搭配">✨ AI 推荐</span>`;
      const saveBtn = fromLib
        ? `<button class="btn" id="save-dish-${slot}-${idx}" type="button" disabled title="已在菜谱库中">已在菜谱库</button>`
        : `<button class="btn btn-primary" id="save-dish-${slot}-${idx}" type="button">收藏到我的菜谱</button>`;

      const ingHtml = ingredients
        .map((i) => `<li><span>${escapeText(i?.name || '')}</span><span class="ing-amount">${escapeText(i?.amount || '')}</span></li>`)
        .join('');
      const stepsHtml = steps
        .map((s, si) => `<li><span class="step-idx">${si + 1}.</span> ${escapeText(s)}</li>`)
        .join('');
      const tipsHtml = r.tips
        ? `<details class="meal-tips"><summary>小贴士</summary><div class="meal-tips-body">${escapeText(r.tips)}</div></details>`
        : '';

      return `
        <article class="dish-card" data-slot="${slot}" data-idx="${idx}">
          <div class="dish-card-head">
            <div class="dish-recipe-name">${escapeText(r.name)}</div>
            <div class="dish-head-right">
              ${libBadge}
              <span class="meal-emoji">${meta.emoji}</span>
            </div>
          </div>
          ${r.intro ? `<div class="meal-recipe-intro">${escapeText(r.intro)}</div>` : ''}

          <div class="meal-subtitle">食材</div>
          <ul class="meal-ingredients">${ingHtml}</ul>

          <div class="meal-subtitle">步骤</div>
          <ul class="meal-steps">${stepsHtml}</ul>

          ${tipsHtml}

          <div class="meal-actions">
            ${saveBtn}
          </div>
        </article>
      `;
    } catch (e) {
      console.error('renderDishCard error:', slot, idx, e);
      return `<div class="empty-state" style="padding:16px"><p>菜品渲染失败</p></div>`;
    }
  }
}

/**
 * 异步确认弹框（替代原生 window.confirm，避免宿主 React 包装层拦截引发状态循环）
 * @param {string} message 确认说明文字
 * @param {string} [title] 弹框标题
 * @param {string} [okText] 确认按钮文案
 * @returns {Promise<boolean>} 用户点确认 → true，取消 → false
 */
function asyncConfirm(message, title = '确认', okText = '确认') {
  return new Promise((resolve) => {
    // 移除已有的（避免重复）
    document.querySelectorAll('.recommend-modal-overlay').forEach((el) => el.remove());

    const overlay = document.createElement('div');
    overlay.className = 'recommend-modal-overlay';
    overlay.innerHTML = `
      <div class="recommend-modal" role="dialog" aria-modal="true" aria-labelledby="async-confirm-title">
        <div class="recommend-modal-icon">⚠️</div>
        <div class="recommend-modal-title" id="async-confirm-title">${escapeText(title)}</div>
        <div class="recommend-modal-desc">${escapeText(message)}</div>
        <div class="recommend-modal-actions">
          <button class="btn btn-primary" id="async-confirm-ok" type="button">${escapeText(okText)}</button>
          <button class="btn" id="async-confirm-cancel" type="button">取消</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const $ok = overlay.querySelector('#async-confirm-ok');
    const $cancel = overlay.querySelector('#async-confirm-cancel');
    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    $ok.addEventListener('click', () => close(true));
    $cancel.addEventListener('click', () => close(false));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });
    // ESC 取消
    const onKey = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKey);
        close(false);
      }
    };
    document.addEventListener('keydown', onKey);
    setTimeout(() => $ok.focus(), 0);
  });
}

function escapeText(s) {
  return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
