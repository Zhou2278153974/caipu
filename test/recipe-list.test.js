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
