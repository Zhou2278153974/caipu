// 我的冰箱视图壳：列表 / 添加子视图切换（同菜谱模块结构）
//   - 列表视图：顶部标题「我的冰箱」+ 总数计数，右上角「+ 添加食材」按钮；
//     上方为食材总览（总数 + 最近添加 5 条），下方为各项食材列表（编辑 / 删除）
//   - 添加视图：「手动添加」 / 「AI 识别添加」两个独立子页，带「← 返回」按钮
//   - 编辑复用「手动添加」子页（预填 + 保存修改）
//   - 依赖通过 services 注入，便于测试
import { renderFridgeListView } from './fridge-list.js';
import { renderFridgeAddView } from './fridge-add.js';
import {
  getApiConfig,
  getAllFridgeIngredients,
  getFridgeIngredient,
  addFridgeIngredient,
  updateFridgeIngredient,
  deleteFridgeIngredient,
} from '../db.js';
import { streamChat, fileToDataUrl } from '../ai-client.js';
import { aiErrorMessage } from '../ui-utils.js';

export function renderFridgeView(container, services = {}) {
  const injected = {
    getApiConfig: services.getApiConfig || getApiConfig,
    getAllFridgeIngredients: services.getAllFridgeIngredients || getAllFridgeIngredients,
    getFridgeIngredient: services.getFridgeIngredient || getFridgeIngredient,
    addFridgeIngredient: services.addFridgeIngredient || addFridgeIngredient,
    updateFridgeIngredient: services.updateFridgeIngredient || updateFridgeIngredient,
    deleteFridgeIngredient: services.deleteFridgeIngredient || deleteFridgeIngredient,
    streamChat: services.streamChat || streamChat,
    fileToDataUrl: services.fileToDataUrl || fileToDataUrl,
    aiErrorMessage: services.aiErrorMessage || aiErrorMessage,
    goToView: services.goToView,
  };

  let current = 'list';   // 'list' | 'add'
  let addMode = 'manual'; // 'manual' | 'ai'
  let editId = null;      // 非空表示编辑模式（复用手动添加页）
  // 从添加页返回后要在列表页展示的状态提示
  let listStatus = null;  // { text, kind }

  function render() {
    container.innerHTML = '';
    if (current === 'list') {
      const host = document.createElement('div');
      container.appendChild(host);
      renderFridgeListView(host, {
        ...injected,
        initialStatus: listStatus,
        onAdd: (mode) => { addMode = mode; editId = null; current = 'add'; render(); },
        onEdit: (id) => { addMode = 'manual'; editId = id; current = 'add'; render(); },
      });
      listStatus = null;
    } else {
      // 返回按钮（同菜谱模块新增子视图）
      const back = document.createElement('div');
      back.className = 'sub-nav';
      back.innerHTML = `<button class="btn btn-back" type="button">← 返回我的冰箱</button>`;
      back.querySelector('button').addEventListener('click', () => {
        current = 'list';
        render();
      });
      container.appendChild(back);

      const host = document.createElement('div');
      container.appendChild(host);
      renderFridgeAddView(host, {
        ...injected,
        mode: addMode,
        editId,
        onDone: (status) => {
          listStatus = status || null;
          current = 'list';
          render();
        },
      });
    }
  }

  render();
}
