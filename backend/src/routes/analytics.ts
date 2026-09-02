import { Router, Request, Response } from 'express';
import { query, run, get } from '../db/index.js';
import { authorAuth } from '../middleware/authorAuth.js';
import { v4 as uuidv4 } from 'uuid';
import http from 'http';
import UAParserModule from 'ua-parser-js';
const UAParser = UAParserModule as unknown as { new(ua?: string): { getDevice(): { type?: string }; getBrowser(): { name?: string } } };

// Geo lookup cache to avoid repeated API calls for same IP
const geoCache = new Map<string, { country: string; city: string; countryCode: string } | null>();

function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  // IPv6 loopback
  if (ip === '::1' || ip === '::') return true;
  // IPv4 loopback and private ranges
  if (ip === '127.0.0.1' || ip.startsWith('127.')) return true;
  if (ip.startsWith('192.168.') || ip.startsWith('10.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  // Link-local
  if (ip.startsWith('169.254.')) return true;
  // Not an IP at all (contains non-IP characters like : in URLs, letters etc)
  if (/[a-zA-Z]/.test(ip) && !ip.includes(':')) return true;
  // Contains scheme — it's a URL, not an IP
  if (ip.includes('://')) return true;
  return false;
}

function lookupGeo(ip: string): Promise<{ country: string; city: string; countryCode: string } | null> {
  // Clean IPv6-mapped IPv4 (e.g. ::ffff:1.2.3.4)
  const cleanIp = ip.replace(/^::ffff:/, '').trim();

  // Skip private/local/invalid IPs
  if (isPrivateIp(cleanIp)) {
    return Promise.resolve(null);
  }

  if (geoCache.has(cleanIp)) {
    return Promise.resolve(geoCache.get(cleanIp)!);
  }

  return new Promise((resolve) => {
    const req = http.get(`http://ip-api.com/json/${cleanIp}?fields=status,country,city,countryCode`, { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === 'success') {
            const result = { country: json.country, city: json.city, countryCode: json.countryCode };
            geoCache.set(cleanIp, result);
            resolve(result);
          } else {
            geoCache.set(cleanIp, null);
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// Crawlers, monitors and preview fetchers. Flagged rather than dropped so the
// raw export stays complete, but excluded from every reported figure.
const BOT_UA_PATTERN =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|discord|slack|embedly|quora|pinterest|redditbot|applebot|petalbot|yandex|baidu|semrush|ahrefs|mj12|dotbot|screaming frog|headlesschrome|phantomjs|puppeteer|playwright|python-requests|curl\/|wget\/|go-http-client|okhttp|axios\/|node-fetch|uptime|pingdom|monitor|lighthouse|gtmetrix/i;

function isBotUserAgent(ua: string | undefined): boolean {
  if (!ua || !ua.trim()) return true; // no UA at all is not a real browser
  return BOT_UA_PATTERN.test(ua);
}

// Group referrers by hostname — storing the full URL meant one site showed up
// as many rows and consumed the whole top-N list.
function referrerHost(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

function parseUserAgent(ua: string | undefined): { deviceType: string; browser: string } {
  if (!ua) return { deviceType: 'Unknown', browser: 'Unknown' };
  const parser = new UAParser(ua);
  const device = parser.getDevice();
  const browserInfo = parser.getBrowser();

  let deviceType = 'Desktop';
  if (device.type === 'mobile') deviceType = 'Mobile';
  else if (device.type === 'tablet') deviceType = 'Tablet';

  return {
    deviceType,
    browser: browserInfo.name || 'Unknown',
  };
}

const router = Router();

// Valid analytics event types (whitelist).
// Must stay in sync with the trackers exposed by frontend/src/hooks/useAnalytics.ts —
// media_play, outbound_link and post_interaction were previously emitted by the
// hook but rejected here with a 400, so they were silently lost.
const validEventTypes = [
  'page_view',
  'post_view',
  'post_interaction',
  'comment_submit',
  'viewer_login',
  'globe_interaction',
  'media_play',
  'outbound_link',
  'lightbox_open',
  'gallery_open',
];

// Maximum size for event_data JSON (10KB)
const MAX_EVENT_DATA_SIZE = 10 * 1024;

// Track an event (no auth required - for public tracking)
router.post('/event', async (req: Request, res: Response) => {
  try {
    const { event_type, event_data, post_id } = req.body;

    if (!event_type) {
      res.status(400).json({ error: 'event_type is required' });
      return;
    }

    // Validate event type against whitelist
    if (!validEventTypes.includes(event_type)) {
      res.status(400).json({ error: `Invalid event_type. Must be one of: ${validEventTypes.join(', ')}` });
      return;
    }

    // Validate event_data size
    if (event_data) {
      const eventDataStr = JSON.stringify(event_data);
      if (eventDataStr.length > MAX_EVENT_DATA_SIZE) {
        res.status(400).json({ error: 'event_data exceeds maximum size' });
        return;
      }
    }

    // Validate post_id if provided
    if (post_id !== undefined && post_id !== null) {
      if (!Number.isInteger(post_id) || post_id < 1) {
        res.status(400).json({ error: 'post_id must be a positive integer' });
        return;
      }
    }

    // Get or create session ID
    let sessionId = req.cookies?.analytics_session;
    if (!sessionId) {
      sessionId = uuidv4();
      res.cookie('analytics_session', sessionId, {
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        sameSite: 'lax',
      });
    }

    // Extract request metadata
    const userAgent = req.headers['user-agent'] || null;
    const ipAddress = req.ip || req.socket.remoteAddress || null;
    const referrer = req.headers['referer'] || req.headers['referrer'] || null;

    // Parse user agent
    const { deviceType, browser } = parseUserAgent(userAgent || undefined);
    const bot = isBotUserAgent(userAgent || undefined);

    // Respond immediately, do geo lookup async
    res.json({ success: true });

    // Geo lookup (non-blocking — we already sent the response).
    // Skip it for bots so we don't spend rate-limited lookups on crawlers.
    const geo = bot ? null : await lookupGeo(ipAddress || '');

    run(
      `INSERT INTO analytics_events (event_type, event_data, post_id, session_id, user_agent, ip_address, referrer, referrer_host, country, city, country_code, device_type, browser, is_bot)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event_type,
        event_data ? JSON.stringify(event_data) : null,
        post_id || null,
        sessionId,
        userAgent,
        ipAddress,
        referrer,
        referrerHost(referrer as string | null),
        geo?.country || null,
        geo?.city || null,
        geo?.countryCode || null,
        deviceType,
        browser,
        bot ? 1 : 0,
      ]
    );
  } catch (error) {
    console.error('Analytics event error:', error);
    res.status(500).json({ error: 'Failed to log event' });
  }
});

// Timezone offset in minutes east of UTC, clamped to the real-world range.
// created_at is stored as UTC, so every date/hour bucket is shifted by this so
// the dashboard reports in the author's local time rather than UTC.
function parseTzOffset(raw: unknown): number {
  const n = parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-840, Math.min(840, n));
}

function tzModifier(minutes: number): string {
  return `${minutes >= 0 ? '+' : ''}${minutes} minutes`;
}

function addDays(isoDate: string, delta: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  return Math.round((b - a) / 86400000) + 1;
}

// Every reported figure excludes crawler traffic and is scoped to the local-date range.
const SCOPE = `is_bot = 0 AND DATE(datetime(created_at, ?)) BETWEEN ? AND ?`;

interface RangeTotals {
  pageViews: number;
  uniqueVisitors: number;
  postViews: number;
  countries: number;
}

function totalsForRange(tzMod: string, start: string, end: string): RangeTotals {
  const scoped = [tzMod, start, end];
  const row = get<{ pageViews: number; uniqueVisitors: number; postViews: number; countries: number }>(
    `SELECT
       SUM(CASE WHEN event_type = 'page_view' THEN 1 ELSE 0 END) AS pageViews,
       COUNT(DISTINCT CASE WHEN event_type = 'page_view' THEN session_id END) AS uniqueVisitors,
       SUM(CASE WHEN event_type = 'post_view' THEN 1 ELSE 0 END) AS postViews,
       COUNT(DISTINCT CASE WHEN LENGTH(country_code) = 2 THEN country_code END) AS countries
     FROM analytics_events
     WHERE ${SCOPE}`,
    scoped
  );
  return {
    pageViews: row?.pageViews || 0,
    uniqueVisitors: row?.uniqueVisitors || 0,
    postViews: row?.postViews || 0,
    countries: row?.countries || 0,
  };
}

// Get analytics summary (author only)
router.get('/summary', authorAuth, (req: Request, res: Response) => {
  try {
    const daysParam = String(req.query.days ?? '30');
    const tzMinutes = parseTzOffset(req.query.tz);
    const tzMod = tzModifier(tzMinutes);

    // "Today" in the author's local timezone.
    const todayLocal = new Date(Date.now() + tzMinutes * 60000).toISOString().slice(0, 10);

    let start: string;
    const end = todayLocal;
    let periodLabel: string;

    if (daysParam === 'all') {
      const first = get<{ d: string | null }>(
        `SELECT MIN(DATE(datetime(created_at, ?))) AS d FROM analytics_events WHERE is_bot = 0`,
        [tzMod]
      );
      start = first?.d || todayLocal;
      periodLabel = 'all time';
    } else {
      const days = Math.max(1, Math.min(3650, parseInt(daysParam, 10) || 30));
      start = addDays(todayLocal, -(days - 1));
      periodLabel = `${days} days`;
    }

    const spanDays = daysBetween(start, end);
    const scoped = [tzMod, start, end];

    // --- Headline totals, plus the immediately preceding window for deltas ---
    const totals = totalsForRange(tzMod, start, end);
    const prevEnd = addDays(start, -1);
    const prevStart = addDays(prevEnd, -(spanDays - 1));
    const hasPrevious = daysParam !== 'all';
    const previous = hasPrevious ? totalsForRange(tzMod, prevStart, prevEnd) : null;

    // --- Daily series (zero-filled below so gaps render as gaps) ---
    const dailyRows = query<{ date: string; views: number; visitors: number }>(
      `SELECT DATE(datetime(created_at, ?)) AS date,
              SUM(CASE WHEN event_type = 'page_view' THEN 1 ELSE 0 END) AS views,
              COUNT(DISTINCT CASE WHEN event_type = 'page_view' THEN session_id END) AS visitors
       FROM analytics_events
       WHERE ${SCOPE}
       GROUP BY date
       ORDER BY date ASC`,
      [tzMod, ...scoped]
    );

    const viewsByDayCountry = query<{ date: string; country: string; country_code: string; count: number }>(
      `SELECT DATE(datetime(created_at, ?)) AS date,
              CASE WHEN LENGTH(country_code) = 2 THEN country ELSE 'Unknown' END AS country,
              COALESCE(country_code, '') AS country_code,
              COUNT(*) AS count
       FROM analytics_events
       WHERE ${SCOPE} AND event_type = 'page_view'
       GROUP BY date, country
       ORDER BY date ASC, count DESC`,
      [tzMod, ...scoped]
    );

    // Zero-fill: a plain GROUP BY omits quiet days entirely, which made the
    // x-axis non-proportional (two adjacent bars could be months apart).
    const byDate = new Map(dailyRows.map(r => [r.date, r]));
    const series: { date: string; views: number; visitors: number }[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const row = byDate.get(d);
      series.push({ date: d, views: row?.views || 0, visitors: row?.visitors || 0 });
      if (series.length > 4000) break; // hard stop against a pathological range
    }

    // Hour-of-day and day-of-week breakdowns were removed: the author travels
    // between timezones, so bucketing every visit into one "local" clock
    // describes the reader's habits in a frame of reference that keeps moving.

    // --- New vs returning visitors, by first-ever appearance of the session ---
    const newReturningRows = query<{ date: string; newVisitors: number; returningVisitors: number }>(
      `WITH firsts AS (
         SELECT session_id, MIN(DATE(datetime(created_at, ?))) AS first_date
         FROM analytics_events
         WHERE is_bot = 0 AND session_id IS NOT NULL
         GROUP BY session_id
       )
       SELECT DATE(datetime(ae.created_at, ?)) AS date,
              COUNT(DISTINCT CASE WHEN f.first_date >= DATE(datetime(ae.created_at, ?)) THEN ae.session_id END) AS newVisitors,
              COUNT(DISTINCT CASE WHEN f.first_date <  DATE(datetime(ae.created_at, ?)) THEN ae.session_id END) AS returningVisitors
       FROM analytics_events ae
       JOIN firsts f ON f.session_id = ae.session_id
       WHERE ae.is_bot = 0 AND ae.event_type = 'page_view'
         AND DATE(datetime(ae.created_at, ?)) BETWEEN ? AND ?
       GROUP BY date
       ORDER BY date ASC`,
      [tzMod, tzMod, tzMod, tzMod, tzMod, start, end]
    );
    const nrMap = new Map(newReturningRows.map(r => [r.date, r]));
    const newVsReturning = series.map(s => ({
      date: s.date,
      newVisitors: nrMap.get(s.date)?.newVisitors || 0,
      returningVisitors: nrMap.get(s.date)?.returningVisitors || 0,
    }));

    // --- Visit depth: how much of the blog a single sitting actually covers ---
    //
    // session_id comes from a 30-day cookie, so it identifies a *visitor*, not a
    // visit — grouping by it alone reports durations spanning days. Split each
    // visitor's event stream into visits on a 30-minute inactivity gap, the
    // industry-standard sessionisation rule.
    const VISIT_GAP_MS = 30 * 60 * 1000;
    const eventRows = query<{ session_id: string; ts: string }>(
      `SELECT session_id, created_at AS ts
       FROM analytics_events
       WHERE ${SCOPE} AND session_id IS NOT NULL
       ORDER BY session_id ASC, created_at ASC
       LIMIT 200000`,
      scoped
    );

    const visits: { events: number; duration: number }[] = [];
    let current: { session: string; start: number; last: number; events: number } | null = null;
    for (const row of eventRows) {
      // created_at is 'YYYY-MM-DD HH:MM:SS' in UTC.
      const t = Date.parse(`${row.ts.replace(' ', 'T')}Z`);
      if (!Number.isFinite(t)) continue;
      if (!current || current.session !== row.session_id || t - current.last > VISIT_GAP_MS) {
        if (current) visits.push({ events: current.events, duration: (current.last - current.start) / 1000 });
        current = { session: row.session_id, start: t, last: t, events: 1 };
      } else {
        current.last = t;
        current.events++;
      }
    }
    if (current) visits.push({ events: current.events, duration: (current.last - current.start) / 1000 });

    const visitCount = visits.length;
    const bucket = (values: number[], edges: number[], labels: string[]) => {
      const counts = new Array(labels.length).fill(0);
      for (const v of values) {
        let i = edges.findIndex(e => v <= e);
        if (i === -1) i = labels.length - 1;
        counts[i]++;
      }
      return labels.map((label, i) => ({ label, count: counts[i] }));
    };
    const visitDepth = {
      visits: visitCount,
      avgEventsPerVisit: visitCount ? visits.reduce((s, v) => s + v.events, 0) / visitCount : 0,
      avgDurationSeconds: visitCount ? visits.reduce((s, v) => s + v.duration, 0) / visitCount : 0,
      // A single-event visit has no measurable dwell time — treat as a bounce.
      bounceRate: visitCount ? visits.filter(v => v.events <= 1).length / visitCount : 0,
      eventBuckets: bucket(visits.map(v => v.events), [1, 3, 10], ['1', '2-3', '4-10', '11+']),
      durationBuckets: bucket(
        visits.map(v => v.duration),
        [10, 60, 300],
        ['< 10s', '10-60s', '1-5 min', '5 min+']
      ),
    };

    // --- Content, events and traffic sources ---
    const topPosts = query<{ post_id: number; count: number; visitors: number; title: string; location_name: string; post_type: string }>(
      `SELECT ae.post_id,
              COUNT(*) AS count,
              COUNT(DISTINCT ae.session_id) AS visitors,
              COALESCE(json_extract(p.content, '$.title'), json_extract(p.content, '$.caption'), 'Untitled') AS title,
              COALESCE(p.location_name, '') AS location_name,
              COALESCE(p.post_type, '') AS post_type
       FROM analytics_events ae
       LEFT JOIN posts p ON ae.post_id = p.id
       WHERE ae.is_bot = 0 AND ae.event_type = 'post_view' AND ae.post_id IS NOT NULL
         AND DATE(datetime(ae.created_at, ?)) BETWEEN ? AND ?
       GROUP BY ae.post_id
       ORDER BY count DESC
       LIMIT 10`,
      scoped
    );

    const eventTypes = query<{ event_type: string; count: number }>(
      `SELECT event_type, COUNT(*) AS count
       FROM analytics_events
       WHERE ${SCOPE}
       GROUP BY event_type
       ORDER BY count DESC`,
      scoped
    );

    // Referrers: aggregate by hostname. Rows predating the referrer_host column
    // still have it NULL, so fall back to parsing the stored URL.
    const referrerRows = query<{ referrer: string | null; referrer_host: string | null; count: number }>(
      `SELECT referrer, referrer_host, COUNT(*) AS count
       FROM analytics_events
       WHERE ${SCOPE} AND event_type = 'page_view'
       GROUP BY referrer, referrer_host`,
      scoped
    );
    const hostTotals = new Map<string, number>();
    for (const row of referrerRows) {
      const host = row.referrer_host || referrerHost(row.referrer) || 'Direct';
      hostTotals.set(host, (hostTotals.get(host) || 0) + row.count);
    }
    const referrers = [...hostTotals.entries()]
      .map(([referrer, count]) => ({ referrer, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const viewsByCountry = query<{ country: string; country_code: string; count: number; visitors: number }>(
      `SELECT country, country_code, COUNT(*) AS count, COUNT(DISTINCT session_id) AS visitors
       FROM analytics_events
       WHERE ${SCOPE} AND event_type = 'page_view'
         AND country IS NOT NULL AND LENGTH(country_code) = 2
       GROUP BY country, country_code
       ORDER BY count DESC
       LIMIT 20`,
      scoped
    );

    const viewsByCity = query<{ city: string; country: string; country_code: string; count: number }>(
      `SELECT city, country, country_code, COUNT(*) AS count
       FROM analytics_events
       WHERE ${SCOPE} AND event_type = 'page_view'
         AND city IS NOT NULL AND LENGTH(country_code) = 2
         AND city NOT LIKE '%://%' AND city NOT LIKE '%:%'
       GROUP BY city, country
       ORDER BY count DESC
       LIMIT 15`,
      scoped
    );

    const deviceBreakdown = query<{ device_type: string; count: number }>(
      `SELECT COALESCE(device_type, 'Unknown') AS device_type, COUNT(*) AS count
       FROM analytics_events
       WHERE ${SCOPE} AND event_type = 'page_view'
       GROUP BY device_type
       ORDER BY count DESC`,
      scoped
    );

    const browserBreakdown = query<{ browser: string; count: number }>(
      `SELECT COALESCE(browser, 'Unknown') AS browser, COUNT(*) AS count
       FROM analytics_events
       WHERE ${SCOPE} AND event_type = 'page_view'
       GROUP BY browser
       ORDER BY count DESC
       LIMIT 10`,
      scoped
    );

    const botCount = get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM analytics_events
       WHERE is_bot = 1 AND DATE(datetime(created_at, ?)) BETWEEN ? AND ?`,
      scoped
    );

    res.json({
      period: periodLabel,
      rangeStart: start,
      rangeEnd: end,
      daysInRange: spanDays,
      tzOffsetMinutes: tzMinutes,

      totalPageViews: totals.pageViews,
      uniqueVisitors: totals.uniqueVisitors,
      totalPostViews: totals.postViews,
      countriesCount: totals.countries,
      // Averaged over every day in the range, including quiet ones.
      avgViewsPerDay: spanDays > 0 ? totals.pageViews / spanDays : 0,
      previous,

      series,
      viewsByDayCountry,
      newVsReturning,
      visitDepth,

      topPosts,
      eventTypes,
      referrers,
      viewsByCountry,
      viewsByCity,
      deviceBreakdown,
      browserBreakdown,
      botEventsExcluded: botCount?.count || 0,
    });
  } catch (error) {
    console.error('Analytics summary error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Get raw events (author only, for export)
router.get('/events', authorAuth, (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 1000, 10000);
    const offset = parseInt(req.query.offset as string) || 0;
    const eventType = req.query.event_type as string | undefined;

    let sql = 'SELECT * FROM analytics_events';
    const params: unknown[] = [];

    if (eventType) {
      sql += ' WHERE event_type = ?';
      params.push(eventType);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const events = query(sql, params);

    // Get total count
    let countSql = 'SELECT COUNT(*) as count FROM analytics_events';
    const countParams: unknown[] = [];
    if (eventType) {
      countSql += ' WHERE event_type = ?';
      countParams.push(eventType);
    }
    const countResult = get<{ count: number }>(countSql, countParams);

    res.json({
      events: events.map(e => ({
        ...e,
        event_data: e.event_data ? JSON.parse(e.event_data as string) : null,
      })),
      total: countResult?.count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Analytics events error:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Export analytics data as CSV (author only)
router.get('/export', authorAuth, (req: Request, res: Response) => {
  try {
    const tzMinutes = parseTzOffset(req.query.tz);
    const tzMod = tzModifier(tzMinutes);
    const includeBots = req.query.include_bots === '1';

    const conditions: string[] = [];
    const params: unknown[] = [];

    // Prefer the dashboard's `days` window so the export matches what's on screen;
    // explicit start_date/end_date still win if supplied.
    const startDate = req.query.start_date as string | undefined;
    const endDate = req.query.end_date as string | undefined;
    const daysParam = req.query.days as string | undefined;

    if (startDate || endDate) {
      if (startDate) {
        conditions.push('created_at >= ?');
        params.push(startDate);
      }
      if (endDate) {
        conditions.push('created_at <= ?');
        params.push(endDate);
      }
    } else if (daysParam && daysParam !== 'all') {
      const days = Math.max(1, Math.min(3650, parseInt(daysParam, 10) || 30));
      const todayLocal = new Date(Date.now() + tzMinutes * 60000).toISOString().slice(0, 10);
      conditions.push(`DATE(datetime(created_at, ?)) BETWEEN ? AND ?`);
      params.push(tzMod, addDays(todayLocal, -(days - 1)), todayLocal);
    }

    if (!includeBots) {
      conditions.push('is_bot = 0');
    }

    let sql = 'SELECT * FROM analytics_events';
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY created_at DESC';

    const events = query(sql, params);

    // Convert to CSV
    const headers = ['id', 'event_type', 'event_data', 'post_id', 'session_id', 'user_agent', 'ip_address', 'referrer', 'referrer_host', 'country', 'city', 'country_code', 'device_type', 'browser', 'is_bot', 'created_at'];
    const csv = [
      headers.join(','),
      ...events.map(e => headers.map(h => {
        const value = (e as Record<string, unknown>)[h];
        if (value === null || value === undefined) return '';
        const str = String(value).replace(/"/g, '""');
        return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
      }).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=analytics-export.csv');
    res.send(csv);
  } catch (error) {
    console.error('Analytics export error:', error);
    res.status(500).json({ error: 'Failed to export analytics' });
  }
});

export default router;
