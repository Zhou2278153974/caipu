// 我的冰箱 - 列表视图
//   - 顶部：标题「我的冰箱」+ 总数计数，搜索框，右上角「+ 添加食材」按钮
//   - 总览区：食材总数 + 最近添加（最多 5 条）
//   - 下方：各项食材列表（序号 / 食材名 / 数量单位 / 编辑 / 删除），支持搜索过滤 + 分页（一页 20 条）
//   - 点「+ 添加食材」→ 弹选择菜单：手动添加 / AI 识别添加
export function renderFridgeListView(container, services = {}) {
  const _getAll = services.getAllFridgeIngredients;
  const _delete = services.deleteFridgeIngredient;
  const _onAdd = services.onAdd || (() => {});
  const _onEdit = services.onEdit || (() => {});
  const initialStatus = services.initialStatus || null;
  const RECENT_COUNT = 5;
  const PAGE_SIZE = 20;

  let allIngredients = []; // 缓存全部食材，供搜索过滤与分页使用
  let currentPage = 1;
  let $search = null;

  renderShell();
  loadIngredients();

  // ============ 页面外壳 ============
  function renderShell() {
    container.innerHTML = `
      <div class="list-header">
        <h2 class="section-title">我的冰箱<span class="recipe-count"></span></h2>
        <input id="fridge-search" class="recipe-search" type="text" placeholder="搜索食材名…" autocomplete="off" />
        <button id="fridge-add-btn" class="btn btn-primary" type="button">+ 添加食材</button>
      </div>
      <div id="fridge-status" class="status-box" role="status" aria-live="polite"></div>
      <div id="fridge-overview"></div>
      <h3 class="settings-subtitle">全部食材</h3>
      <div id="fridge-list"></div>
      <div id="pagination-wrap"></div>
    `;
    container.querySelector('#fridge-add-btn').addEventListener('click', showAddMenu);
    $search = container.querySelector('#fridge-search');
    $search.addEventListener('input', () => {
      currentPage = 1;
      refreshCurrentView();
    });
  }

  async function loadIngredients() {
    try {
      allIngredients = await _getAll();
      if (initialStatus) {
        setStatus(initialStatus.text, initialStatus.kind);
      } else {
        setStatus('', 'info');
      }
    } catch (e) {
      allIngredients = [];
      setStatus(`加载食材失败：${e.message}`, 'error');
    }
    renderOverview();
    currentPage = 1;
    refreshCurrentView();
  }

  // ============ 总览（基于全部食材，不随搜索过滤） ============
  function renderOverview() {
    const $ov = container.querySelector('#fridge-overview');
    const total = allIngredients.length;
    if (!total) {
      $ov.innerHTML = `
        <div class="fridge-overview">
          <div class="fridge-overview-card">
            <div class="fridge-overview-num">0</div>
            <div class="fridge-overview-label">当前食材总数</div>
          </div>
        </div>
      `;
      return;
    }
    const recent = allIngredients.slice(0, RECENT_COUNT);
    const tags = recent
      .map((it) => {
        const amountText = [it.amount, it.unit].filter(Boolean).join(' ');
        return `<span class="fridge-overview-tag">${escapeText(it.name)}${amountText ? ` ${escapeText(amountText)}` : ''}</span>`;
      })
      .join('');
    $ov.innerHTML = `
      <div class="fridge-overview">
        <div class="fridge-overview-card">
          <div class="fridge-overview-num">${total}</div>
          <div class="fridge-overview-label">当前食材总数</div>
        </div>
        <div class="fridge-overview-recent">
          <div class="fridge-overview-recent-title">最近添加</div>
          <div class="fridge-overview-recent-tags">${tags}</div>
        </div>
      </div>
    `;
  }

  // ============ 搜索过滤 + 分页 ============
  function getKeyword() {
    return $search ? $search.value.trim().toLowerCase() : '';
  }

  function getFilteredIngredients() {
    const kw = getKeyword();
    if (!kw) return allIngredients.slice();
    return allIngredients.filter((it) => (it.name || '').toLowerCase().includes(kw));
  }

  function refreshCurrentView() {
    const $list = container.querySelector('#fridge-list');
    const $pagWrap = container.querySelector('#pagination-wrap');
    if (!$list || !$pagWrap) return;
    const $count = container.querySelector('.recipe-count');
    if ($count) $count.textContent = `（${allIngredients.length}）`;

    if (allIngredients.length === 0) {
      $list.innerHTML = `
        <div class="empty-state">
          <p>🧊 冰箱空空如也～</p>
          <p>点右上角「+ 添加食材」，或直接手动 / AI 识别录入。</p>
          <button id="btn-empty-add" class="btn btn-primary" type="button">+ 添加第一条</button>
        </div>
      `;
      $list.querySelector('#btn-empty-add').addEventListener('click', showAddMenu);
      $pagWrap.innerHTML = '';
      return;
    }

    const filtered = getFilteredIngredients();
    const total = filtered.length;
    if (total === 0) {
      $list.innerHTML = `<p class="placeholder">没有匹配的食材。</p>`;
      $pagWrap.innerHTML = '';
      return;
    }

    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (currentPage > pages) currentPage = pages;
    if (currentPage < 1) currentPage = 1;
    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const paged = filtered.slice(startIdx, startIdx + PAGE_SIZE);

    $list.innerHTML = `
      <ul class="fridge-list">
        ${paged.map((ing, i) => renderIngredientRow(ing, startIdx + i)).join('')}
      </ul>
    `;
    bindRowEvents($list);
    renderPagination($pagWrap, total);
  }

  function renderIngredientRow(ing, idx) {
    const name = escapeText(ing.name || '');
    const amountText = [ing.amount, ing.unit].filter(Boolean).join(' ');
    return `
      <li class="fridge-item" data-id="${ing.id}">
        <span class="fridge-item-index">${idx + 1}</span>
        <span class="fridge-item-name">${name}</span>
        ${amountText ? `<span class="fridge-item-amount">${escapeText(amountText)}</span>` : ''}
        <div class="fridge-item-actions">
          <button class="btn btn-mini" data-action="edit" type="button">编辑</button>
          <button class="btn btn-mini btn-danger" data-action="delete" type="button">删除</button>
        </div>
      </li>
    `;
  }

  function bindRowEvents($list) {
    $list.querySelectorAll('.fridge-item').forEach((row) => {
      const id = Number(row.dataset.id);
      const $edit = row.querySelector('[data-action="edit"]');
      const $del = row.querySelector('[data-action="delete"]');
      if ($edit) $edit.addEventListener('click', () => _onEdit(id));
      if ($del) $del.addEventListener('click', () => confirmDelete(id));
    });
  }

  function renderPagination($wrap, total) {
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
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
    const $el = document.createElement('div');
    $el.innerHTML = html;
    const $pag = $el.firstElementChild;
    $pag.querySelectorAll('button[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.act;
        if (act === 'first') currentPage = 1;
        else if (act === 'prev') currentPage = Math.max(1, page - 1);
        else if (act === 'next') currentPage = Math.min(pages, page + 1);
        else if (act === 'last') currentPage = pages;
        refreshCurrentView();
      });
    });
    $wrap.innerHTML = '';
    $wrap.appendChild($pag);
  }

  // ============ 删除（确认弹框） ============
  function confirmDelete(id) {
    const ing = allIngredients.find((i) => i.id === id);
    const name = ing ? ing.name : '该食材';
    asyncConfirm(`确定要从冰箱中删除「${name}」吗？`, '删除食材', '删除').then((ok) => {
      if (!ok) return;
      _delete(id)
        .then(() => loadIngredients())
        .then(() => setStatus(`已删除「${name}」`, 'success'))
        .catch((e) => setStatus(`删除失败：${e.message}`, 'error'));
    });
  }

  // ============ 添加方式选择菜单 ============
  function showAddMenu() {
    document.querySelectorAll('.fridge-modal-overlay').forEach((el) => el.remove());
    const overlay = document.createElement('div');
    overlay.className = 'fridge-modal-overlay';
    overlay.innerHTML = `
      <div class="fridge-modal" role="dialog" aria-modal="true" aria-labelledby="fridge-menu-title">
        <div class="fridge-modal-icon">🧊</div>
        <div class="fridge-modal-title" id="fridge-menu-title">添加食材</div>
        <div class="fridge-modal-desc">选择一种录入方式</div>
        <div class="fridge-menu-options">
          <button class="btn fridge-menu-option" id="fridge-menu-manual" type="button">
            <span class="fridge-menu-option-icon">📝</span>
            <span class="fridge-menu-option-text"><strong>手动添加</strong><small>输入食材名、数量、单位</small></span>
          </button>
          <button class="btn fridge-menu-option" id="fridge-menu-ai" type="button">
            <span class="fridge-menu-option-icon">✨</span>
            <span class="fridge-menu-option-text"><strong>AI 识别添加</strong><small>文字或小票图片自动识别</small></span>
          </button>
        </div>
        <div class="fridge-modal-actions">
          <button class="btn" id="fridge-menu-cancel" type="button">取消</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#fridge-menu-manual').addEventListener('click', () => {
      overlay.remove();
      _onAdd('manual');
    });
    overlay.querySelector('#fridge-menu-ai').addEventListener('click', () => {
      overlay.remove();
      _onAdd('ai');
    });
    overlay.querySelector('#fridge-menu-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  // ============ 确认弹框 ============
  function asyncConfirm(message, title = '确认', okText = '确认') {
    return new Promise((resolve) => {
      document.querySelectorAll('.fridge-modal-overlay').forEach((el) => el.remove());
      const overlay = document.createElement('div');
      overlay.className = 'fridge-modal-overlay';
      overlay.innerHTML = `
        <div class="fridge-modal" role="dialog" aria-modal="true" aria-labelledby="fridge-confirm-title">
          <div class="fridge-modal-icon">⚠️</div>
          <div class="fridge-modal-title" id="fridge-confirm-title">${escapeText(title)}</div>
          <div class="fridge-modal-desc">${escapeText(message)}</div>
          <div class="fridge-modal-actions">
            <button class="btn btn-danger" id="fridge-confirm-ok" type="button">${escapeText(okText)}</button>
            <button class="btn" id="fridge-confirm-cancel" type="button">取消</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const close = (result) => {
        overlay.remove();
        resolve(result);
      };
      overlay.querySelector('#fridge-confirm-ok').addEventListener('click', () => close(true));
      overlay.querySelector('#fridge-confirm-cancel').addEventListener('click', () => close(false));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(false);
      });
    });
  }

  function setStatus(text, kind = 'info') {
    const $s = container.querySelector('#fridge-status');
    if (!$s) return;
    $s.textContent = text;
    $s.className = `status-box status-${kind}`;
  }
}

function escapeText(s) {
  return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
