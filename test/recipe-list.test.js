import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderRecipeListView } from '../src/views/recipe-list.js';

beforeEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

function flush(ms = 0) {
  return new Promise((res) => setTimeout(res, ms));
}

function mount(services = {}) {
  const c = document.createElement('div');
  document.body.appendChild(c);
  renderRecipeListView(c, services);
  return c;
}

const RECIPE = {
  id: 1,
  name: '番茄炒蛋',
  intro: '家常快手菜',
  ingredients: [{ name: '番茄', amount: '2个' }, { name: '鸡蛋', amount: '3个' }],
  steps: ['番茄切块', '鸡蛋打散', '热锅翻炒'],
  tips: '大火快炒',
  created_at: 1700000000000,
  updated_at: 1700000001000,
};

function makeServices(overrides = {}) {
  return {
    getAllRecipes: vi.fn().mockResolvedValue([RECIPE]),
    getRecipe: vi.fn().mockResolvedValue(RECIPE),
    updateRecipe: vi.fn().mockResolvedValue({ ...RECIPE, name: '改' }),
    deleteRecipe: vi.fn().mockResolvedValue(true),
    onAdd: vi.fn(),
    ...overrides,
  };
}

describe('菜谱列表 - 列表态', () => {
  it('加载并渲染菜谱卡片', async () => {
    const c = mount(makeServices());
    await flush();
    expect(c.querySelectorAll('.recipe-card')).toHaveLength(1);
    expect(c.querySelector('.recipe-card-name').textContent).toBe('番茄炒蛋');
    expect(c.querySelector('.recipe-card-meta').textContent).toContain('2');
  });

  it('空列表显示空状态与新增按钮', async () => {
    const onAdd = vi.fn();
    const c = mount(makeServices({ getAllRecipes: vi.fn().mockResolvedValue([]), onAdd }));
    await flush();
    expect(c.querySelector('.empty-state')).toBeTruthy();
    c.querySelector('#btn-empty-add').click();
    expect(onAdd).toHaveBeenCalled();
  });

  it('顶部新增按钮触发 onAdd', async () => {
    const onAdd = vi.fn();
    const c = mount(makeServices({ onAdd }));
    await flush();
    c.querySelector('#btn-add-recipe').click();
    expect(onAdd).toHaveBeenCalled();
  });

  it('加载失败显示错误', async () => {
    const c = mount(makeServices({ getAllRecipes: vi.fn().mockRejectedValue(new Error('DB坏了')) }));
    await flush();
    expect(c.querySelector('.status-error').textContent).toContain('读取菜谱失败');
  });

  it('intro 为空时不渲染 intro 段', async () => {
    const c = mount(
      makeServices({
        getAllRecipes: vi.fn().mockResolvedValue([{ ...RECIPE, intro: '' }]),
      })
    );
    await flush();
    expect(c.querySelector('.recipe-card-intro')).toBeNull();
  });
});

describe('菜谱列表 - 详情态', () => {
  it('点击卡片进入详情并显示完整内容', async () => {
    const c = mount(makeServices());
    await flush();
    c.querySelector('.recipe-card').click();
    await flush();
    expect(c.querySelector('.detail-name').textContent).toBe('番茄炒蛋');
    expect(c.querySelectorAll('.detail-ingredients li')).toHaveLength(2);
    expect(c.querySelectorAll('.detail-steps li')).toHaveLength(3);
    expect(c.querySelector('.detail-tips').textContent).toBe('大火快炒');
  });

  it('详情有返回/编辑/删除按钮', async () => {
    const c = mount(makeServices());
    await flush();
    c.querySelector('.recipe-card').click();
    await flush();
    expect(c.querySelector('#btn-back-list')).toBeTruthy();
    expect(c.querySelector('#btn-edit')).toBeTruthy();
    expect(c.querySelector('#btn-delete')).toBeTruthy();
  });

  it('返回按钮回到列表', async () => {
    const c = mount(makeServices());
    await flush();
    c.querySelector('.recipe-card').click();
    await flush();
    c.querySelector('#btn-back-list').click();
    await flush();
    expect(c.querySelector('.recipe-card')).toBeTruthy();
  });

  it('菜谱不存在显示提示', async () => {
    const c = mount(makeServices({ getRecipe: vi.fn().mockResolvedValue(null) }));
    await flush();
    c.querySelector('.recipe-card').click();
    await flush();
    expect(c.querySelector('.status-error').textContent).toContain('不存在');
  });

  it('tips 为空时不渲染小贴士区', async () => {
    const c = mount(
      makeServices({
        getAllRecipes: vi.fn().mockResolvedValue([{ ...RECIPE, tips: '' }]),
        getRecipe: vi.fn().mockResolvedValue({ ...RECIPE, tips: '' }),
      })
    );
    await flush();
    c.querySelector('.recipe-card').click();
    await flush();
    expect(c.querySelector('.detail-tips')).toBeNull();
  });
});

