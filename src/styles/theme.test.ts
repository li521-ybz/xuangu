// 弹层层级守卫（对应线上问题「打开分时图后无法添加股票」，2026-10-17，踩坑 #20）。
//
// 根因：ECharts 画布容器（zrender createRoot）是 position:relative 的定位元素，
// 与 z-index:auto 的 .modal-backdrop 同层、按 DOM 顺序绘制；图表位于详情页（DOM 上后于
// 看板页），画布会盖住弹窗——输入框/按钮被挡住，点击与聚焦全部失效，现象就是「加不了股票」。
// 未选中股票时无图表，弹窗正常，所以此前测试与线上多轮验证均未暴露。
//
// jsdom 不加载外部 CSS（vite.config.ts test.css:false），无法用 getComputedStyle 验证
// 绘制层叠，故直接解析 theme.css 守卫该不变量：.modal-backdrop 必须 fixed + 显式高 z-index。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function ruleBlock(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : '';
}

describe('theme.css 弹层层级', () => {
  // vitest 以项目根为工作目录；import.meta.url 在模块运行器下非 file 协议，故用 cwd 定位
  const css = readFileSync(resolve(process.cwd(), 'src/styles/theme.css'), 'utf8');

  it('.modal-backdrop 为 fixed 定位且 z-index 显式高于画布层', () => {
    const block = ruleBlock(css, '.modal-backdrop');
    expect(block, '未找到 .modal-backdrop 规则').not.toBe('');
    expect(block).toMatch(/position:\s*fixed/);
    const z = block.match(/z-index:\s*(\d+)/);
    expect(
      z,
      '.modal-backdrop 必须显式声明 z-index：缺省时会被 ECharts 画布（position:relative）按 DOM 顺序盖住（踩坑 #20）'
    ).not.toBeNull();
    expect(Number(z![1])).toBeGreaterThanOrEqual(1000);
  });

  it('两个弹窗（添加自选/设置）共用 .modal-backdrop，一并受层级保护', () => {
    // 添加自选弹层与设置弹层均使用该类名，修改类名会同时破坏两处弹窗与守卫测试
    expect(ruleBlock(css, '.modal-backdrop')).toMatch(/z-index/);
  });
});

// 分组选中态可见性守卫（对应线上问题「点击最左侧分组按钮后按钮不可见」，2026-10-17，踩坑 #24）。
//
// 根因：宽屏下 .app.wide .group-side .tab { background: transparent } 特异性 (0,4,0)
// 压过 .group-side .tab.active { background: var(--accent) } 的 (0,3,0)——选中按钮丢蓝底
// 只剩 color:#fff 白字 → 白字白底整键隐身。窄屏无 .app.wide 前缀，故只有宽屏暴露。
describe('theme.css 分组选中态可见性', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/styles/theme.css'), 'utf8');

  // 从行首开始的规则匹配，避免 .group-side .tab.active 命中 .app.wide .group-side .tab.active 的子串
  function lineStartRule(selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = css.match(new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm'));
    return m ? m[1] : '';
  }

  function backgroundOf(block: string): string | null {
    const bg = block.match(/background:\s*([^;]+)/);
    return bg ? bg[1].trim() : null;
  }

  it('宽屏选中分组 tab 显式声明非透明 background（防被 .app.wide 前缀规则的 transparent 覆盖）', () => {
    const block = lineStartRule('.app.wide .group-side .tab.active');
    expect(
      block,
      '未找到 .app.wide .group-side .tab.active 规则：宽屏选中态会被 .app.wide .group-side .tab 的 transparent 覆盖，白字白底隐身（踩坑 #24）'
    ).not.toBe('');
    const bg = backgroundOf(block);
    expect(bg, '宽屏选中态必须显式声明 background').not.toBeNull();
    expect(bg, `background 不能为 transparent/none，否则白字白底隐身（当前: ${bg}）`).not.toMatch(/^(transparent|none)$/);
  });

  it('选中分组 tab 基础规则同样有实体 background（窄屏 chips 态同效）', () => {
    const block = lineStartRule('.group-side .tab.active');
    expect(block, '未找到 .group-side .tab.active 规则').not.toBe('');
    const bg = backgroundOf(block);
    expect(bg).not.toBeNull();
    expect(bg).not.toMatch(/^(transparent|none)$/);
  });
});
