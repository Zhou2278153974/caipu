import { describe, it, expect, beforeEach } from 'vitest';
import { renderRecipeForm } from '../src/views/recipe-form.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

function mount(initial) {
  const c = document.createElement('div');
  document.body.appendChild(c);
  const ctrl = renderRecipeForm(c, initial);
  return { c, ctrl };
}

describe('recipe-form - 渲染与初始值', () => {
  it('无初始值时渲染空表单（1空食材 + 1空步骤）', () => {
    const { c } = mount();
    expect(c.querySelector('.rf-name').value).toBe('');
    expect(c.querySelectorAll('.ing-row')).toHaveLength(1);
    expect(c.querySelectorAll('.step-row')).toHaveLength(1);
  });

  it('初始值正确填入', () => {
    const { c } = mount({
      name: '番茄炒蛋',
      intro: '家常',
      ingredients: [{ name: '番茄', amount: '2个' }, { name: '蛋', amount: '3个' }],
      steps: ['切', '炒'],
      tips: '快炒',
    });
    expect(c.querySelector('.rf-name').value).toBe('番茄炒蛋');
    expect(c.querySelector('.rf-intro').value).toBe('家常');
    expect(c.querySelectorAll('.ing-row')).toHaveLength(2);
    expect(c.querySelectorAll('.step-row')).toHaveLength(2);
    expect(c.querySelector('.rf-tips').value).toBe('快炒');
  });
});

describe('recipe-form - 编辑交互', () => {
  it('输入菜名更新 getRecipe', () => {
    const { c, ctrl } = mount();
    const input = c.querySelector('.rf-name');
    input.value = '新菜名';
    input.dispatchEvent(new Event('input'));
    expect(ctrl.getRecipe().name).toBe('新菜名');
  });

  it('添加食材按钮新增一行', () => {
    const { c } = mount();
    const addBtn = Array.from(c.querySelectorAll('.rf-ingredients .btn-mini')).find((b) =>
      b.textContent.includes('添加食材')
    );
    addBtn.click();
    expect(c.querySelectorAll('.ing-row')).toHaveLength(2);
  });

  it('删除食材按钮移除一行', () => {
    const { c } = mount({
      ingredients: [{ name: 'a', amount: '1' }, { name: 'b', amount: '2' }],
    });
    const delBtn = c.querySelector('.ing-row .btn-danger');
    delBtn.click();
    expect(c.querySelectorAll('.ing-row')).toHaveLength(1);
  });

  it('添加/删除步骤', () => {
    const { c } = mount();
    const addBtn = Array.from(c.querySelectorAll('.rf-steps .btn-mini')).find((b) =>
      b.textContent.includes('添加步骤')
    );
    addBtn.click();
    expect(c.querySelectorAll('.step-row')).toHaveLength(2);
    c.querySelector('.step-row .btn-danger').click();
    expect(c.querySelectorAll('.step-row')).toHaveLength(1);
  });

  it('编辑步骤文本更新 getRecipe', () => {
    const { c, ctrl } = mount();
    const ta = c.querySelector('.step-text');
    ta.value = '热锅下油';
    ta.dispatchEvent(new Event('input'));
    expect(ctrl.getRecipe().steps).toEqual(['热锅下油']);
  });
});

describe('recipe-form - getRecipe 规范化', () => {
  it('去除空白', () => {
    const { ctrl } = mount();
    ctrl.setRecipe({
      name: '  菜  ',
      intro: '  简  ',
      ingredients: [{ name: '  盐  ', amount: '  1g  ' }],
      steps: ['  步  '],
      tips: '  提  ',
    });
    const r = ctrl.getRecipe();
    expect(r.name).toBe('菜');
    expect(r.intro).toBe('简');
    expect(r.ingredients[0]).toEqual({ name: '盐', amount: '1g' });
    expect(r.steps).toEqual(['步']);
    expect(r.tips).toBe('提');
  });

  it('过滤空食材名', () => {
    const { c, ctrl } = mount({
      ingredients: [{ name: '有', amount: '1' }, { name: '', amount: '2' }],
    });
    expect(ctrl.getRecipe().ingredients).toEqual([{ name: '有', amount: '1' }]);
  });

  it('amount 为空时填"适量"', () => {
    const { ctrl } = mount({
      ingredients: [{ name: '盐', amount: '' }],
    });
    expect(ctrl.getRecipe().ingredients[0].amount).toBe('适量');
  });

  it('过滤空步骤', () => {
    const { ctrl } = mount({
      steps: ['有效步骤', '   ', ''],
    });
    expect(ctrl.getRecipe().steps).toEqual(['有效步骤']);
  });
});

describe('recipe-form - setRecipe', () => {
  it('setRecipe 覆盖整个表单', () => {
    const { c, ctrl } = mount({ name: '旧' });
    ctrl.setRecipe({
      name: '新',
      intro: '新简介',
      ingredients: [{ name: 'x', amount: 'y' }],
      steps: ['s1', 's2'],
      tips: 't',
    });
    expect(c.querySelector('.rf-name').value).toBe('新');
    expect(c.querySelectorAll('.ing-row')).toHaveLength(1);
    expect(c.querySelectorAll('.step-row')).toHaveLength(2);
  });

  it('setRecipe 空食材数组时给一行空', () => {
    const { c, ctrl } = mount();
    ctrl.setRecipe({ name: 'X', ingredients: [], steps: [] });
    expect(c.querySelectorAll('.ing-row')).toHaveLength(1);
    expect(c.querySelectorAll('.step-row')).toHaveLength(1);
  });
});