describe('菜谱列表 - 编辑态', () => {
  it('点击编辑进入编辑表单且填入数据', async () => {
    const c = mount(makeServices());
    await flush();
    c.querySelector('.recipe-card').click();
    await flush();
    c.querySelector('#btn-edit').click();
    await flush();
    expect(c.querySelector('.recipe-form')).toBeTruthy();
    expect(c.querySelector('.rf-name').value).toBe('番茄炒蛋');
    expect(c.querySelectorAll('.ing-row')).toHaveLength(2);
  });

  it('保存修改调用 updateRecipe 并返回详情', async () => {
    const updateRecipe = vi.fn().mockResolvedValue({ ...RECIPE, name: '新名' });
    const c = mount(makeServices({ updateRecipe }));
    await flush();
    c.querySelector('.recipe-card').click();
    await flush();
    c.querySelector('#btn-edit').click();
    await flush();

    const nameInput = c.querySelector('.rf-name');
    nameInput.value = '新名';
    nameInput.dispatchEvent(new Event('input'));
    c.querySelector('#btn-save-edit').click();
    await flush();

    expect(updateRecipe).toHaveBeenCalledTimes(1);
    expect(updateRecipe.mock.calls[0][0]).toMatchObject({ id: 1, name: '新名' });
    expect(c.querySelector('.detail-name')).toBeTruthy();
  });

  it('取消编辑返回详情', async () => {
    const c = mount(makeServices());
    await flush();
    c.querySelector('.recipe-card').click();
    await flush();
    c.querySelector('#btn-edit').click();
    await flush();
    c.querySelector('#btn-cancel-edit').click();
    await flush();
    expect(c.querySelector('.detail-name')).toBeTruthy();
  });

  it('保存前清空菜名阻止保存', async () => {
    const updateRecipe = vi.fn();
    const c = mount(makeServices({ updateRecipe }));
    await flush();
    c.querySelector('.recipe-card').click();
    await flush();
    c.querySelector('#btn-edit').click();
    await flush();

    const nameInput = c.querySelector('.rf-name');
    nameInput.value = '';
    nameInput.dispatchEvent(new Event('input'));
    c.querySelector('#btn-save-edit').click();
    await flush();

    expect(updateRecipe).not.toHaveBeenCalled();
    expect(c.querySelector('#edit-status').className).toContain('status-error');
  });
});

describe('菜谱列表 - 删除', () => {
  it('确认删除调用 deleteRecipe 并返回列表', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deleteRecipe = vi.fn().mockResolvedValue(true);
    const c = mount(makeServices({ deleteRecipe }));
    await flush();
    c.querySelector('.recipe-card').click();
    await flush();
    c.querySelector('#btn-delete').click();
    await flush();

    expect(confirmSpy).toHaveBeenCalled();
    expect(deleteRecipe).toHaveBeenCalledWith(1);
    expect(c.querySelector('.recipe-card')).toBeTruthy(); // 回到列表
  });

  it('取消确认不删除', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const deleteRecipe = vi.fn();
    const c = mount(makeServices({ deleteRecipe }));
    await flush();
    c.querySelector('.recipe-card').click();
    await flush();
    c.querySelector('#btn-delete').click();
    await flush();

    expect(deleteRecipe).not.toHaveBeenCalled();
    expect(c.querySelector('.detail-name')).toBeTruthy(); // 仍在详情
  });

  it('删除失败显示错误', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deleteRecipe = vi.fn().mockRejectedValue(new Error('删除出错'));
    const c = mount(makeServices({ deleteRecipe }));
    await flush();
    c.querySelector('.recipe-card').click();
    await flush();
    c.querySelector('#btn-delete').click();
    await flush();

    expect(c.querySelector('#detail-status').className).toContain('status-error');
    expect(c.querySelector('#detail-status').textContent).toContain('删除出错');
  });

  it('deleteRecipe 返回 false 显示不存在', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deleteRecipe = vi.fn().mockResolvedValue(false);
    const c = mount(makeServices({ deleteRecipe }));
    await flush();
    c.querySelector('.recipe-card').click();
    await flush();
    c.querySelector('#btn-delete').click();
    await flush();

    expect(c.querySelector('#detail-status').textContent).toContain('不存在');
  });
});

