// 我的冰箱 - 添加 / 编辑视图（独立子页，同菜谱模块）
//   mode='manual'：手动添加（editId 非空则为编辑，预填后保存修改）
//   mode='ai'：AI 识别录入（文字 / 小票图片），识别结果勾选后一键加入冰箱
//   成功后通过 onDone({ text, kind }) 返回列表并刷新
const SYSTEM_PROMPT = `你是一个食材识别助手。用户会提供一段文字或一张购物小票/清单图片，请从中提取出所有"食材"，忽略非食材（如洗发水、抽纸、洗衣液等日用品）。
只输出 JSON，不要输出任何解释或 Markdown。格式：
{"items":[{"name":"食材名","amount":"数量","unit":"单位"}]}
其中 amount 和 unit 可以省略（不写则留空字符串）。`;

export function renderFridgeAddView(container, services = {}) {
  const mode = services.mode === 'ai' ? 'ai' : 'manual';
  const editId = services.editId ?? null;
  const _onDone = services.onDone || (() => {});
  const _get = services.getFridgeIngredient;
  const _add = services.addFridgeIngredient;
  const _update = services.updateFridgeIngredient;
  const _getApiConfig = services.getApiConfig;
  const _streamChat = services.streamChat;
  const _fileToDataUrl = services.fileToDataUrl;
  const _aiErrorMessage = services.aiErrorMessage;
  const _goToView = services.goToView;

  if (mode === 'ai') {
    renderAiAdd();
  } else {
    renderManualAdd();
  }

  // ============ 手动添加 / 编辑 ============
  async function renderManualAdd() {
    container.innerHTML = `
      <h2 class="section-title">${editId !== null ? '编辑食材' : '手动添加食材'}</h2>
      <div class="fridge-form-body">
        <div class="row">
          <div class="field">
            <label for="fridge-name">食材名 *</label>
            <input id="fridge-name" type="text" placeholder="如：排骨" autocomplete="off" />
          </div>
          <div class="field">
            <label for="fridge-amount">数量</label>
            <input id="fridge-amount" type="text" placeholder="如：2" autocomplete="off" />
          </div>
          <div class="field">
            <label for="fridge-unit">单位</label>
            <input id="fridge-unit" type="text" placeholder="如：斤 / 个 / 棵" autocomplete="off" />
          </div>
        </div>
        <div class="settings-actions">
          <button id="fridge-add-btn" class="btn btn-primary" type="button">${editId !== null ? '保存修改' : '添加'}</button>
          ${editId !== null ? '<button id="fridge-cancel-edit" class="btn" type="button">取消</button>' : ''}
        </div>
      </div>
      <div id="fridge-status" class="status-box" role="status" aria-live="polite"></div>
    `;

    // 编辑模式：回填
    if (editId !== null) {
      try {
        const ing = await _get(editId);
        if (ing) {
          container.querySelector('#fridge-name').value = ing.name || '';
          container.querySelector('#fridge-amount').value = ing.amount || '';
          container.querySelector('#fridge-unit').value = ing.unit || '';
        } else {
          setStatus('该食材不存在或已被删除', 'error');
        }
      } catch (e) {
        setStatus(`加载食材失败：${e.message}`, 'error');
      }
    }

    container.querySelector('#fridge-add-btn').addEventListener('click', submit);
    const $cancel = container.querySelector('#fridge-cancel-edit');
    if ($cancel) $cancel.addEventListener('click', () => _onDone());
    const $name = container.querySelector('#fridge-name');
    $name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });
    if (editId === null) $name.focus();

    function submit() {
      const name = $name.value.trim();
      if (!name) {
        setStatus('请输入食材名', 'warning');
        $name.focus();
        return;
      }
      const payload = {
        name,
        amount: container.querySelector('#fridge-amount').value.trim(),
        unit: container.querySelector('#fridge-unit').value.trim(),
      };
      const $btn = container.querySelector('#fridge-add-btn');
      $btn.disabled = true;
      const promise = editId !== null ? _update({ id: editId, ...payload }) : _add(payload);
      promise
        .then(() => {
          const verb = editId !== null ? '已更新' : '已添加';
          _onDone({ text: `${verb}「${payload.name}」`, kind: 'success' });
        })
        .catch((e) => {
          setStatus(`${editId !== null ? '更新' : '添加'}失败：${e.message}`, 'error');
          $btn.disabled = false;
        });
    }
  }

  // ============ AI 识别添加 ============
  let aiResult = [];
  let aiBusy = false;

  function renderAiAdd() {
    container.innerHTML = `
      <h2 class="section-title">AI 识别添加食材</h2>
      <div class="fridge-ai-body">
        <div class="field">
          <label for="fridge-ai-text">输入或粘贴一段文字描述（只会记录食材，洗发水等非食材会被忽略）</label>
          <textarea id="fridge-ai-text" placeholder="例如：我买了两斤排骨、一棵白菜、半斤牛肉，还有一瓶洗发水和一盒抽纸"></textarea>
        </div>
        <div class="settings-actions fridge-ai-actions">
          <button id="fridge-ai-text-btn" class="btn btn-primary" type="button">🧠 AI 识别文字</button>
          <button id="fridge-ai-file-btn" class="btn" type="button">📷 上传小票图片</button>
          <input id="fridge-ai-file" type="file" accept="image/*" style="display:none" />
        </div>
        <div id="fridge-ai-file-name" class="fridge-hint"></div>
        <div id="fridge-ai-status" class="status-box" role="status" aria-live="polite"></div>
        <div id="fridge-ai-result"></div>
      </div>
    `;

    container.querySelector('#fridge-ai-text-btn').addEventListener('click', recognizeText);
    container.querySelector('#fridge-ai-file-btn').addEventListener('click', () => {
      container.querySelector('#fridge-ai-file').click();
    });
    container.querySelector('#fridge-ai-file').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        container.querySelector('#fridge-ai-file-name').textContent = `已选择：${file.name}`;
        recognizeImage(file);
      }
    });
  }

  /** 已配置则返回 config，未配置/出错返回 null */
  async function getConfigOrNull() {
    try {
      const cfg = await _getApiConfig();
      return cfg && cfg.api_key ? cfg : null;
    } catch {
      return null;
    }
  }

  function showConfigRequiredModal() {
    document.querySelectorAll('.fridge-modal-overlay').forEach((el) => el.remove());
    const overlay = document.createElement('div');
    overlay.className = 'fridge-modal-overlay';
    overlay.innerHTML = `
      <div class="fridge-modal" role="dialog" aria-modal="true" aria-labelledby="fridge-ai-config-title">
        <div class="fridge-modal-icon">🔑</div>
        <div class="fridge-modal-title" id="fridge-ai-config-title">尚未配置 AI API</div>
        <div class="fridge-modal-desc">使用 AI 识别功能需要先配置 AI 服务。是否前往「设置 → API 设置」？</div>
        <div class="fridge-modal-actions">
          <button class="btn btn-primary" id="fridge-ai-config-go" type="button">去设置</button>
          <button class="btn" id="fridge-ai-config-cancel" type="button">取消</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#fridge-ai-config-go').addEventListener('click', () => {
      overlay.remove();
      if (typeof _goToView === 'function') _goToView('settings', { subpage: 'api' });
    });
    overlay.querySelector('#fridge-ai-config-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  function setAiStatus(text, kind = 'info') {
    const $s = container.querySelector('#fridge-ai-status');
    if (!$s) return;
    $s.textContent = text;
    $s.className = `status-box status-${kind}`;
  }

  function toItems(data) {
    const list = Array.isArray(data) ? data : data && data.items;
    if (!Array.isArray(list)) return [];
    return list
      .filter((it) => it && typeof it.name === 'string' && it.name.trim())
      .map((it) => ({
        name: it.name.trim(),
        amount: it.amount ? String(it.amount).trim() : '',
        unit: it.unit ? String(it.unit).trim() : '',
        selected: true,
      }));
  }

  function parseAiResult(content) {
    const text = String(content || '').trim();
    // 直接 JSON（数组或 {"items":[...]}）
    try {
      return toItems(JSON.parse(text));
    } catch {
      // 继续尝试提取 ```json / ``` 代码块
    }
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) {
      try {
        return toItems(JSON.parse(m[1].trim()));
      } catch {
        // 忽略
      }
    }
    return [];
  }

  async function recognizeText() {
    if (aiBusy) return;
    const $text = container.querySelector('#fridge-ai-text');
    const text = $text.value.trim();
    if (!text) {
      setAiStatus('请先输入或粘贴一段文字描述', 'warning');
      $text.focus();
      return;
    }
    const cfg = await getConfigOrNull();
    if (!cfg) {
      showConfigRequiredModal();
      return;
    }
    aiBusy = true;
    const $btn = container.querySelector('#fridge-ai-text-btn');
    $btn.disabled = true;
    setAiStatus('AI 正在识别中…', 'info');
    try {
      const res = await _streamChat(
        cfg,
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        {}
      );
      const items = parseAiResult(res.content);
      aiResult = items;
      renderAiResult(items);
      if (items.length === 0) {
        setAiStatus('没有识别到食材，请检查输入内容', 'warning');
      } else {
        setAiStatus('识别完成，勾选要加入的食材，点「加入冰箱」', 'success');
      }
    } catch (e) {
      setAiStatus(_aiErrorMessage ? _aiErrorMessage(e) : `识别失败：${e.message}`, 'error');
    } finally {
      aiBusy = false;
      $btn.disabled = false;
    }
  }

  async function recognizeImage(file) {
    if (aiBusy) return;
    const cfg = await getConfigOrNull();
    if (!cfg) {
      showConfigRequiredModal();
      return;
    }
    aiBusy = true;
    setAiStatus('图片上传中，AI 正在识别…', 'info');
    try {
      const dataUrl = await _fileToDataUrl(file);
      const res = await _streamChat(
        cfg,
        [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: '这是一张超市购物小票（或手写清单）的照片，请提取其中所有的食材。' },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        {}
      );
      const items = parseAiResult(res.content);
      aiResult = items;
      renderAiResult(items);
      if (items.length === 0) {
        setAiStatus('没有识别到食材，请换一张更清晰的照片', 'warning');
      } else {
        setAiStatus('识别完成，勾选要加入的食材，点「加入冰箱」', 'success');
      }
    } catch (e) {
      setAiStatus(_aiErrorMessage ? _aiErrorMessage(e) : `识别失败：${e.message}`, 'error');
    } finally {
      aiBusy = false;
    }
  }

  function renderAiResult(items) {
    const $r = container.querySelector('#fridge-ai-result');
    if (!$r) return;
    if (!items || items.length === 0) {
      $r.innerHTML = '';
      return;
    }
    $r.innerHTML = `
      <div class="fridge-ai-result">
        <div class="fridge-ai-result-title">识别结果（${items.length} 项）</div>
        ${items
          .map(
            (it, idx) => `
          <label class="fridge-ai-item" data-idx="${idx}">
            <input type="checkbox" ${it.selected ? 'checked' : ''} />
            <span class="fridge-ai-item-name">${escapeText(it.name)}</span>
            <span class="fridge-ai-item-amount">${escapeText([it.amount, it.unit].filter(Boolean).join(' '))}</span>
          </label>
        `
          )
          .join('')}
        <div class="settings-actions fridge-ai-actions">
          <button id="fridge-ai-add-selected" class="btn btn-primary" type="button">加入冰箱</button>
          <button id="fridge-ai-clear" class="btn" type="button">清空结果</button>
        </div>
      </div>
    `;
    $r.querySelectorAll('.fridge-ai-item input').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const idx = Number(e.target.closest('.fridge-ai-item').dataset.idx);
        if (aiResult[idx]) aiResult[idx].selected = e.target.checked;
      });
    });
    $r.querySelector('#fridge-ai-add-selected').addEventListener('click', () => addSelectedFromAi());
    $r.querySelector('#fridge-ai-clear').addEventListener('click', () => {
      aiResult = [];
      renderAiResult([]);
      setAiStatus('', 'info');
    });
  }

  function addSelectedFromAi() {
    const selected = aiResult.filter((it) => it.selected);
    if (selected.length === 0) {
      setAiStatus('请先勾选要加入的食材', 'warning');
      return;
    }
    const $btn = container.querySelector('#fridge-ai-add-selected');
    if ($btn) $btn.disabled = true;
    setAiStatus('正在加入冰箱…', 'info');
    Promise.all(selected.map((it) => _add({ name: it.name, amount: it.amount, unit: it.unit })))
      .then((savedList) => {
        const names = savedList.map((s) => s.name).join('、');
        _onDone({ text: `已将 ${savedList.length} 种食材加入冰箱（${names}）`, kind: 'success' });
      })
      .catch((e) => {
        setAiStatus(`添加失败：${e.message}`, 'error');
        if ($btn) $btn.disabled = false;
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
