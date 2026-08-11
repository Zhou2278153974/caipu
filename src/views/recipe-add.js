// 新增菜谱视图：
//   - 图片上传 + 文字粘贴
//   - 调用 AI 流式解析，实时显示思维链 / 输出 / 进度状态
//   - 解析成功 → 可编辑预览表单 → 保存
//   - 解析失败 → 显示错误类型
//   - 支持取消（AbortController）
import { renderRecipeForm } from './recipe-form.js';
import { createRecipe, getApiConfig } from '../db.js';
import { streamChat, fileToDataUrl, AiErrorType } from '../ai-client.js';
import { RECIPE_SYSTEM_PROMPT, buildUserMessage, parseRecipeResponse } from '../recipe-parser.js';
import { aiErrorMessage } from '../ui-utils.js';

export function renderRecipeAddView(container, services = {}) {
  const _getApiConfig = services.getApiConfig || getApiConfig;
  const _streamChat = services.streamChat || streamChat;
  const _fileToDataUrl = services.fileToDataUrl || fileToDataUrl;
  const _parseRecipeResponse = services.parseRecipeResponse || parseRecipeResponse;
  const _createRecipe = services.createRecipe || createRecipe;
  const _aiErrorMessage = services.aiErrorMessage || aiErrorMessage;
  const _onSaved = services.onSaved || (() => {});

  let abortController = null;

  renderInput();

  // ============ 状态：输入 ============
  function renderInput() {
    abortController = null;
    container.innerHTML = `
      <section class="add-view">
        <h2 class="section-title">新增菜谱</h2>
        <p class="section-desc">把社交媒体上看到的菜谱（截图或文字）交给 AI 解析整理。</p>

        <div class="field">
          <label for="add-image">图片（可选，可多选）</label>
          <input id="add-image" type="file" accept="image/*" multiple />
          <div id="image-preview" class="image-preview"></div>
        </div>

        <div class="field">
          <label for="add-text">文字内容（可选）</label>
          <textarea id="add-text" placeholder="把菜谱文字粘贴到这里…"></textarea>
        </div>

        <div class="add-actions">
          <button id="btn-parse" class="btn btn-primary" type="button">开始 AI 解析</button>
        </div>

        <div id="add-status" class="status-box" role="status" aria-live="polite"></div>
      </section>
    `;

    const $file = container.querySelector('#add-image');
    const $preview = container.querySelector('#image-preview');
    const $btnParse = container.querySelector('#btn-parse');
    const $status = container.querySelector('#add-status');

    let selectedFiles = [];

    $file.addEventListener('change', () => {
      selectedFiles = Array.from($file.files || []);
      $preview.innerHTML = selectedFiles
        .map(
          (f, i) =>
            `<div class="img-thumb" data-idx="${i}"><span class="img-name">${escapeText(f.name)}</span><span class="img-size">${Math.round(f.size / 1024)}KB</span></div>`
        )
        .join('');
    });

    $btnParse.addEventListener('click', async () => {
      const text = container.querySelector('#add-text').value.trim();
      if (selectedFiles.length === 0 && !text) {
        setStatus($status, '请至少上传一张图片或粘贴一段文字', 'error');
        return;
      }
      // 校验 API 配置
      const cfg = await _getApiConfig();
      if (!cfg.base_url || !cfg.api_key || !cfg.model) {
        setStatus(
          $status,
          'API 配置不完整，请先到"设置"页填写 Base URL、API Key 并选择模型。',
          'error'
        );
        return;
      }
      await startParse({ cfg, text, files: selectedFiles });
    });

    setStatus($status, '', 'info');
  }

  // ============ 状态：流式解析 ============
  async function startParse({ cfg, text, files }) {
    abortController = new AbortController();
    renderStreaming();
    const $reasoning = container.querySelector('#stream-reasoning');
    const $content = container.querySelector('#stream-content');
    const $progressLabel = container.querySelector('#progress-label');
    const $reasoningMode = container.querySelector('#reasoning-mode');
    const $tokenCount = container.querySelector('#token-count');

    $progressLabel.textContent = '正在连接 API…';
    let reasoningBuf = '';
    let contentBuf = '';
    let reasoningTokenCount = 0;
    let contentTokenCount = 0;

    // 转换图片
    let imageDataUrls = [];
    if (files.length > 0) {
      $progressLabel.textContent = '正在读取图片…';
      try {
        imageDataUrls = await Promise.all(files.map((f) => _fileToDataUrl(f)));
      } catch (e) {
        $progressLabel.textContent = '图片读取失败';
        showError(_aiErrorMessage(e), '读取本地图片时出错');
        return;
      }
    }

    // 构造消息
    const messages = [
      { role: 'system', content: RECIPE_SYSTEM_PROMPT },
      buildUserMessage({ text, imageDataUrl: imageDataUrls[0] }),
    ];
    // 多张图片：合并到同一条 user 消息
    if (imageDataUrls.length > 1) {
      const extraParts = imageDataUrls.slice(1).map((url) => ({
        type: 'image_url',
        image_url: { url },
      }));
      messages[messages.length - 1].content = [
        ...messages[messages.length - 1].content,
        ...extraParts,
      ];
    }

    $progressLabel.textContent = '正在等待 AI 响应…';

    let hasNativeReasoning = false;

    try {
      const result = await _streamChat(cfg, messages, {
        signal: abortController.signal,
        onReasoning: (piece, full) => {
          reasoningBuf = full;
          hasNativeReasoning = true;
          reasoningTokenCount++;
          $reasoning.textContent = reasoningBuf;
          $reasoning.parentElement.classList.add('has-content');
          $reasoningMode.textContent = `（原生思考 · ${reasoningTokenCount} tokens）`;
          $progressLabel.textContent = 'AI 正在思考…';
        },
        onDelta: (piece, full) => {
          contentBuf = full;
          contentTokenCount++;
          $content.textContent = contentBuf;
          if (!hasNativeReasoning) {
            $reasoning.textContent = contentBuf;
            $reasoning.parentElement.classList.add('has-content');
            $reasoningMode.textContent = `（流式回显 · ${contentTokenCount} tokens）`;
          }
          $progressLabel.textContent = 'AI 正在输出菜谱…';
        },
        onProgress: (info) => {
          $progressLabel.textContent =
            info.phase === 'reasoning'
              ? 'AI 正在思考…'
              : info.phase === 'output'
                ? 'AI 正在输出菜谱…'
                : info.phase === 'done'
                  ? '接收完成，正在解析…'
                  : '正在等待 AI 响应…';
          $tokenCount.textContent = info.totalTokens;
          if (info.reasoningTokens > 0) {
            $reasoningMode.textContent = `（原生思考 · ${info.reasoningTokens} tokens）`;
          } else {
            $reasoningMode.textContent = `（流式回显 · ${info.contentTokens} tokens）`;
          }
        },
      });
      const finalText = result.content || contentBuf;
      $progressLabel.textContent = 'AI 输出完成，正在解析为菜谱…';
      const parsed = _parseRecipeResponse(finalText);
      if (parsed.valid) {
        $progressLabel.textContent = '解析成功，请在下方核对并保存。';
        renderPreview(parsed.recipe, finalText, result.reasoning || reasoningBuf);
      } else {
        $progressLabel.textContent = '解析失败';
        showError(
          `AI 返回的内容无法解析为完整菜谱：${parsed.errors.join('；')}`,
          '菜谱结构不完整',
          finalText
        );
      }
    } catch (e) {
      if (e.type === AiErrorType.ABORTED) {
        $progressLabel.textContent = '已取消';
        setStatus(container.querySelector('#add-status'), '解析已取消', 'info');
        const $btnBack = container.querySelector('#btn-back-after-cancel');
        if ($btnBack) $btnBack.style.display = '';
        return;
      }
      $progressLabel.textContent = '解析失败';
      showError(_aiErrorMessage(e), 'AI 请求出错');
    }
  }

  function renderStreaming() {
    container.innerHTML = `
      <section class="add-view">
        <h2 class="section-title">AI 解析中</h2>
        <div id="stream-progress" class="stream-progress">
          <span id="progress-label" class="progress-label">正在等待 AI 响应…</span>
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
          <summary>AI 输出（最终结果）</summary>
          <pre id="stream-content" class="stream-text"></pre>
        </details>

        <div class="add-actions">
          <button id="btn-cancel" class="btn btn-danger" type="button">取消</button>
          <button id="btn-back-after-cancel" class="btn" type="button" style="display:none">返回输入</button>
        </div>
        <div id="add-status" class="status-box"></div>
      </section>
    `;
    container.querySelector('#btn-cancel').addEventListener('click', () => {
      if (abortController) abortController.abort();
    });
    container.querySelector('#btn-back-after-cancel').addEventListener('click', () => {
      renderInput();
    });
  }

  // ============ 状态：预览编辑 + 保存 ============
  function renderPreview(recipe, rawContent, reasoning) {
    container.innerHTML = `
      <section class="add-view">
        <h2 class="section-title">核对并保存</h2>
        <p class="section-desc">AI 已解析完成，请核对内容后保存。可自由修改任何字段。</p>
        <div id="preview-form"></div>
        <div class="add-actions">
          <button id="btn-save-recipe" class="btn btn-primary" type="button">保存菜谱</button>
          <button id="btn-reparse" class="btn" type="button">重新解析</button>
          <button id="btn-discard" class="btn btn-danger" type="button">放弃</button>
        </div>
        <div id="add-status" class="status-box"></div>

        <details class="stream-panel">
          <summary>查看 AI 原始输出</summary>
          <pre class="stream-text">${escapeText(rawContent)}</pre>
        </details>
      </section>
    `;
    const formHost = container.querySelector('#preview-form');
    const form = renderRecipeForm(formHost, recipe);
    const $status = container.querySelector('#add-status');

    container.querySelector('#btn-save-recipe').addEventListener('click', async () => {
      const r = form.getRecipe();
      if (!r.name || r.ingredients.length === 0 || r.steps.length === 0) {
        setStatus($status, '保存前请确保菜名、食材、步骤都不为空', 'error');
        return;
      }
      const btn = container.querySelector('#btn-save-recipe');
      btn.disabled = true;
      btn.textContent = '保存中…';
      try {
        await _createRecipe(r);
        setStatus($status, `已保存菜谱「${r.name}」`, 'success');
        container.querySelector('#btn-save-recipe').style.display = 'none';
        container.querySelector('#btn-reparse').style.display = 'none';
        const $btnList = container.querySelector('#btn-go-list');
        if ($btnList) $btnList.style.display = '';
        _onSaved(r);
      } catch (e) {
        setStatus($status, `保存失败：${e.message}`, 'error');
        btn.disabled = false;
        btn.textContent = '保存菜谱';
      }
    });

    container.querySelector('#btn-reparse').addEventListener('click', () => {
      renderInput();
    });
    container.querySelector('#btn-discard').addEventListener('click', () => {
      if (confirm('确定放弃当前解析结果吗？')) renderInput();
    });
  }

  // ============ 状态：错误 ============
  function showError(detail, summary, rawContent) {
    const rawSection = rawContent
      ? `<details class="stream-panel"><summary>查看 AI 原始输出</summary><pre class="stream-text">${escapeText(rawContent)}</pre></details>`
      : '';
    container.innerHTML = `
      <section class="add-view">
        <h2 class="section-title">解析失败</h2>
        <div class="status-box status-error">${escapeText(summary)}：${escapeText(detail)}</div>
        <div class="add-actions">
          <button id="btn-retry" class="btn btn-primary" type="button">返回重新输入</button>
        </div>
        ${rawSection}
      </section>
    `;
    container.querySelector('#btn-retry').addEventListener('click', () => {
      renderInput();
    });
  }
}

function setStatus($el, text, kind = 'info') {
  $el.textContent = text;
  $el.className = `status-box status-${kind}`;
}

function escapeText(s) {
  return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