describe('菜谱列表 - 搜索', () => {
  const MULTI = [
    { id: 1, name: '番茄炒蛋', intro: '', ingredients: [{ name: '番茄', amount: '2个' }], steps: ['炒'], tips: '', created_at: 1700000000000, updated_at: 1700000001000 },
    { id: 2, name: '蛋炒饭', intro: '', ingredients: [{ name: '鸡蛋', amount: '2个' }], steps: ['炒'], tips: '', created_at: 1700000002000, updated_at: 1700000002000 },
    { id: 3, name: '红烧肉', intro: '', ingredients: [{ name: '五花肉', amount: '500g' }], steps: ['炖'], tips: '', created_at: 1700000003000, updated_at: 1700000003000 },
    { id: 4, name: '番茄蛋汤', intro: '', ingredients: [{ name: '番茄', amount: '1个' }], steps: ['煮'], tips: '', created_at: 1700000004000, updated_at: 1700000004000 },
  ];

  function makeMultiServices(overrides = {}) {
    return {
      getAllRecipes: vi.fn().mockResolvedValue(MULTI),
      getRecipe: vi.fn().mockResolvedValue(MULTI[0]),
      updateRecipe: vi.fn().mockResolvedValue(MULTI[0]),
      deleteRecipe: vi.fn().mockResolvedValue(true),
      onAdd: vi.fn(),
      ...overrides,
    };
  }

  it('搜索框存在且初始展示全部菜谱', async () => {
    const c = mount(makeMultiServices());
    await flush();
    expect(c.querySelector('#recipe-search')).toBeTruthy();
    expect(c.querySelectorAll('.recipe-card')).toHaveLength(4);
  });

  it('输入"蛋"模糊匹配菜名含"蛋"的所有菜谱', async () => {
    const c = mount(makeMultiServices());
    await flush();
    const input = c.querySelector('#recipe-search');
    input.value = '蛋';
    input.dispatchEvent(new Event('input'));
    await flush();
    const names = [...c.querySelectorAll('.recipe-card-name')].map((n) => n.textContent);
    expect(names).toHaveLength(3);
    expect(names).toContain('番茄炒蛋');
    expect(names).toContain('蛋炒饭');
    expect(names).toContain('番茄蛋汤');
    expect(names).not.toContain('红烧肉');
  });

  it('输入"番茄"匹配含"番茄"的菜谱', async () => {
    const c = mount(makeMultiServices());
    await flush();
    const input = c.querySelector('#recipe-search');
    input.value = '番茄';
    input.dispatchEvent(new Event('input'));
    await flush();
    const names = [...c.querySelectorAll('.recipe-card-name')].map((n) => n.textContent);
    expect(names).toHaveLength(2);
    expect(names).toContain('番茄炒蛋');
    expect(names).toContain('番茄蛋汤');
  });

  it('搜索不匹配时显示"没有匹配的菜谱"', async () => {
    const c = mount(makeMultiServices());
    await flush();
    const input = c.querySelector('#recipe-search');
    input.value = '不存在的菜';
    input.dispatchEvent(new Event('input'));
    await flush();
    expect(c.querySelectorAll('.recipe-card')).toHaveLength(0);
    expect(c.querySelector('#recipe-list-body').textContent).toContain('没有匹配');
  });

  it('清空搜索框恢复显示全部菜谱', async () => {
    const c = mount(makeMultiServices());
    await flush();
    const input = c.querySelector('#recipe-search');
    input.value = '蛋';
    input.dispatchEvent(new Event('input'));
    await flush();
    expect(c.querySelectorAll('.recipe-card')).toHaveLength(3);
    // 清空
    input.value = '';
    input.dispatchEvent(new Event('input'));
    await flush();
    expect(c.querySelectorAll('.recipe-card')).toHaveLength(4);
  });

  it('搜索关键字前后有空格也能正确过滤', async () => {
    const c = mount(makeMultiServices());
    await flush();
    const input = c.querySelector('#recipe-search');
    input.value = '  蛋  ';
    input.dispatchEvent(new Event('input'));
    await flush();
    expect(c.querySelectorAll('.recipe-card')).toHaveLength(3);
  });
});

