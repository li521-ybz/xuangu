// 绩效计算口径测试（持仓 / 模拟盘 / 回测共用，算错会让三个模块一起错）
import { describe, it, expect } from 'vitest';
import { annualizedReturn, maxDrawdown, moneyText, profitFactor, summarize, totalReturn, winRate } from './analytics';

describe('maxDrawdown', () => {
  it('从高点回落取最大跌幅（正数百分比）', () => {
    expect(maxDrawdown([{ value: 100 }, { value: 120 }, { value: 90 }, { value: 110 }])).toBeCloseTo(25, 6);
  });

  it('单调上涨无回撤', () => {
    expect(maxDrawdown([{ value: 100 }, { value: 110 }, { value: 130 }])).toBe(0);
  });

  it('空序列 / 单点返回 0', () => {
    expect(maxDrawdown([])).toBe(0);
    expect(maxDrawdown([{ value: 100 }])).toBe(0);
  });
});

describe('totalReturn / annualizedReturn', () => {
  it('总收益率按首末值算', () => {
    expect(totalReturn([{ value: 100 }, { value: 120 }])).toBeCloseTo(20, 6);
  });

  it('不足一年不放大：244 个交易日翻倍 → 年化 100%', () => {
    const pts = Array.from({ length: 245 }, (_, i) => ({ value: 100 * (1 + i / 244) }));
    // 线性增长不是复利，年化按 (末/首)^(244/天数)-1 计算
    const r = annualizedReturn(pts);
    expect(r).toBeGreaterThan(95);
    expect(r).toBeLessThan(105);
  });

  it('单点或空序列返回 0', () => {
    expect(annualizedReturn([{ value: 100 }])).toBe(0);
    expect(annualizedReturn([])).toBe(0);
  });
});

describe('winRate / profitFactor', () => {
  it('胜率 = 盈利笔数 / 总笔数', () => {
    expect(winRate([{ pnl: 100 }, { pnl: -50 }, { pnl: 30 }, { pnl: -10 }])).toBe(50);
    expect(winRate([])).toBe(0);
  });

  it('盈亏比 = 总盈利 / 总亏损；无亏损时为 0（不可比）', () => {
    expect(profitFactor([{ pnl: 100 }, { pnl: -50 }])).toBeCloseTo(2, 6);
    expect(profitFactor([{ pnl: 100 }])).toBe(0);
  });
});

describe('summarize', () => {
  it('汇总各指标并按曲线计算回撤', () => {
    const s = summarize(
      [{ value: 100 }, { value: 110 }, { value: 99 }, { value: 121 }],
      [{ pnl: 10 }, { pnl: -5 }]
    );
    expect(s.totalReturn).toBeCloseTo(21, 6);
    expect(s.maxDrawdown).toBeCloseTo(10, 6);
    expect(s.trades).toBe(2);
    expect(s.winRate).toBe(50);
  });
});

describe('moneyText', () => {
  it('过亿/过万分别用亿/万，负数保留符号', () => {
    expect(moneyText(123456789)).toBe('1.23 亿');
    expect(moneyText(12345)).toBe('1.23 万');
    expect(moneyText(-12345)).toBe('-1.23 万');
    expect(moneyText(999)).toBe('999.00');
  });
});
