// 阶段2 解析：新浪/腾讯行情 -> Quote，含红涨绿跌判定
import { describe, it, expect } from 'vitest';
import { parseSinaLine, parseTencentLine, parseQuotesBatch } from '../../worker/parse';

const SINA =
  'var hq_str_sh600000="浦发银行,11.05,11.00,11.20,11.30,10.90,11.20,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2024-01-01 15:00:00"';
// 真实字段序（2026-10-16 实测）：1~名称~代码~当前价~昨收~今开~...~[30]时间~[31]涨跌额~[32]涨跌幅%~[33]最高~[34]最低
const TENCENT =
  'v_sh600000="1~PUFA~600000~11.05~11.20~11.30~922942~577708~345234~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~~20240101161500~-0.15~-1.33~11.30~10.90~0~0~0~0~0"';

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
  it('按真实字段位次解析：昨收取 f[4]（今开是 f[5]，曾误取导致涨跌幅算错）', () => {
    const q = parseTencentLine(TENCENT)!;
    expect(q.symbol).toBe('sh600000');
    expect(q.name).toBe('PUFA');
    expect(q.price).toBe(11.05);
    expect(q.prevClose).toBe(11.2); // f[4] 昨收（不是 f[5] 今开 11.30）
    // 优先采用腾讯自带涨跌字段
    expect(q.change).toBeCloseTo(-0.15);
    expect(q.changePct).toBeCloseTo(-1.33);
  });

  it('缺失自带涨跌字段时自算（分母为昨收）', () => {
    const short = 'v_sh600000="1~浦发银行~600000~11.05~11.20~11.30"';
    const q = parseTencentLine(short)!;
    expect(q.prevClose).toBe(11.2);
    expect(q.change).toBeCloseTo(-0.15);
    expect(q.changePct).toBeCloseTo((-0.15 / 11.2) * 100);
  });
});

describe('parseQuotesBatch', () => {
  it('多行混合自动识别来源', () => {
    const qs = parseQuotesBatch(`${SINA}\n${TENCENT}`);
    expect(qs.length).toBe(2);
    expect(qs.map((q) => q.symbol).sort()).toEqual(['sh600000', 'sh600000']); // 两支同代码不同源
  });
});