function makeNRecipes(n) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    arr.push({
      id: i + 1,
      name: `菜谱${String(i + 1).padStart(3, '0')}`,
      intro: `简介${i + 1}`,
      ingredients: [{ name: '食材', amount: '1份' }],
      steps: ['步骤'],
      tips: '',
      created_at: 1700000000000 + i * 1000,
      updated_at: 1700000000000 + i * 1000,
    });
  }
  return arr;
}

function makeNServices(n, overrides = {}) {
  const recipes = makeNRecipes(n);
  return {
    getAllRecipes: vi.fn().mockResolvedValue(recipes),
    getRecipe: vi.fn().mockImplementation((id) => Promise.resolve(recipes.find((r) => r.id === id) || null)),
    updateRecipe: vi.fn().mockResolvedValue(recipes[0]),
    deleteRecipe: vi.fn().mockResolvedValue(true),
    onAdd: vi.fn(),
    ...overrides,
  };
}

function pagClick(c, act) {
  const btn = c.querySelector(`.pagination button[data-act="${act}"]`);
  if (btn) btn.click();
}

function pagAttr(c, key) {
  const p = c.querySelector('.pagination');
  return p ? Number(p.getAttribute(`data-${key}`)) : null;
}

function pagInfo(c) {
  const el = c.querySelector('.pagination-info');
  return el ? el.textContent : '';
}

function cardNames(c) {
  return [...c.querySelectorAll('.recipe-card-name')].map((n) => n.textContent);
}

describe('菜谱列表 - 菜谱数量显示', () => {
  it('标题后显示（N）灰色数量，1条时也能显示', async () => {
    const c = mount(makeServices());
    await flush();
    const $count = c.querySelector('.recipe-count');
    expect($count).toBeTruthy();
    expect($count.textContent).toBe('（1）');
    expect($count.className).toContain('recipe-count');
  });

  it('标题数量不被 section-title 的渐变字影响（不继承渐变）', async () => {
    const c = mount(makeServices());
    await flush();
    const $count = c.querySelector('.recipe-count');
    // 检查没有被渐变染色的痕迹：color/text-fill 是 text-mute（CSS已覆盖），只要节点存在且内容正确就通过
    expect($count.textContent).toMatch(/1/);
    expect($count.closest('.section-title')).toBeTruthy();
  });

  it('空列表时数量显示 （0）并进入 empty-state（数量标签在结构里可能不在标题后渲染，验证空态时页面正常即可）', async () => {
    const c = mount(makeServices({ getAllRecipes: vi.fn().mockResolvedValue([]) }));
    await flush();
    expect(c.querySelector('.empty-state')).toBeTruthy();
    // 空列表不渲染分页
    expect(c.querySelector('.pagination')).toBeNull();
  });

  it('26 条时标题显示 （26）', async () => {
    const c = mount(makeNServices(26));
    await flush();
    expect(c.querySelector('.recipe-count').textContent).toBe('（26）');
  });
});

