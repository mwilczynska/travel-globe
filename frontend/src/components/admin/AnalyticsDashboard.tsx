import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  SERIES,
  OTHER_COLOR,
  Card,
  Legend,
  ViewToggle,
  TimeBarChart,
  ColumnChart,
  BarList,
  CompositionBar,
  StatCard,
  useHeldData,
  type StackedPoint,
} from './analyticsCharts';

interface AnalyticsSummary {
  period: string;
  rangeStart: string;
  rangeEnd: string;
  daysInRange: number;
  tzOffsetMinutes: number;

  totalPageViews: number;
  uniqueVisitors: number;
  totalPostViews: number;
  countriesCount: number;
  avgViewsPerDay: number;
  previous: { pageViews: number; uniqueVisitors: number; postViews: number; countries: number } | null;

  series: { date: string; views: number; visitors: number }[];
  viewsByDayCountry: { date: string; country: string; country_code: string; count: number }[];
  newVsReturning: { date: string; newVisitors: number; returningVisitors: number }[];
  visitDepth: {
    visits: number;
    avgEventsPerVisit: number;
    avgDurationSeconds: number;
    bounceRate: number;
    eventBuckets: { label: string; count: number }[];
    durationBuckets: { label: string; count: number }[];
  };

  topPosts: { post_id: number; count: number; visitors: number; title: string; location_name: string; post_type: string }[];
  eventTypes: { event_type: string; count: number }[];
  referrers: { referrer: string; count: number }[];
  viewsByCountry: { country: string; country_code: string; count: number; visitors: number }[];
  viewsByCity: { city: string; country: string; country_code: string; count: number }[];
  deviceBreakdown: { device_type: string; count: number }[];
  browserBreakdown: { browser: string; count: number }[];
  botEventsExcluded: number;
}

const TIME_RANGES = [
  { label: '7d', value: '7' },
  { label: '30d', value: '30' },
  { label: '90d', value: '90' },
  { label: 'All', value: 'all' },
];

