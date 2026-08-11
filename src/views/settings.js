// 设置视图：API 配置（base_url / api_key / 模型名）+ 拉取模型按钮
// 依赖通过 services 注入，便于测试
import { getApiConfig, saveApiConfig } from '../db.js';
import { fetchModels } from '../ai-client.js';
import { aiErrorMessage } from '../ui-utils.js';

export function renderSettingsView(container, services = {}) {
  const _getApiConfig = services.getApiConfig || getApiConfig;
  const _saveApiConfig = services.saveApiConfig || saveApiConfig;
  const _fetchModels = services.fetchModels || fetchModels;

  container.innerHTML = `
    <section class="settings-view">
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

  const $base = container.querySelector('#cfg-base-url');
  const $key = container.querySelector('#cfg-api-key');
  const $modelSelect = container.querySelector('#cfg-model-select');
  const $modelManual = container.querySelector('#cfg-model-manual');
  const $btnFetch = container.querySelector('#btn-fetch-models');
  const $btnSave = container.querySelector('#btn-save-config');
  const $status = container.querySelector('#cfg-status');

  // 暂存下拉里的模型列表，便于回填 select
  let fetchedModelIds = [];

  function setStatus(text, kind = 'info') {
    $status.textContent = text;
    $status.className = `status-box status-${kind}`;
  }

  /** 从当前表单得到 model 值（手动输入优先，否则用下拉） */
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

  /** 同步 select 选项：按已拉取模型重建 */
  function populateModelSelect(models, savedModel) {
    fetchedModelIds = models.map((m) => m.id);
    const options = ['<option value="">（未拉取，可在下方手动输入）</option>'].concat(
      models.map((m) => `<option value="${escapeAttr(m.id)}">${escapeText(m.id)}</option>`)
    );
    $modelSelect.innerHTML = options.join('');
    // 若存在 savedModel：若在列表中则选中；若不在列表则放入手动输入框
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

  // 加载已存配置
  _getApiConfig().then((cfg) => {
    $base.value = cfg.base_url || '';
    $key.value = cfg.api_key || '';
    // 初始加载：如果配置里有 model，但模型列表还没拉取（select 只有占位）
    // 则把 model 放到手动输入框
    if (cfg.model) {
      // 尝试看下 select 里有匹配的（理论上只有占位 option），没有就放手动框
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
      await _saveApiConfig(currentConfig());
      setStatus('配置已保存', 'success');
    } catch (e) {
      setStatus(`保存失败：${e.message}`, 'error');
    }
  });

  $btnFetch.addEventListener('click', async () => {
    // 取当前配置（注意：下拉与手动输入共同决定 model）
    const currentSavedCfg = await _getApiConfig().catch(() => ({}));
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
      const models = await _fetchModels({ base_url: cfg.base_url, api_key: cfg.api_key });
      // 重建 select 选项
      populateModelSelect(models, cfg.model);

      if (models.length === 0) {
        setStatus('拉取成功，但返回的模型列表为空。（可在手动输入框中自定义）', 'warning');
      } else {
        // 拉取成功后，默认选中下拉的第一个（除非用户已经手动填了别的）
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

function escapeText(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
function escapeAttr(s) {
  return escapeText(s).replace(/"/g, '&quot;');
}
