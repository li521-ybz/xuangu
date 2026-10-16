// 股票代码规范化：用户可只输 6 位代码（如 601929），请求上游前自动补交易所前缀（sh601929）；
// 上游返回的代码带前缀，本地匹配时统一用「纯代码」做键（601929），
// 从而「输没输前缀都能请求成功、都能匹配上」，界面始终显示用户输入的原样。

/** 补全交易所前缀：601929 → sh601929；sh601929 → sh601929；非 6 位代码原样返回（交上游处理） */
export function normalizeSymbol(input: string): string {
  const s = (input ?? '').trim();
  if (!s) return s;
  const m = s.match(/^([a-zA-Z]{2})?(\d{6})$/);
  if (!m) return s;
  const prefix = (m[1] ?? guessPrefix(m[2])).toLowerCase();
  return prefix + m[2];
}

/** 6 位代码推断交易所：6/5/9 开头→沪，4/8 开头→北交所，0/3/1/2 开头→深 */
function guessPrefix(code: string): string {
  const c = code[0];
  if (c === '6' || c === '5' || c === '9') return 'sh';
  if (c === '4' || c === '8') return 'bj';
  return 'sz';
}

/** 去掉交易所前缀：sh601929 → 601929；601929 → 601929（本地匹配统一键） */
export function bareSymbol(input: string): string {
  const s = (input ?? '').trim();
  const m = s.match(/^[a-zA-Z]{2}(\d{6})$/);
  return m ? m[1] : s;
}
