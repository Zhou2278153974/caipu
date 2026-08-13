// 菜谱列表视图：列表 / 详情 / 编辑 / 删除
import { renderRecipeForm } from './recipe-form.js';
import {
  getAllRecipes,
  getRecipe,
  updateRecipe,
  deleteRecipe,
} from '../db.js';

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function escapeText(s) {
  return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

export function renderRecipeListView(container, services = {}) {
  const _getAllRecipes = services.getAllRecipes || getAllRecipes;
  const _getRecipe = services.getRecipe || getRecipe;
  const _updateRecipe = services.updateRecipe || updateRecipe;
  const _deleteRecipe = services.deleteRecipe || deleteRecipe;
  const _onAdd = services.onAdd || (() => {});

  let state = { view: 'list', id: null };

  function render() {
    container.innerHTML = '';
    if (state.view === 'list') renderList();
    else if (state.view === 'detail') renderDetail(state.id);
    else if (state.view === 'edit') renderEdit(state.id);
  }

  function go(view, id = null) {
    state = { view, id };
    render();
  }

  // ============ 列表 ============
  let allRecipes = []; // 缓存全部菜谱，供搜索过滤使用
  const PAGE_SIZE = 10;
  let currentPage = 1;

  function getFilteredRecipes(keyword) {
    const kw = (keyword || '').trim().toLowerCase();
    if (!kw) return allRecipes.slice();
    return allRecipes.filter((r) => (r.name || '').toLowerCase().includes(kw));
  }

  function renderRecipeCards($body, recipes) {
    if (recipes.length === 0) {
      $body.innerHTML = `<p class="placeholder">没有匹配的菜谱。</p>`;
      return;
    }
    $body.innerHTML = recipes
      .map(
        (r) => `
        <div class="recipe-card" data-id="${r.id}" tabindex="0" role="button">
          <div class="recipe-card-head">
            <span class="recipe-card-name">${escapeText(r.name)}</span>
            <span class="recipe-card-meta">${r.ingredients?.length || 0} 种食材</span>
          </div>
          ${r.intro ? `<p class="recipe-card-intro">${escapeText(r.intro)}</p>` : ''}
          <div class="recipe-card-time">${escapeText(formatDate(r.created_at))}</div>
        </div>
      `
      )
      .join('');
    $body.querySelectorAll('.recipe-card').forEach((card) => {
      const open = () => go('detail', Number(card.dataset.id));
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });
  }

  function renderPagination($container, total) {
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (currentPage > pages) currentPage = pages;
    if (currentPage < 1) currentPage = 1;
    const page = currentPage;
    const startIdx = (page - 1) * PAGE_SIZE;
    const endIdx = Math.min(startIdx + PAGE_SIZE, total);
    const startNum = total === 0 ? 0 : startIdx + 1;
    const canPrev = page > 1;
    const canNext = page < pages;

    const html = `
      <div class="pagination" data-total="${total}" data-page="${page}" data-pages="${pages}">
        <span class="pagination-info">第 ${startNum}-${endIdx} 条 / 共 ${total} 条</span>
        <div class="pagination-controls">
          <button class="btn btn-mini" type="button" data-act="first" ${canPrev ? '' : 'disabled'}>« 首页</button>
          <button class="btn btn-mini" type="button" data-act="prev" ${canPrev ? '' : 'disabled'}>‹ 上一页</button>
          <span class="pagination-pager">第 <strong>${page}</strong> / ${pages} 页</span>
          <button class="btn btn-mini" type="button" data-act="next" ${canNext ? '' : 'disabled'}>下一页 ›</button>
          <button class="btn btn-mini" type="button" data-act="last" ${canNext ? '' : 'disabled'}>末页 »</button>
        </div>
      </div>
    `;
    const $wrap = document.createElement('div');
    $wrap.innerHTML = html;
    const $el = $wrap.firstElementChild;
    $el.querySelectorAll('button[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.act;
        if (act === 'first') currentPage = 1;
        else if (act === 'prev') currentPage = Math.max(1, page - 1);
        else if (act === 'next') currentPage = Math.min(pages, page + 1);
        else if (act === 'last') currentPage = pages;
        refreshCurrentView();
      });
    });
    $container.appendChild($el);
  }

  let $currentSearch = null;
  function getCurrentKeyword() {
    return $currentSearch ? $currentSearch.value : '';
  }

  function refreshCurrentView() {
    const $body = container.querySelector('#recipe-list-body');
    const $pagWrap = container.querySelector('#pagination-wrap');
    if (!$body || !$pagWrap) return;
    const filtered = getFilteredRecipes(getCurrentKeyword());
    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (currentPage > pages) currentPage = pages;
    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const paged = filtered.slice(startIdx, startIdx + PAGE_SIZE);
    renderRecipeCards($body, paged);
    $pagWrap.innerHTML = '';
    renderPagination($pagWrap, total);
  }

  async function renderList() {
    container.innerHTML = `
      <div class="list-header">
        <h2 class="section-title">我的菜谱<span class="recipe-count"></span></h2>
        <input id="recipe-search" class="recipe-search" type="text" placeholder="搜索菜名…" autocomplete="off" />
        <button id="btn-add-recipe" class="btn btn-primary" type="button">+ 新增菜谱</button>
      </div>
      <div id="recipe-list-body" class="recipe-list-body">
        <p class="placeholder">加载中…</p>
      </div>
      <div id="pagination-wrap"></div>
    `;
    container.querySelector('#btn-add-recipe').addEventListener('click', () => _onAdd());

    const $count = container.querySelector('.recipe-count');
    const $body = container.querySelector('#recipe-list-body');
    const $pagWrap = container.querySelector('#pagination-wrap');
    try {
      allRecipes = await _getAllRecipes();
    } catch (e) {
      $body.innerHTML = `<div class="status-box status-error">读取菜谱失败：${escapeText(e.message)}</div>`;
      return;
    }
    $count.textContent = `（${allRecipes.length}）`;
    if (allRecipes.length === 0) {
      $body.innerHTML = `
        <div class="empty-state">
          <p>还没有保存任何菜谱。</p>
          <button id="btn-empty-add" class="btn btn-primary" type="button">+ 新增第一条菜谱</button>
        </div>
      `;
      $body.querySelector('#btn-empty-add').addEventListener('click', () => _onAdd());
      return;
    }
    currentPage = 1;
    const total = allRecipes.length;
    const paged = allRecipes.slice(0, PAGE_SIZE);
    renderRecipeCards($body, paged);
    renderPagination($pagWrap, total);

    // 搜索框：输入时实时过滤菜名，重置到第1页
    $currentSearch = container.querySelector('#recipe-search');
    $currentSearch.addEventListener('input', () => {
      currentPage = 1;
      refreshCurrentView();
    });
  }

  // ============ 详情 ============
  async function renderDetail(id) {
    container.innerHTML = `<p class="placeholder">加载中…</p>`;
    let recipe;
    try {
      recipe = await _getRecipe(id);
    } catch (e) {
      container.innerHTML = `<div class="status-box status-error">读取失败：${escapeText(e.message)}</div>`;
      return;
    }
    if (!recipe) {
      container.innerHTML = `
        <div class="status-box status-error">菜谱不存在或已被删除。</div>
        <button id="btn-back-list" class="btn" type="button">← 返回列表</button>
      `;
      container.querySelector('#btn-back-list').addEventListener('click', () => go('list'));
      return;
    }
    container.innerHTML = `
      <div class="detail-view">
        <div class="detail-actions">
          <button id="btn-back-list" class="btn" type="button">← 返回</button>
          <button id="btn-edit" class="btn" type="button">编辑</button>
          <button id="btn-delete" class="btn btn-danger" type="button">删除</button>
        </div>
        <h2 class="detail-name">${escapeText(recipe.name)}</h2>
        ${recipe.intro ? `<p class="detail-intro">${escapeText(recipe.intro)}</p>` : ''}

        <h3 class="detail-subtitle">食材</h3>
        <ul class="detail-ingredients">
          ${(recipe.ingredients || [])
            .map(
              (i) =>
                `<li><span class="ing-name">${escapeText(i.name)}</span><span class="ing-amount">${escapeText(i.amount)}</span></li>`
            )
            .join('')}
        </ul>

        <h3 class="detail-subtitle">步骤</h3>
        <ol class="detail-steps">
          ${(recipe.steps || []).map((s) => `<li>${escapeText(s)}</li>`).join('')}
        </ol>

        ${
          recipe.tips
            ? `<h3 class="detail-subtitle">小贴士</h3><p class="detail-tips">${escapeText(recipe.tips)}</p>`
            : ''
        }

        <div class="detail-time">
          <span>创建：${escapeText(formatDate(recipe.created_at))}</span>
          <span>更新：${escapeText(formatDate(recipe.updated_at))}</span>
        </div>

        <div id="detail-status" class="status-box"></div>
      </div>
    `;
    container.querySelector('#btn-back-list').addEventListener('click', () => go('list'));
    container.querySelector('#btn-edit').addEventListener('click', () => go('edit', id));
    container.querySelector('#btn-delete').addEventListener('click', async () => {
      if (!confirm(`确定删除菜谱「${recipe.name}」吗？此操作不可撤销。`)) return;
      const $status = container.querySelector('#detail-status');
      try {
        const ok = await _deleteRecipe(id);
        if (ok) {
          go('list');
        } else {
          $status.textContent = '删除失败：菜谱不存在';
          $status.className = 'status-box status-error';
        }
      } catch (e) {
        $status.textContent = `删除失败：${e.message}`;
        $status.className = 'status-box status-error';
      }
    });
  }

  // ============ 编辑 ============
  async function renderEdit(id) {
    container.innerHTML = `<p class="placeholder">加载中…</p>`;
    let recipe;
    try {
      recipe = await _getRecipe(id);
    } catch (e) {
      container.innerHTML = `<div class="status-box status-error">读取失败：${escapeText(e.message)}</div>`;
      return;
    }
    if (!recipe) {
      container.innerHTML = `
        <div class="status-box status-error">菜谱不存在或已被删除。</div>
        <button id="btn-back-list" class="btn" type="button">← 返回列表</button>
      `;
      container.querySelector('#btn-back-list').addEventListener('click', () => go('list'));
      return;
    }
    container.innerHTML = `
      <div class="edit-view">
        <div class="detail-actions">
          <button id="btn-cancel-edit" class="btn" type="button">← 取消</button>
        </div>
        <h2 class="section-title">编辑菜谱</h2>
        <div id="edit-form"></div>
        <div class="add-actions">
          <button id="btn-save-edit" class="btn btn-primary" type="button">保存修改</button>
          <button id="btn-cancel-edit-2" class="btn" type="button">取消</button>
        </div>
        <div id="edit-status" class="status-box"></div>
      </div>
    `;
    const form = renderRecipeForm(container.querySelector('#edit-form'), recipe);
    const $status = container.querySelector('#edit-status');

    async function save() {
      const r = form.getRecipe();
      if (!r.name || r.ingredients.length === 0 || r.steps.length === 0) {
        $status.textContent = '保存前请确保菜名、食材、步骤都不为空';
        $status.className = 'status-box status-error';
        return;
      }
      const btn = container.querySelector('#btn-save-edit');
      btn.disabled = true;
      btn.textContent = '保存中…';
      try {
        await _updateRecipe({ ...r, id });
        go('detail', id);
      } catch (e) {
        $status.textContent = `保存失败：${e.message}`;
        $status.className = 'status-box status-error';
        btn.disabled = false;
        btn.textContent = '保存修改';
      }
    }
    container.querySelector('#btn-save-edit').addEventListener('click', save);
    container.querySelector('#btn-cancel-edit').addEventListener('click', () => go('detail', id));
    container.querySelector('#btn-cancel-edit-2').addEventListener('click', () => go('detail', id));
  }

  render();
}
