// 通用曲线图：净值 / 收益率 / 回撤（持仓、模拟盘、回测三模块共用）
//
// 为什么自绘 SVG 而不引图表库：三条曲线都是单序列折线，自绘约 100 行、零依赖、
// 打包体积可控（项目已有 echarts 依赖但仅历史遗留，新增模块不再引入）。
// 支持：基准线（净值 100 / 收益 0）、红涨绿跌着色、最后一根端点、悬停读数。

interface Point {
  date: string;
  value: number;
}

interface Props {
  points: Point[];
  baseline?: number;
  height?: number;
  /** 值的格式化（默认两位小数） */
  format?: (v: number) => string;
  /** 反向着色：回撤曲线用（数值越大越差） */
  inverse?: boolean;
  ariaLabel?: string;
}

const PAD = { top: 12, right: 12, bottom: 22, left: 44 };

export function EquityChart({
  points,
  baseline = 100,
  height = 180,
  format = (v) => v.toFixed(2),
  inverse = false,
  ariaLabel = '曲线'
}: Props) {
  if (points.length < 2) {
    return <p className="empty">数据不足，暂无法绘制曲线（至少需要 2 个交易日快照）</p>;
  }

  const width = 680;
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const values = points.map((p) => p.value);
  const min = Math.min(...values, baseline);
  const max = Math.max(...values, baseline);
  const span = max - min || 1;
  const lo = min - span * 0.08;
  const hi = max + span * 0.08;

  const x = (i: number) => PAD.left + (innerW * i) / (points.length - 1);
  const y = (v: number) => PAD.top + innerH - ((v - lo) / (hi - lo)) * innerH;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${PAD.left},${(
    PAD.top + innerH
  ).toFixed(1)} Z`;

  const last = points[points.length - 1];
  const first = points[0];
  const up = last.value >= first.value;
  const color = inverse ? (last.value === 0 ? '#8e8e93' : '#e23c3c') : up ? '#e23c3c' : '#1ba784';

  // 纵向网格：3 条（含基准线）
  const ticks = [lo + (hi - lo) * 0.15, baseline, hi - (hi - lo) * 0.15];

  return (
    <svg
      className="equity-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${ariaLabel}：${first.date} 至 ${last.date}，最新 ${format(last.value)}`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="eqfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {ticks.map((t, i) => (
        <g key={i}>
          <line
            x1={PAD.left}
            x2={width - PAD.right}
            y1={y(t)}
            y2={y(t)}
            stroke={t === baseline ? 'rgba(60,60,67,0.28)' : 'rgba(60,60,67,0.10)'}
            strokeDasharray={t === baseline ? '4 4' : undefined}
          />
          <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" className="eq-tick">
            {format(t)}
          </text>
        </g>
      ))}

      <path d={area} fill="url(#eqfill)" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />

      <circle cx={x(points.length - 1)} cy={y(last.value)} r="3" fill={color} />

      <text x={PAD.left} y={height - 6} className="eq-axis">
        {first.date.slice(5)}
      </text>
      <text x={width - PAD.right} y={height - 6} textAnchor="end" className="eq-axis">
        {last.date.slice(5)}
      </text>
    </svg>
  );
}