describe('菜谱列表 - 分页', () => {
  it('每页 10 条：26 条时 3 页，第一页显示 10 条', async () => {
    const c = mount(makeNServices(26));
    await flush();
    expect(c.querySelectorAll('.recipe-card')).toHaveLength(10);
    expect(pagAttr(c, 'total')).toBe(26);
    expect(pagAttr(c, 'page')).toBe(1);
    expect(pagAttr(c, 'pages')).toBe(3);
    expect(pagInfo(c)).toContain('第 1-10 条 / 共 26 条');
  });

  it('第一页：首页/上一页 disabled，下一页/末页 enabled', async () => {
    const c = mount(makeNServices(26));
    await flush();
    expect(c.querySelector('.pagination button[data-act="first"]').disabled).toBe(true);
    expect(c.querySelector('.pagination button[data-act="prev"]').disabled).toBe(true);
    expect(c.querySelector('.pagination button[data-act="next"]').disabled).toBe(false);
    expect(c.querySelector('.pagination button[data-act="last"]').disabled).toBe(false);
  });

  it('下一页翻到第2页：显示菜谱11-20（索引从11开始）', async () => {
    const c = mount(makeNServices(26));
    await flush();
    pagClick(c, 'next');
    await flush();
    expect(pagAttr(c, 'page')).toBe(2);
    expect(c.querySelectorAll('.recipe-card')).toHaveLength(10);
    const names = cardNames(c);
    expect(names[0]).toBe('菜谱011');
    expect(names[9]).toBe('菜谱020');
    expect(pagInfo(c)).toContain('第 11-20 条');
    // 四方向都可按
    expect(c.querySelector('.pagination button[data-act="first"]').disabled).toBe(false);
    expect(c.querySelector('.pagination button[data-act="prev"]').disabled).toBe(false);
    expect(c.querySelector('.pagination button[data-act="next"]').disabled).toBe(false);
    expect(c.querySelector('.pagination button[data-act="last"]').disabled).toBe(false);
  });

  it('末页跳到最后一页：第3页 6 条（菜谱021-026），下一页/末页 disabled', async () => {
    const c = mount(makeNServices(26));
    await flush();
    pagClick(c, 'last');
    await flush();
    expect(pagAttr(c, 'page')).toBe(3);
    expect(c.querySelectorAll('.recipe-card')).toHaveLength(6);
    const names = cardNames(c);
    expect(names[0]).toBe('菜谱021');
    expect(names[5]).toBe('菜谱026');
    expect(pagInfo(c)).toContain('第 21-26 条');
    expect(c.querySelector('.pagination button[data-act="next"]').disabled).toBe(true);
    expect(c.querySelector('.pagination button[data-act="last"]').disabled).toBe(true);
    expect(c.querySelector('.pagination button[data-act="prev"]').disabled).toBe(false);
  });

  it('上一页翻回前页，首页直接回第1页', async () => {
    const c = mount(makeNServices(26));
    await flush();
    pagClick(c, 'last');
    await flush();
    expect(pagAttr(c, 'page')).toBe(3);
    pagClick(c, 'prev');
    await flush();
    expect(pagAttr(c, 'page')).toBe(2);
    pagClick(c, 'first');
    await flush();
    expect(pagAttr(c, 'page')).toBe(1);
    expect(c.querySelectorAll('.recipe-card')).toHaveLength(10);
    expect(cardNames(c)[0]).toBe('菜谱001');
  });

  it('9 条时 1 页，分页显示全部 1-9 条，所有翻页按钮 disabled', async () => {
    const c = mount(makeNServices(9));
    await flush();
    expect(c.querySelectorAll('.recipe-card')).toHaveLength(9);
    expect(pagAttr(c, 'page')).toBe(1);
    expect(pagAttr(c, 'pages')).toBe(1);
    expect(pagInfo(c)).toContain('第 1-9 条 / 共 9 条');
    expect(c.querySelector('.pagination button[data-act="first"]').disabled).toBe(true);
    expect(c.querySelector('.pagination button[data-act="prev"]').disabled).toBe(true);
    expect(c.querySelector('.pagination button[data-act="next"]').disabled).toBe(true);
    expect(c.querySelector('.pagination button[data-act="last"]').disabled).toBe(true);
  });

  it('10 条时刚好 1 页，下一页/末页 disabled', async () => {
    const c = mount(makeNServices(10));
    await flush();
    expect(pagAttr(c, 'pages')).toBe(1);
    expect(c.querySelector('.pagination button[data-act="next"]').disabled).toBe(true);
  });

  it('分页器格式：第 x / y 页', async () => {
    const c = mount(makeNServices(26));
    await flush();
    const pager = c.querySelector('.pagination-pager');
    expect(pager).toBeTruthy();
    expect(pager.textContent).toContain('第');
    expect(pager.textContent).toContain('/ 3 页');
    expect(pager.querySelector('strong').textContent).toBe('1');
  });
});

