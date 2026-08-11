// 可编辑菜谱表单组件：新增预览 / 编辑 都复用
// 渲染表单到 container，返回 { getRecipe, setRecipe, destroy }

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'attrs') {
      for (const [ak, av] of Object.entries(v)) node.setAttribute(ak, av);
    } else {
      node[k] = v;
    }
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function renderRecipeForm(container, initial = {}) {
  const state = {
    name: initial.name || '',
    intro: initial.intro || '',
    ingredients: Array.isArray(initial.ingredients)
      ? initial.ingredients.map((i) => ({ name: i.name || '', amount: i.amount || '' }))
      : [{ name: '', amount: '' }],
    steps: Array.isArray(initial.steps) ? [...initial.steps] : [''],
    tips: initial.tips || '',
  };

  container.innerHTML = '';
  const form = el('div', { class: 'recipe-form' });

  // 菜名
  form.appendChild(
    el('div', { class: 'field' }, [
      el('label', {}, '菜名'),
      el('input', {
        class: 'rf-name',
        attrs: { type: 'text' },
        value: state.name,
        oninput: (e) => (state.name = e.target.value),
      }),
    ])
  );

  // 简介
  form.appendChild(
    el('div', { class: 'field' }, [
      el('label', {}, '简介'),
      el('textarea', {
        class: 'rf-intro',
        oninput: (e) => (state.intro = e.target.value),
      }, [state.intro])
    ])
  );

  // 食材
  const ingBox = el('div', { class: 'rf-ingredients' });
  function renderIngredients() {
    ingBox.innerHTML = '';
    ingBox.appendChild(el('label', {}, '食材'));
    state.ingredients.forEach((ing, idx) => {
      const row = el('div', { class: 'ing-row' }, [
        el('input', {
          class: 'ing-name',
          attrs: { type: 'text', placeholder: '食材名' },
          value: ing.name,
          oninput: (e) => (state.ingredients[idx].name = e.target.value),
        }),
        el('input', {
          class: 'ing-amount',
          attrs: { type: 'text', placeholder: '用量' },
          value: ing.amount,
          oninput: (e) => (state.ingredients[idx].amount = e.target.value),
        }),
        el('button', {
          class: 'btn btn-mini btn-danger',
          attrs: { type: 'button', title: '删除该食材' },
          onclick: () => {
            state.ingredients.splice(idx, 1);
            renderIngredients();
          },
        }, ['×']),
      ]);
      ingBox.appendChild(row);
    });
    ingBox.appendChild(
      el('button', {
        class: 'btn btn-mini',
        attrs: { type: 'button' },
        onclick: () => {
          state.ingredients.push({ name: '', amount: '' });
          renderIngredients();
        },
      }, ['+ 添加食材'])
    );
  }
  renderIngredients();
  form.appendChild(ingBox);

  // 步骤
  const stepBox = el('div', { class: 'rf-steps' });
  function renderSteps() {
    stepBox.innerHTML = '';
    stepBox.appendChild(el('label', {}, '步骤'));
    state.steps.forEach((step, idx) => {
      const row = el('div', { class: 'step-row' }, [
        el('span', { class: 'step-idx' }, [`${idx + 1}.`]),
        el('textarea', {
          class: 'step-text',
          attrs: { placeholder: `第 ${idx + 1} 步` },
          oninput: (e) => (state.steps[idx] = e.target.value),
        }, [step]),
        el('button', {
          class: 'btn btn-mini btn-danger',
          attrs: { type: 'button', title: '删除该步骤' },
          onclick: () => {
            state.steps.splice(idx, 1);
            renderSteps();
          },
        }, ['×']),
      ]);
      stepBox.appendChild(row);
    });
    stepBox.appendChild(
      el('button', {
        class: 'btn btn-mini',
        attrs: { type: 'button' },
        onclick: () => {
          state.steps.push('');
          renderSteps();
        },
      }, ['+ 添加步骤'])
    );
  }
  renderSteps();
  form.appendChild(stepBox);

  // 小贴士
  form.appendChild(
    el('div', { class: 'field' }, [
      el('label', {}, '小贴士'),
      el('textarea', {
        class: 'rf-tips',
        oninput: (e) => (state.tips = e.target.value),
      }, [state.tips])
    ])
  );

  container.appendChild(form);

  return {
    getRecipe() {
      return {
        name: state.name.trim(),
        intro: state.intro.trim(),
        ingredients: state.ingredients
          .filter((i) => i.name.trim())
          .map((i) => ({ name: i.name.trim(), amount: i.amount.trim() || '适量' })),
        steps: state.steps.map((s) => s.trim()).filter(Boolean),
        tips: state.tips.trim(),
      };
    },
    setRecipe(r) {
      state.name = r.name || '';
      state.intro = r.intro || '';
      state.ingredients = Array.isArray(r.ingredients) && r.ingredients.length
        ? r.ingredients.map((i) => ({ name: i.name || '', amount: i.amount || '' }))
        : [{ name: '', amount: '' }];
      state.steps = Array.isArray(r.steps) && r.steps.length ? [...r.steps] : [''];
      state.tips = r.tips || '';
      container.querySelector('.rf-name').value = state.name;
      container.querySelector('.rf-intro').value = state.intro;
      container.querySelector('.rf-tips').value = state.tips;
      renderIngredients();
      renderSteps();
    },
  };
}
