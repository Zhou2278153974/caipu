import { describe, it, expect } from 'vitest';
import {
  RECIPE_SYSTEM_PROMPT,
  buildUserMessage,
  parseRecipeResponse,
  validateRecipe,
} from '../src/recipe-parser.js';

describe('菜谱解析器 - buildUserMessage', () => {
  it('纯文字消息', () => {
    const msg = buildUserMessage({ text: '番茄炒蛋：番茄2个，鸡蛋3个...' });
    expect(msg.role).toBe('user');
    expect(msg.content).toHaveLength(1);
    expect(msg.content[0].type).toBe('text');
  });

  it('纯图片消息（自动补默认文字提示）', () => {
    const msg = buildUserMessage({ imageDataUrl: 'data:image/png;base64,xxx' });
    expect(msg.content).toHaveLength(2);
    expect(msg.content[0].type).toBe('image_url');
    expect(msg.content[0].image_url.url).toBe('data:image/png;base64,xxx');
    expect(msg.content[1].type).toBe('text');
  });

  it('图片+文字消息', () => {
    const msg = buildUserMessage({
      text: '帮我整理这个菜谱',
      imageDataUrl: 'data:image/png;base64,xxx',
    });
    expect(msg.content).toHaveLength(2);
    expect(msg.content[0].type).toBe('image_url');
    expect(msg.content[1].text).toBe('帮我整理这个菜谱');
  });

  it('两者都缺抛错', () => {
    expect(() => buildUserMessage({})).toThrow(/至少需要/);
  });

  it('系统提示词非空且包含 JSON 结构说明', () => {
    expect(RECIPE_SYSTEM_PROMPT).toContain('JSON');
    expect(RECIPE_SYSTEM_PROMPT).toContain('ingredients');
    expect(RECIPE_SYSTEM_PROMPT).toContain('steps');
  });
});

describe('菜谱解析器 - parseRecipeResponse', () => {
  it('合法 JSON 直接解析', () => {
    const raw = JSON.stringify({
      name: '番茄炒蛋',
      intro: '家常菜',
      ingredients: [{ name: '番茄', amount: '2个' }, { name: '鸡蛋', amount: '3个' }],
      steps: ['番茄切块', '鸡蛋打散下锅', '加入番茄翻炒'],
      tips: '大火快炒',
    });
    const r = parseRecipeResponse(raw);
    expect(r.valid).toBe(true);
    expect(r.recipe.name).toBe('番茄炒蛋');
    expect(r.recipe.ingredients).toHaveLength(2);
    expect(r.recipe.steps).toHaveLength(3);
  });

  it('容忍 ```json 代码块包裹', () => {
    const raw = '好的，这是整理后的菜谱：\n```json\n{"name":"测试","ingredients":[{"name":"盐","amount":"少许"}],"steps":["放盐"],"intro":"","tips":""}\n```\n希望你喜欢';
    const r = parseRecipeResponse(raw);
    expect(r.valid).toBe(true);
    expect(r.recipe.name).toBe('测试');
  });

  it('容忍 ``` 普通代码块包裹', () => {
    const raw = '```\n{"name":"X","ingredients":[{"name":"a","amount":"1"}],"steps":["s"],"intro":"","tips":""}\n```';
    const r = parseRecipeResponse(raw);
    expect(r.valid).toBe(true);
  });

  it('从前后多余文字中提取 JSON', () => {
    const raw = '这是结果：{"name":"Y","ingredients":[{"name":"b","amount":"2"}],"steps":["x"],"intro":"","tips":""} 谢谢';
    const r = parseRecipeResponse(raw);
    expect(r.valid).toBe(true);
    expect(r.recipe.name).toBe('Y');
  });

  it('非法 JSON 返回 valid=false 与错误信息', () => {
    const r = parseRecipeResponse('这根本不是JSON');
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/不是合法 JSON/);
    expect(r.recipe).toBeNull();
  });

  it('菜名为空标记无效', () => {
    const r = parseRecipeResponse(JSON.stringify({
      name: '   ',
      ingredients: [{ name: 'a', amount: '1' }],
      steps: ['s'],
    }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('菜名'))).toBe(true);
  });

  it('食材为空标记无效', () => {
    const r = parseRecipeResponse(JSON.stringify({
      name: 'X',
      ingredients: [],
      steps: ['s'],
    }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('食材'))).toBe(true);
  });

  it('步骤为空标记无效', () => {
    const r = parseRecipeResponse(JSON.stringify({
      name: 'X',
      ingredients: [{ name: 'a', amount: '1' }],
      steps: [],
    }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('步骤'))).toBe(true);
  });

  it('食材 amount 缺失时填"适量"', () => {
    const r = parseRecipeResponse(JSON.stringify({
      name: 'X',
      ingredients: [{ name: '盐' }],
      steps: ['s'],
    }));
    expect(r.valid).toBe(true);
    expect(r.recipe.ingredients[0].amount).toBe('适量');
  });

  it('过滤空步骤和空食材', () => {
    const r = parseRecipeResponse(JSON.stringify({
      name: 'X',
      ingredients: [{ name: '盐', amount: '1' }, { name: '', amount: '' }, { name: '油', amount: '2' }],
      steps: ['步骤1', '   ', '', '步骤2'],
    }));
    expect(r.valid).toBe(true);
    expect(r.recipe.ingredients).toHaveLength(2);
    expect(r.recipe.steps).toEqual(['步骤1', '步骤2']);
  });

  it('intro/tips 缺失时为空字符串', () => {
    const r = parseRecipeResponse(JSON.stringify({
      name: 'X',
      ingredients: [{ name: 'a', amount: '1' }],
      steps: ['s'],
    }));
    expect(r.valid).toBe(true);
    expect(r.recipe.intro).toBe('');
    expect(r.recipe.tips).toBe('');
  });

  it('AI 判定非菜谱时（全空）返回 invalid', () => {
    const r = parseRecipeResponse(JSON.stringify({
      name: '',
      ingredients: [],
      steps: [],
      intro: '',
      tips: '',
    }));
    expect(r.valid).toBe(false);
  });

  it('响应不是对象（数组）标记无效', () => {
    const r = parseRecipeResponse('[1,2,3]');
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/不是 JSON 对象/);
  });

  it('保留 raw 原文', () => {
    const raw = '```json\n{"name":"X","ingredients":[{"name":"a","amount":"1"}],"steps":["s"],"intro":"","tips":""}\n```';
    const r = parseRecipeResponse(raw);
    expect(r.raw).toBe(raw);
  });
});

describe('菜谱解析器 - validateRecipe 直接调用', () => {
  it('非对象输入', () => {
    expect(validateRecipe(null).valid).toBe(false);
    expect(validateRecipe('string').valid).toBe(false);
    expect(validateRecipe([1, 2]).valid).toBe(false);
  });

  it('收集多个错误', () => {
    const r = validateRecipe({ name: '', ingredients: [], steps: [] });
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });

  it('合法对象返回规范化 recipe', () => {
    const r = validateRecipe({
      name: ' 测试菜 ',
      intro: '  简介  ',
      ingredients: [{ name: ' 食材 ', amount: ' 1g ' }],
      steps: [' 步骤 '],
      tips: ' 提示 ',
    });
    expect(r.valid).toBe(true);
    expect(r.recipe.name).toBe('测试菜');
    expect(r.recipe.ingredients[0]).toEqual({ name: '食材', amount: '1g' });
    expect(r.recipe.steps).toEqual(['步骤']);
  });
});