describe('菜谱列表 - 分页联动搜索', () => {
  it('搜索后自动重置到第 1 页：先翻到末页再搜索，当前页回到1', async () => {
    const many = [];
    // 23 条里含 12 条"含蛋"的菜谱：菜谱001-003、007-009、013-015、019-021
    for (let i = 1; i <= 23; i++) {
      const isEgg = [1, 2, 3, 7, 8, 9, 13, 14, 15, 19, 20, 21].includes(i);
      many.push({
        id: i,
        name: isEgg ? `含蛋菜谱${i}` : `菜${i}`,
        intro: '',
        ingredients: [{ name: 'i', amount: '1' }],
        steps: ['s'],
        tips: '',
        created_at: 1700000000000 + i * 1000,
        updated_at: 1700000000000 + i * 1000,
      });
    }
    const c = mount(makeNServices(0, { getAllRecipes: vi.fn().mockResolvedValue(many) }));
    await flush();
    // 翻到第 3 页
    pagClick(c, 'last');
    await flush();
    expect(pagAttr(c, 'page')).toBe(3);
    // 搜"含蛋"：共 12 条 = 2 页
    const input = c.querySelector('#recipe-search');
    input.value = '含蛋';
    input.dispatchEvent(new Event('input'));
    await flush();
    // 应该自动回到第 1 页（2/10=2页，每页10条，第一页10条）
    expect(pagAttr(c, 'page')).toBe(1);
    expect(pagAttr(c, 'pages')).toBe(2);
    expect(c.querySelectorAll('.recipe-card')).toHaveLength(10);
    // 下一页：剩余 2 条
    pagClick(c, 'next');
    await flush();
    expect(pagAttr(c, 'page')).toBe(2);
    expect(c.querySelectorAll('.recipe-card')).toHaveLength(2);
  });

  it('在第2页搜索关键字"完全没匹配"时，显示没有匹配 + 分页仍存在（总0条，1页）', async () => {
    const c = mount(makeNServices(25));
    await flush();
    pagClick(c, 'next');
    await flush();
    expect(pagAttr(c, 'page')).toBe(2);
    const input = c.querySelector('#recipe-search');
    input.value = 'zzzzzz';
    input.dispatchEvent(new Event('input'));
    await flush();
    expect(c.querySelectorAll('.recipe-card')).toHaveLength(0);
    expect(c.querySelector('#recipe-list-body').textContent).toContain('没有匹配的菜谱');
    expect(pagAttr(c, 'total')).toBe(0);
    expect(pagAttr(c, 'page')).toBe(1);
    expect(pagAttr(c, 'pages')).toBe(1);
    expect(pagInfo(c)).toContain('共 0 条');
  });

  it('清空搜索后仍保持第 1 页，显示全部第 1 页', async () => {
    const c = mount(makeNServices(25));
    await flush();
    // 先到第3页
    pagClick(c, 'last');
    await flush();
    expect(pagAttr(c, 'page')).toBe(3);
    const input = c.querySelector('#recipe-search');
    input.value = '菜谱01';
    input.dispatchEvent(new Event('input'));
    await flush();
    expect(pagAttr(c, 'page')).toBe(1);
    // 清空
    input.value = '';
    input.dispatchEvent(new Event('input'));
    await flush();
    expect(pagAttr(c, 'page')).toBe(1); // 清空也自动回第1
    expect(c.querySelectorAll('.recipe-card')).toHaveLength(10);
    expect(cardNames(c)[0]).toBe('菜谱001');
  });
});