const GRANULARITIES = [
  { label: 'Day', value: 'day' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
];

const METRICS = [
  { label: 'Views', value: 'views' },
  { label: 'Visitors', value: 'visitors' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function countryFlag(code: string): string {
  if (!code || code.length !== 2) return '';
  return String.fromCodePoint(...code.toUpperCase().split('').map(c => 0x1f1e6 + c.charCodeAt(0) - 65));
}

function parseISO(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

/** Bucket key for the chosen granularity: a day, an ISO week start, or a month. */
function bucketKey(date: string, granularity: string): string {
  if (granularity === 'month') return date.slice(0, 7);
  if (granularity === 'week') {
    const d = parseISO(date);
    const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
    d.setUTCDate(d.getUTCDate() - dow);
    return d.toISOString().slice(0, 10);
  }
  return date;
}

function bucketLabel(key: string, granularity: string, spanYears: boolean): string {
  if (granularity === 'month') {
    const [y, m] = key.split('-');
    return spanYears ? `${MONTHS[Number(m) - 1]} ${y.slice(2)}` : MONTHS[Number(m) - 1];
  }
  const d = parseISO(key);
  const base = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return spanYears ? `${base} ${String(d.getUTCFullYear()).slice(2)}` : base;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 1) return '0s';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s ? `${m}m ${s}s` : `${m}m`;
}

const POST_TYPE_ICON: Record<string, string> = {
  photo: '📷', video: '🎥', text: '📝', quote: '💬', link: '🔗', audio: '🎵',
};

export function AnalyticsDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // One filter row scopes every chart below.
  const [days, setDays] = useState('30');
  const [granularity, setGranularity] = useState('day');
  const [metric, setMetric] = useState('views');

  const [timeView, setTimeView] = useState('chart');

  // Report in the author's local time rather than UTC.
  const tzOffset = useMemo(() => -new Date().getTimezoneOffset(), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/analytics/summary?days=${days}&tz=${tzOffset}`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to fetch analytics');
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load analytics');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [days, tzOffset]);

  const { display, stale } = useHeldData(data, isLoading);

  const handleExport = () => {
    window.open(`/api/analytics/export?days=${days}&tz=${tzOffset}`, '_blank');
  };

  // Auto-coarsen the default granularity for long ranges.
  useEffect(() => {
    if (days === 'all') setGranularity('week');
    else if (days === '90') setGranularity('week');
    else setGranularity('day');
  }, [days]);

  /** Bucketed time series, stacked by country when showing views. */
  const timeChart = useMemo(() => {
    if (!display) return null;

    const spanYears = display.rangeStart.slice(0, 4) !== display.rangeEnd.slice(0, 4);

    // Bucket the totals.
    const buckets = new Map<string, { views: number; visitors: number }>();
    const order: string[] = [];
    for (const row of display.series) {
      const key = bucketKey(row.date, granularity);
      if (!buckets.has(key)) { buckets.set(key, { views: 0, visitors: 0 }); order.push(key); }
      const b = buckets.get(key)!;
      b.views += row.views;
      b.visitors += row.visitors;
    }

    // Top 6 countries get a fixed slot each; the rest fold into "Other".
    const countryTotals = new Map<string, number>();
    for (const row of display.viewsByDayCountry) {
      countryTotals.set(row.country, (countryTotals.get(row.country) || 0) + row.count);
    }
    const ranked = [...countryTotals.entries()].sort((a, b) => b[1] - a[1]);
    const topCountries = ranked.slice(0, SERIES.length).map(([c]) => c).filter(c => c !== 'Unknown');
    const colorOf = new Map(topCountries.map((c, i) => [c, SERIES[i]]));

    const perBucketCountry = new Map<string, Map<string, number>>();
    for (const row of display.viewsByDayCountry) {
      const key = bucketKey(row.date, granularity);
      if (!perBucketCountry.has(key)) perBucketCountry.set(key, new Map());
      const name = colorOf.has(row.country) ? row.country : 'Other';
      const m = perBucketCountry.get(key)!;
      m.set(name, (m.get(name) || 0) + row.count);
    }

    const showCountries = metric === 'views';
    const points: StackedPoint[] = order.map(key => {
      const totals = buckets.get(key)!;
      const total = metric === 'views' ? totals.views : totals.visitors;

      let segments: StackedPoint['segments'];
      if (showCountries) {
        const m = perBucketCountry.get(key) || new Map();
        segments = [
          ...topCountries.map(c => ({ name: c, value: m.get(c) || 0, color: colorOf.get(c)! })),
          { name: 'Other', value: m.get('Other') || 0, color: OTHER_COLOR },
        ].filter(s => s.value > 0);
        // Any views not attributed to a country still belong in the bar.
        const attributed = segments.reduce((s, x) => s + x.value, 0);
        if (total > attributed) {
          segments.push({ name: 'Unknown', value: total - attributed, color: OTHER_COLOR });
        }
      } else {
        segments = [{ name: 'Visitors', value: total, color: SERIES[0] }];
      }

      return { key, label: bucketLabel(key, granularity, spanYears), total, segments };
    });

    // 7-period moving average of the same measure, on the same axis.
    const window = granularity === 'day' ? 7 : 4;
    const trend = points.map((_, i) => {
      if (i < window - 1) return null;
      let sum = 0;
      for (let j = i - window + 1; j <= i; j++) sum += points[j].total;
      return sum / window;
    });

    const legend = showCountries
      ? [
          ...topCountries.map(c => ({ label: c, color: colorOf.get(c)! })),
          ...(points.some(p => p.segments.some(s => s.name === 'Other' || s.name === 'Unknown'))
            ? [{ label: 'Other / unknown', color: OTHER_COLOR }]
            : []),
        ]
      : [];

    return { points, trend, legend, window };
  }, [display, granularity, metric]);

  const newReturning = useMemo(() => {
    if (!display) return null;
    const spanYears = display.rangeStart.slice(0, 4) !== display.rangeEnd.slice(0, 4);
    const buckets = new Map<string, { n: number; r: number }>();
    const order: string[] = [];
    for (const row of display.newVsReturning) {
      const key = bucketKey(row.date, granularity);
      if (!buckets.has(key)) { buckets.set(key, { n: 0, r: 0 }); order.push(key); }
      const b = buckets.get(key)!;
      b.n += row.newVisitors;
      b.r += row.returningVisitors;
    }
    const points: StackedPoint[] = order.map(key => {
      const b = buckets.get(key)!;
      return {
        key,
        label: bucketLabel(key, granularity, spanYears),
        total: b.n + b.r,
        segments: [
          { name: 'New', value: b.n, color: SERIES[0] },
          { name: 'Returning', value: b.r, color: SERIES[1] },
        ].filter(s => s.value > 0),
      };
    });
    const totalNew = order.reduce((s, k) => s + buckets.get(k)!.n, 0);
    const totalReturning = order.reduce((s, k) => s + buckets.get(k)!.r, 0);
    return { points, totalNew, totalReturning };
  }, [display, granularity]);

  const deviceRows = useMemo(() => {
    if (!display) return [];
    const colors: Record<string, string> = {
      Desktop: SERIES[0], Mobile: SERIES[1], Tablet: SERIES[2], Unknown: OTHER_COLOR,
    };
    return display.deviceBreakdown.map(d => ({
      label: d.device_type,
      value: d.count,
      color: colors[d.device_type] || OTHER_COLOR,
    }));
  }, [display]);

  const browserRows = useMemo(() => {
    if (!display) return [];
    return display.browserBreakdown.map((b, i) => ({
      label: b.browser,
      value: b.count,
      color: i < SERIES.length ? SERIES[i] : OTHER_COLOR,
    }));
  }, [display]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleExport}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
              >
                Export CSV
              </button>
              <button onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-700 text-sm">
                Back
              </button>
            </div>
          </div>

          {/* One filter row, scoping every chart below it */}
          <div className="flex items-center gap-2 flex-wrap mt-3">
            <ViewToggle options={TIME_RANGES} value={days} onChange={setDays} />
            <ViewToggle options={GRANULARITIES} value={granularity} onChange={setGranularity} />
            <ViewToggle options={METRICS} value={metric} onChange={setMetric} />
            {display && (
              <span className="text-xs text-gray-400 ml-1">
                {display.rangeStart} to {display.rangeEnd}
                {display.botEventsExcluded > 0 && ` · ${display.botEventsExcluded.toLocaleString()} bot events excluded`}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>
        )}

        {!display && isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : display ? (
          <div className={`space-y-6 transition-opacity ${stale ? 'opacity-60' : ''}`}>
            {/* Headline figures */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <StatCard label="Page Views" value={display.totalPageViews} previous={display.previous?.pageViews ?? null} />
              <StatCard label="Unique Visitors" value={display.uniqueVisitors} previous={display.previous?.uniqueVisitors ?? null} />
              <StatCard label="Post Views" value={display.totalPostViews} previous={display.previous?.postViews ?? null} />
              <StatCard
                label="Avg Views/Day"
                value={display.avgViewsPerDay}
                format={v => v.toFixed(v < 10 ? 1 : 0)}
                hint={`over ${display.daysInRange} days`}
              />
              <StatCard label="Countries" value={display.countriesCount} previous={display.previous?.countries ?? null} />
            </div>

            {/* Views over time */}
            <Card
              title={metric === 'views' ? 'Views Over Time' : 'Visitors Over Time'}
              subtitle={
                timeChart
                  ? `${granularity === 'day' ? 'Daily' : granularity === 'week' ? 'Weekly' : 'Monthly'} · line shows ${timeChart.window}-period average`
                  : undefined
              }
              actions={
                <ViewToggle
                  options={[{ label: 'Chart', value: 'chart' }, { label: 'Table', value: 'table' }]}
                  value={timeView}
                  onChange={setTimeView}
                />
              }
            >
              {timeChart && timeChart.legend.length > 0 && (
                <div className="mb-3">
                  <Legend entries={timeChart.legend} />
                </div>
              )}

              {timeView === 'chart' ? (
                timeChart && timeChart.points.length > 0 ? (
                  <TimeBarChart
                    points={timeChart.points}
                    trend={timeChart.trend}
                    trendLabel={`${timeChart.window}-period avg`}
                    valueLabel={metric === 'views' ? 'Views' : 'Visitors'}
                  />
                ) : (
                  <p className="text-sm text-gray-400">No data in this range.</p>
                )
              ) : (
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 pr-4 text-gray-500 font-medium">Period</th>
                        <th className="text-right py-2 pr-4 text-gray-500 font-medium">
                          {metric === 'views' ? 'Views' : 'Visitors'}
                        </th>
                        <th className="text-left py-2 text-gray-500 font-medium">Breakdown</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timeChart?.points.map(p => (
                        <tr key={p.key} className="border-b border-gray-50">
                          <td className="py-1.5 pr-4 text-gray-900">{p.label}</td>
                          <td className="py-1.5 pr-4 text-right font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {p.total}
                          </td>
                          <td className="py-1.5 text-gray-600 text-xs">
                            {p.segments.map(s => `${s.name}: ${s.value}`).join(' · ') || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Audience composition + session depth */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card
                title="New vs Returning Visitors"
                subtitle={
                  newReturning
                    ? `${newReturning.totalNew.toLocaleString()} new · ${newReturning.totalReturning.toLocaleString()} returning`
                    : undefined
                }
                className="lg:col-span-2"
              >
                <div className="mb-3">
                  <Legend
                    entries={[
                      { label: 'New', color: SERIES[0] },
                      { label: 'Returning', color: SERIES[1] },
                    ]}
                  />
                </div>
                {newReturning && newReturning.points.length > 0 ? (
                  <TimeBarChart points={newReturning.points} height={200} valueLabel="Visitors" />
                ) : (
                  <p className="text-sm text-gray-400">No visitor data in this range.</p>
                )}
              </Card>

              <Card
                title="Visit Depth"
                subtitle={`${display.visitDepth.visits.toLocaleString()} visits · split on 30 min idle`}
              >
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div>
                    <p className="text-xs text-gray-500">Actions</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {display.visitDepth.avgEventsPerVisit.toFixed(1)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Duration</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {formatDuration(display.visitDepth.avgDurationSeconds)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Bounce</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {Math.round(display.visitDepth.bounceRate * 100)}%
                    </p>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mb-1.5">Time on site per visit</p>
                <ColumnChart bars={display.visitDepth.durationBuckets.map(b => ({ label: b.label, value: b.count }))} height={110} />
              </Card>
            </div>

            {/* Geography */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card title="Visitors by Country" className="lg:col-span-2">
                <BarList
                  rows={display.viewsByCountry.map(c => ({
                    label: c.country,
                    value: c.count,
                    icon: countryFlag(c.country_code),
                  }))}
                  emptyMessage="No location data yet. New visits will be geolocated."
                />
              </Card>

              <div className="space-y-6">
                <Card title="Devices">
                  <CompositionBar rows={deviceRows} emptyMessage="No device data yet." />
                </Card>
                <Card title="Browsers">
                  <CompositionBar rows={browserRows} emptyMessage="No browser data yet." />
                </Card>
              </div>
            </div>

            {display.viewsByCity.length > 0 && (
              <Card title="Top Cities">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 pr-4 text-gray-500 font-medium">City</th>
                        <th className="text-left py-2 pr-4 text-gray-500 font-medium">Country</th>
                        <th className="text-right py-2 text-gray-500 font-medium">Views</th>
                      </tr>
                    </thead>
                    <tbody>
                      {display.viewsByCity.map((c, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-2 pr-4 text-gray-900">{c.city}</td>
                          <td className="py-2 pr-4 text-gray-600">
                            {countryFlag(c.country_code)} {c.country}
                          </td>
                          <td className="py-2 text-right font-medium text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {c.count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Content and sources */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card title="Top Posts">
                {display.topPosts.length > 0 ? (
                  <div className="space-y-3">
                    {display.topPosts.map(post => (
                      <button
                        key={post.post_id}
                        type="button"
                        className="w-full flex items-start justify-between gap-2 text-left hover:bg-gray-50 -mx-2 px-2 py-1 rounded"
                        onClick={() => navigate(`/?post=${post.post_id}`)}
                      >
                        <span className="flex items-start gap-2 min-w-0">
                          <span className="text-sm mt-0.5">{POST_TYPE_ICON[post.post_type] || '📄'}</span>
                          <span className="min-w-0">
                            <span className="block text-sm text-gray-900 truncate">{post.title}</span>
                            {post.location_name && (
                              <span className="block text-xs text-gray-400 truncate">{post.location_name}</span>
                            )}
                          </span>
                        </span>
                        <span className="text-right flex-shrink-0">
                          <span className="block text-sm font-medium text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {post.count}
                          </span>
                          <span className="block text-xs text-gray-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {post.visitors} people
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">
                    No post views recorded yet. Posts are counted once they have been on screen for a second.
                  </p>
                )}
              </Card>

              <Card title="Engagement">
                <BarList
                  rows={display.eventTypes.map(e => ({
                    label: e.event_type.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' '),
                    value: e.count,
                  }))}
                  emptyMessage="No events recorded."
                />
              </Card>

              <Card title="Referrers">
                <BarList
                  rows={display.referrers.map(r => ({ label: r.referrer, value: r.count }))}
                  emptyMessage="No referrer data."
                />
              </Card>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500">No analytics data available.</p>
          </div>
        )}
      </main>
    </div>
  );
}
