// 股票代码规范化：请求上游前补前缀、本地匹配去前缀
import { describe, it, expect } from 'vitest';
import { normalizeSymbol, bareSymbol } from './symbol';

describe('normalizeSymbol', () => {
  it('6 位代码按市场补前缀：沪/深/北交所', () => {
    expect(normalizeSymbol('601929')).toBe('sh601929'); // 沪市主板
    expect(normalizeSymbol('000001')).toBe('sz000001'); // 深市主板
    expect(normalizeSymbol('300750')).toBe('sz300750'); // 创业板
    expect(normalizeSymbol('688981')).toBe('sh688981'); // 科创板
    expect(normalizeSymbol('430047')).toBe('bj430047'); // 北交所
    expect(normalizeSymbol('830799')).toBe('bj830799'); // 北交所
    expect(normalizeSymbol('510300')).toBe('sh510300'); // 沪市 ETF
    expect(normalizeSymbol('159915')).toBe('sz159915'); // 深市 ETF
  });

  it('已带前缀的统一小写返回', () => {
    expect(normalizeSymbol('sh600000')).toBe('sh600000');
    expect(normalizeSymbol('SZ000001')).toBe('sz000001');
  });

  it('空白与非法输入原样返回（交上游报错）', () => {
    expect(normalizeSymbol('')).toBe('');
    expect(normalizeSymbol('  ')).toBe('');
    expect(normalizeSymbol('abc')).toBe('abc');
    expect(normalizeSymbol('12345')).toBe('12345');
    expect(normalizeSymbol('1234567')).toBe('1234567');
  });
});

describe('bareSymbol', () => {
  it('去掉交易所前缀用于本地匹配', () => {
    expect(bareSymbol('sh601929')).toBe('601929');
    expect(bareSymbol('SZ000001')).toBe('000001');
  });

  it('无前缀或非法输入原样返回', () => {
    expect(bareSymbol('601929')).toBe('601929');
    expect(bareSymbol('abc')).toBe('abc');
  });
});
