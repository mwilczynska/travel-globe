import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Chart primitives for the analytics dashboard.
 *
 * Palette below is the validated categorical order — adjacent-pair CVD ΔE 9.1,
 * normal-vision ΔE 19.6 against the white card surface. Slots are assigned in
 * fixed order and never cycled: a 7th country folds into "Other". Three slots
 * sit under 3:1 contrast on white, so every chart using them also ships a table
 * view (the relief rule).
 */
export const SERIES = [
  '#2a78d6', // 1 blue
  '#eb6834', // 2 orange
  '#1baf7a', // 3 aqua
  '#eda100', // 4 yellow
  '#e87ba4', // 5 magenta
  '#008300', // 6 green
];
export const OTHER_COLOR = '#c3c2b7';

export const INK = {
  primary: '#0b0b0b',
  secondary: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
};

/** Measures a container so SVG charts can lay out in real pixels (no text distortion). */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width] as const;
}

/** Nice round integer ticks from 0 to at least max. */
export function integerTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const rawStep = max / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep || 1)));
  const step = Math.max(1, Math.ceil(rawStep / magnitude) * magnitude);
  return Array.from({ length: count + 1 }, (_, i) => i * step);
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 ${className}`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Legend({ entries }: { entries: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5">
      {entries.map(e => (
        <span key={e.label} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: e.color }} />
          <span className="text-xs text-gray-600">{e.label}</span>
        </span>
      ))}
    </div>
  );
}

/** Small toggle used for chart/table view switches. */
export function ViewToggle({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex bg-gray-100 rounded-lg p-0.5 flex-shrink-0">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
            value === o.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export interface StackedPoint {
  key: string;
  label: string;
  total: number;
  segments: { name: string; value: number; color: string }[];
}

/**
 * Stacked (or single-series) time bars with an optional trend overlay.
 *
 * The trend line shares the bars' y-axis and units — it is a smoothing of the
 * same measure, never a second scale.
 */
export function TimeBarChart({
  points,
  trend,
  trendLabel,
  height = 260,
  valueLabel,
}: {
  points: StackedPoint[];
  trend?: (number | null)[];
  trendLabel?: string;
  height?: number;
  valueLabel: string;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const padding = { top: 8, right: 8, bottom: 28, left: 40 };
  const plotW = Math.max(0, width - padding.left - padding.right);
  const plotH = height - padding.top - padding.bottom;

  const max = Math.max(1, ...points.map(p => p.total));
  const ticks = integerTicks(max);
  const chartMax = ticks[ticks.length - 1];
  const y = (v: number) => padding.top + plotH - (v / chartMax) * plotH;

  const slot = plotW / Math.max(1, points.length);
  const barW = Math.max(1, Math.min(slot - 2, slot * 0.8));

  // Aim for ~8 labels, always including the first and last bar.
  const labelStride = Math.max(1, Math.ceil(points.length / 8));

  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`${valueLabel} over time`}>
          {/* Gridlines — solid hairlines, one shade off the surface */}
          {ticks.map(t => (
            <g key={t}>
              <line x1={padding.left} x2={width - padding.right} y1={y(t)} y2={y(t)} stroke={INK.grid} strokeWidth={1} />
              <text
                x={padding.left - 6}
                y={y(t)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={10}
                fill={INK.muted}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {t}
              </text>
            </g>
          ))}

          {points.map((p, i) => {
            const x = padding.left + i * slot + (slot - barW) / 2;
            let cursor = y(0);
            return (
              <g
                key={p.key}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                style={{ outline: 'none' }}
              >
                {/* Generous hit area — the bar itself can be 1px wide */}
                <rect
                  x={padding.left + i * slot}
                  y={padding.top}
                  width={slot}
                  height={plotH}
                  fill={hover === i ? 'rgba(11,11,11,0.04)' : 'transparent'}
                />
                {p.segments.map(seg => {
                  if (seg.value <= 0) return null;
                  const h = (seg.value / chartMax) * plotH;
                  cursor -= h;
                  return (
                    <rect
                      key={seg.name}
                      x={x}
                      y={cursor}
                      width={barW}
                      height={Math.max(0, h - 2)} /* 2px surface gap between segments */
                      fill={seg.color}
                      rx={2}
                    />
                  );
                })}
              </g>
            );
          })}

          {/* Trend overlay — chrome ink, not a series color */}
          {trend && (
            <path
              fill="none"
              stroke={INK.secondary}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={0.75}
              d={trend
                .map((v, i) =>
                  v === null ? null : `${padding.left + i * slot + slot / 2},${y(v)}`
                )
                .filter(Boolean)
                .map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt}`)
                .join(' ')}
            />
          )}

          {/* X axis */}
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={y(0)}
            y2={y(0)}
            stroke={INK.axis}
            strokeWidth={1}
          />
          {points.map((p, i) => {
            const isEdge = i === 0 || i === points.length - 1;
            if (!isEdge && i % labelStride !== 0) return null;
            // Skip a stride label that would collide with the final one
            if (!isEdge && points.length - 1 - i < labelStride * 0.6) return null;
            return (
              <text
                key={p.key}
                x={padding.left + i * slot + slot / 2}
                y={height - 8}
                textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
                fontSize={10}
                fill={INK.muted}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {p.label}
              </text>
            );
          })}
        </svg>
      )}

      {/* Tooltip */}
      {hover !== null && points[hover] && (
        <div
          className="absolute z-10 pointer-events-none bg-gray-900 text-white text-xs rounded-lg px-2.5 py-1.5 shadow-lg"
          style={{
            left: Math.min(Math.max(padding.left + hover * slot + slot / 2 - 70, 0), Math.max(0, width - 150)),
            top: 0,
            minWidth: 140,
          }}
        >
          <div className="font-medium mb-1">{points[hover].label}</div>
          <div className="flex justify-between gap-3">
            <span className="text-white/70">{valueLabel}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{points[hover].total}</span>
          </div>
          {points[hover].segments
            .filter(s => s.value > 0)
            .map(s => (
              <div key={s.name} className="flex items-center justify-between gap-3 mt-0.5">
                <span className="flex items-center gap-1.5 text-white/70">
                  <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: s.color }} />
                  {s.name}
                </span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{s.value}</span>
              </div>
            ))}
          {trend && trend[hover] !== null && trend[hover] !== undefined && (
            <div className="flex justify-between gap-3 mt-1 pt-1 border-t border-white/20">
              <span className="text-white/70">{trendLabel}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{(trend[hover] as number).toFixed(1)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Simple single-series column chart (hour of day, day of week, bucket counts). */
export function ColumnChart({
  bars,
  height = 160,
  color = SERIES[0],
  formatValue = (v: number) => String(v),
}: {
  bars: { label: string; value: number; sublabel?: string }[];
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const padding = { top: 8, right: 4, bottom: 22, left: 4 };
  const plotH = height - padding.top - padding.bottom;
  const plotW = Math.max(0, width - padding.left - padding.right);
  const max = Math.max(1, ...bars.map(b => b.value));
  const slot = plotW / Math.max(1, bars.length);
  const barW = Math.max(1, slot - 3); // 2px+ surface gap between adjacent bars

  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg width={width} height={height}>
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={padding.top + plotH}
            y2={padding.top + plotH}
            stroke={INK.axis}
            strokeWidth={1}
          />
          {bars.map((b, i) => {
            const h = (b.value / max) * plotH;
            const x = padding.left + i * slot + (slot - barW) / 2;
            return (
              <g
                key={b.label}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <rect
                  x={padding.left + i * slot}
                  y={padding.top}
                  width={slot}
                  height={plotH}
                  fill={hover === i ? 'rgba(11,11,11,0.04)' : 'transparent'}
                />
                <rect
                  x={x}
                  y={padding.top + plotH - h}
                  width={barW}
                  height={Math.max(b.value > 0 ? 2 : 0, h)}
                  fill={color}
                  rx={2}
                />
                <text
                  x={padding.left + i * slot + slot / 2}
                  y={height - 6}
                  textAnchor="middle"
                  fontSize={9}
                  fill={INK.muted}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {b.sublabel ?? b.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && bars[hover] && (
        <div
          className="absolute z-10 pointer-events-none bg-gray-900 text-white text-xs rounded-lg px-2.5 py-1.5 shadow-lg whitespace-nowrap"
          style={{ left: Math.min(Math.max(hover * slot - 30, 0), Math.max(0, width - 110)), top: 0 }}
        >
          <span className="text-white/70">{bars[hover].label}: </span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatValue(bars[hover].value)}</span>
        </div>
      )}
    </div>
  );
}

/** Horizontal bar list — magnitude with the value always visible as text. */
export function BarList({
  rows,
  color = SERIES[0],
  emptyMessage,
}: {
  rows: { label: string; value: number; icon?: React.ReactNode; meta?: string }[];
  color?: string;
  emptyMessage: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-gray-400">{emptyMessage}</p>;
  const max = Math.max(...rows.map(r => r.value), 1);

  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => (
        <div key={`${r.label}-${i}`} className="flex items-center gap-3">
          {r.icon && <span className="w-6 text-center flex-shrink-0">{r.icon}</span>}
          <span className="text-sm text-gray-700 w-32 sm:w-40 truncate flex-shrink-0" title={r.label}>
            {r.label}
          </span>
          <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden min-w-[2rem]">
            <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, backgroundColor: color }} />
          </div>
          <span
            className="text-sm font-medium text-gray-900 w-14 text-right flex-shrink-0"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {r.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Percentage composition bar + labelled legend (devices, browsers). */
export function CompositionBar({
  rows,
  emptyMessage,
}: {
  rows: { label: string; value: number; color: string }[];
  emptyMessage: string;
}) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (!total) return <p className="text-sm text-gray-400">{emptyMessage}</p>;

  return (
    <>
      <div className="flex gap-0.5 h-5 mb-3">
        {rows.map(r => (
          <div
            key={r.label}
            className="rounded-sm first:rounded-l-full last:rounded-r-full"
            style={{ width: `${(r.value / total) * 100}%`, backgroundColor: r.color }}
          />
        ))}
      </div>
      <div className="space-y-1.5">
        {rows.map(r => (
          <div key={r.label} className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: r.color }} />
              <span className="text-sm text-gray-700">{r.label}</span>
            </span>
            <span className="text-sm text-gray-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {r.value.toLocaleString()} ({Math.round((r.value / total) * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

/** Stat tile with an optional period-over-period delta. */
export function StatCard({
  label,
  value,
  previous,
  hint,
  format = (v: number) => v.toLocaleString(),
}: {
  label: string;
  value: number;
  previous?: number | null;
  hint?: string;
  format?: (v: number) => string;
}) {
  let delta: { pct: number; up: boolean } | null = null;
  if (previous !== null && previous !== undefined) {
    if (previous === 0 && value === 0) delta = null;
    else if (previous === 0) delta = { pct: 100, up: true };
    else delta = { pct: ((value - previous) / previous) * 100, up: value >= previous };
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{format(value)}</p>
      <div className="flex items-center gap-1.5 mt-1 h-4">
        {delta && Math.abs(delta.pct) >= 0.5 ? (
          <>
            <span
              className="text-xs font-medium"
              style={{ color: delta.up ? '#006300' : '#d03b3b' }}
              aria-hidden="true"
            >
              {delta.up ? '▲' : '▼'}
            </span>
            <span className="text-xs font-medium" style={{ color: delta.up ? '#006300' : '#d03b3b' }}>
              {delta.up ? 'Up' : 'Down'} {Math.abs(delta.pct).toFixed(0)}%
            </span>
            <span className="text-xs text-gray-400">vs previous</span>
          </>
        ) : (
          <span className="text-xs text-gray-400">{hint || (delta ? 'Flat vs previous' : '')}</span>
        )}
      </div>
    </div>
  );
}

/** Renders the previous render at reduced opacity during a refetch (no skeleton flash). */
export function useHeldData<T>(data: T | null, isLoading: boolean) {
  const [held, setHeld] = useState<T | null>(data);
  useEffect(() => {
    if (data) setHeld(data);
  }, [data]);
  return { display: data ?? held, stale: isLoading && !!held };
}
