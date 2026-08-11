// 菜谱视图壳：列表 / 新增 子视图切换
import { renderRecipeAddView } from './recipe-add.js';
import { renderRecipeListView } from './recipe-list.js';

export function renderRecipesView(container) {
  let current = 'list';

  function render() {
    container.innerHTML = '';
    if (current === 'add') {
      const addHost = document.createElement('div');
      container.appendChild(addHost);
      renderRecipeAddView(addHost, {
        onSaved: () => {
          current = 'list';
          render();
        },
      });
      // 返回列表按钮
      const back = document.createElement('div');
      back.className = 'sub-nav';
      back.innerHTML = `<button class="btn btn-back" type="button">← 返回菜谱列表</button>`;
      back.querySelector('button').addEventListener('click', () => {
        current = 'list';
        render();
      });
      container.insertBefore(back, addHost);
    } else {
      const listHost = document.createElement('div');
      container.appendChild(listHost);
      renderRecipeListView(listHost, {
        onAdd: () => {
          current = 'add';
          render();
        },
      });
    }
  }

  render();
}
