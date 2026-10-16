// 阶段2 解析：新浪/腾讯行情 -> Quote，含红涨绿跌判定
import { describe, it, expect } from 'vitest';
import { parseSinaLine, parseTencentLine, parseQuotesBatch } from '../../worker/parse';

const SINA =
  'var hq_str_sh600000="浦发银行,11.05,11.00,11.20,11.30,10.90,11.20,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2024-01-01 15:00:00"';
const TENCENT = 'v_sh600000="浦发银行~600000~11.05~11.20~11.30~11.00~10.90~11.20"';

describe('parseSinaLine', () => {
  it('上涨：红（change>0）', () => {
    const q = parseSinaLine(SINA)!;
    expect(q.symbol).toBe('sh600000');
    expect(q.prevClose).toBe(11.0);
    expect(q.price).toBe(11.2);
    expect(q.change).toBeCloseTo(0.2);
    expect(q.changePct).toBeCloseTo((0.2 / 11.0) * 100);
  });

  it('下跌：绿（change<0）', () => {
    const down = 'var hq_str_sz000001="平安银行,10.00,10.20,9.80,10.30,9.70,9.80"';
    const q = parseSinaLine(down)!;
    expect(q.change).toBeCloseTo(-0.4);
    expect(q.changePct).toBeLessThan(0);
  });

  it('格式错误返回 null', () => {
    expect(parseSinaLine('not a quote')).toBeNull();
    expect(parseSinaLine('var hq_str_sh600000=""')).toBeNull();
  });
});

describe('parseTencentLine', () => {
  it('解析腾讯行情并算涨跌', () => {
    const q = parseTencentLine(TENCENT)!;
    expect(q.symbol).toBe('sh600000');
    expect(q.price).toBe(11.2);
    expect(q.prevClose).toBe(11.0);
    expect(q.change).toBeCloseTo(0.2);
  });
});

describe('parseQuotesBatch', () => {
  it('多行混合自动识别来源', () => {
    const qs = parseQuotesBatch(`${SINA}\n${TENCENT}`);
    expect(qs.length).toBe(2);
    expect(qs.map((q) => q.symbol).sort()).toEqual(['sh600000', 'sh600000']); // 两支同代码不同源
  });
});
