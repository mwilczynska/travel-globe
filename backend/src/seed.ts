// Populate a fresh database with a fictional demo trip, so a clone of this
// repository shows a working site rather than an empty globe.
//
//   npm run seed
//
// The photos in backend/demo-assets/ are public domain or CC0 landmark shots
// with synthetic GPS written into their EXIF — see docs/CREDITS.md and
// scripts/prepare-demo-assets.mjs. Nothing here is real: the author, the
// captions, the comments and the analytics traffic are all invented.
//
// Photo posts are built by running the demo assets through the same
// extractExif() and processImage() the upload route uses, rather than writing
// rows straight into the database, so seeding exercises the real pipeline and
// the globe pins come from the images' own metadata.

import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { initializeDatabase, getDatabase, saveDatabase } from './db/index.js';
import { extractExif } from './services/exif.js';
import { processImage } from './services/imageProcessor.js';

const DEMO_ASSETS = path.join(__dirname, '../demo-assets');
const UPLOADS_DIR = path.join(__dirname, '../uploads');

const DEMO_AUTHOR = { username: 'demo', displayName: 'Demo Traveller', password: 'demo1234' };
const DEMO_VIEWER_PASSWORD = 'demo1234';

interface PhotoPostSpec {
  assets: string[];
  location: string;
  title: string;
  caption: string;
}

// Chronological. The Kyoto -> San Francisco leg crosses the Pacific, which is
// the case great-circle routing exists to handle: interpolating lat/lng
// linearly would draw it the long way round, back over Asia and Europe.
const PHOTO_POSTS: PhotoPostSpec[] = [
  {
    assets: ['reykjavik.jpg'],
    location: 'Reykjavík, Iceland',
    title: 'Starting at the top',
    caption:
      'Hallgrímskirkja, and the first stamp in the passport. It never really got dark — '
      + 'we kept forgetting to eat because the sun refused to set.',
  },
  {
    assets: ['oslo.jpg'],
    location: 'Oslo, Norway',
    title: 'Walking on the roof',
    caption:
      'The opera house lets you climb it. We sat on the marble slope until the fjord went '
      + 'orange and somebody started busking below us.',
  },
  {
    assets: ['lisbon.jpg'],
    location: 'Lisbon, Portugal',
    title: 'Shade in the tropical garden',
    caption:
      'Thirty-six degrees, so we hid in the Jardim Botânico Tropical for most of the '
      + 'afternoon. No regrets. The palms do a better job than any air conditioning.',
  },
  {
    assets: ['marrakesh.jpg'],
    location: 'Marrakesh, Morocco',
    title: 'Koutoubia at golden hour',
    caption:
      'You can hear the call to prayer from anywhere in the medina, but standing under '
      + 'the minaret at sunset is something else entirely.',
  },
  {
    assets: ['cairo.jpg'],
    location: 'Giza, Egypt',
    title: 'Up before the heat',
    caption:
      'Out the door at half five to beat both the sun and the tour buses. Worth every '
      + 'minute of lost sleep.',
  },
  {
    assets: ['hanoi.jpg'],
    location: 'Hanoi, Vietnam',
    title: 'Morning laps around Hoan Kiem',
    caption:
      'The whole city seems to walk this lake before work. We joined in, badly, and were '
      + 'overtaken repeatedly by people twice our age.',
  },
  {
    // Two images: gives the lightbox gallery mode something to page through.
    assets: ['kyoto.jpg', 'kyoto-lanterns.jpg'],
    location: 'Kyoto, Japan',
    title: 'Ten thousand gates',
    caption:
      'Fushimi Inari at eight in the morning, before the crowds. Keep climbing past the '
      + 'first few hundred gates and you get the mountain almost to yourself.',
  },
  {
    assets: ['sanfrancisco.jpg'],
    location: 'San Francisco, United States',
    title: 'Across the Pacific',
    caption:
      'Nine time zones in eleven hours and the date went backwards. Last stop before '
      + 'home — and the longest line on the map.',
  },
];

function insertPost(
  authorId: number,
  postType: string,
  content: Record<string, unknown>,
  opts: { lat?: number; lng?: number; location?: string; capturedAt?: string } = {}
): number {
  const db = getDatabase();
  db.run(
    `INSERT INTO posts (author_id, post_type, content, latitude, longitude, location_name, captured_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      authorId,
      postType,
      JSON.stringify(content),
      opts.lat ?? null,
      opts.lng ?? null,
      opts.location ?? null,
      opts.capturedAt ?? null,
      opts.capturedAt ?? new Date().toISOString(),
      opts.capturedAt ?? new Date().toISOString(),
    ]
  );
  return db.exec('SELECT last_insert_rowid()')[0].values[0][0] as number;
}

async function seedPhotoPosts(authorId: number): Promise<number[]> {
  const ids: number[] = [];
  const db = getDatabase();

  for (const spec of PHOTO_POSTS) {
    let lat: number | undefined;
    let lng: number | undefined;
    let capturedAt: string | undefined;
    const mediaRows: Array<{
      filePath: string; width: number; height: number; sizeBytes: number;
      original: string; exif: Record<string, unknown>;
    }> = [];

    for (const asset of spec.assets) {
      const src = path.join(DEMO_ASSETS, asset);
      if (!fs.existsSync(src)) {
        throw new Error(
          `Missing demo asset ${asset}. Run "npm run demo:assets" to fetch them, `
          + 'or check that backend/demo-assets/ was cloned.'
        );
      }

      // The same two calls the upload route makes.
      const exif = await extractExif(src);
      const processed = await processImage(src, UPLOADS_DIR, asset);

      // The first image of a post supplies the post's own coordinates and
      // date, exactly as the create-post UI does.
      if (lat === undefined && exif.latitude !== undefined) {
        lat = exif.latitude;
        lng = exif.longitude;
      }
      if (!capturedAt && exif.capturedAt) capturedAt = exif.capturedAt.toISOString();

      mediaRows.push({
        filePath: processed.filePath,
        width: processed.width,
        height: processed.height,
        sizeBytes: processed.sizeBytes,
        original: asset,
        exif: exif as unknown as Record<string, unknown>,
      });
    }

    const postId = insertPost(authorId, 'photo',
      { title: spec.title, caption: spec.caption },
      { lat, lng, location: spec.location, capturedAt });

    for (const m of mediaRows) {
      db.run(
        `INSERT INTO media (post_id, file_path, file_type, original_filename, size_bytes, width, height, exif_data)
         VALUES (?, ?, 'image', ?, ?, ?, ?, ?)`,
        [postId, m.filePath, m.original, m.sizeBytes, m.width, m.height, JSON.stringify(m.exif)]
      );
    }

    ids.push(postId);
    console.log(`  photo   ${spec.location.padEnd(30)} ${spec.assets.length} image(s)  ${lat?.toFixed(3)}, ${lng?.toFixed(3)}`);
  }

  return ids;
}

function seedOtherPostTypes(authorId: number): number[] {
  const ids: number[] = [];

  ids.push(insertPost(authorId, 'text', {
    title: 'What we packed, and what we should not have',
    body:
      'Eleven weeks in one carry-on each. The things earning their place: a power bank, '
      + 'merino everything, and a paper map for when the phone dies.\n\n'
      + 'The things that did not: a travel kettle, three novels we never opened, and a '
      + 'second pair of shoes that saw daylight exactly once.',
  }, { location: 'Lisbon, Portugal', lat: 38.7223, lng: -9.1393, capturedAt: '2025-07-08T10:00:00.000Z' }));

  ids.push(insertPost(authorId, 'quote', {
    text: 'A good traveller has no fixed plans and is not intent on arriving.',
    source: 'Laozi',
  }, { location: 'Marrakesh, Morocco', lat: 31.6295, lng: -7.9811, capturedAt: '2025-07-25T09:00:00.000Z' }));

  ids.push(insertPost(authorId, 'link', {
    title: 'Seat 61: how to get anywhere by train',
    url: 'https://www.seat61.com/',
    description:
      'The route from Lisbon to Marrakesh without flying, worked out in more detail than '
      + 'any airline would ever bother with.',
    caption: 'Half our itinerary came out of this site.',
  }, { location: 'Lisbon, Portugal', lat: 38.7223, lng: -9.1393, capturedAt: '2025-07-10T12:00:00.000Z' }));

  console.log(`  text    What we packed`);
  console.log(`  quote   Laozi`);
  console.log(`  link    Seat 61`);
  return ids;
}

function seedComments(postIds: number[]): void {
  const db = getDatabase();
  const comments: Array<[number, string, string]> = [
    [0, 'Sam', 'That sky is unreal. Did you get any northern lights?'],
    [0, 'Priya', 'Jealous. Say hi to the puffins for me.'],
    [3, 'Dad', 'Your mother wants to know if you are eating properly.'],
    [6, 'Yuki', 'If you go back, try the trail behind the summit shrine — almost nobody walks it.'],
    [6, 'Sam', 'Two photos is not enough. Post more of these.'],
    [7, 'Priya', 'Welcome back to the western hemisphere!'],
  ];

  for (const [idx, name, text] of comments) {
    if (postIds[idx] === undefined) continue;
    db.run(
      `INSERT INTO comments (post_id, author_name, content, approved) VALUES (?, ?, ?, 1)`,
      [postIds[idx], name, text]
    );
  }
  console.log(`  ${comments.length} approved comments`);
}

function seedAnalytics(postIds: number[]): void {
  const db = getDatabase();

  // Fabricated traffic, so the analytics dashboard has something to draw. Real
  // visitors are geolocated from their IP at write time; these rows carry the
  // resolved fields directly and a documentation-range address (RFC 5737), so
  // no real IP appears anywhere.
  const visitors = [
    { country: 'United Kingdom', code: 'GB', city: 'London', device: 'desktop', browser: 'Chrome', ref: 'google.com' },
    { country: 'United Kingdom', code: 'GB', city: 'Bristol', device: 'mobile', browser: 'Safari', ref: null },
    { country: 'Australia', code: 'AU', city: 'Melbourne', device: 'mobile', browser: 'Chrome', ref: 'facebook.com' },
    { country: 'Australia', code: 'AU', city: 'Sydney', device: 'desktop', browser: 'Firefox', ref: null },
    { country: 'United States', code: 'US', city: 'Portland', device: 'desktop', browser: 'Chrome', ref: 'news.ycombinator.com' },
    { country: 'Germany', code: 'DE', city: 'Berlin', device: 'tablet', browser: 'Safari', ref: null },
    { country: 'Japan', code: 'JP', city: 'Osaka', device: 'mobile', browser: 'Chrome', ref: 'google.com' },
    { country: 'Canada', code: 'CA', city: 'Toronto', device: 'desktop', browser: 'Edge', ref: null },
  ];

  const UA_BY_DEVICE: Record<string, string> = {
    desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
    mobile: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
    tablet: 'Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/604.1',
  };

  const insert = (row: {
    type: string; postId: number | null; session: string; v: typeof visitors[number]; at: Date;
  }) => {
    db.run(
      `INSERT INTO analytics_events
         (event_type, event_data, post_id, session_id, user_agent, ip_address, referrer,
          referrer_host, country, city, country_code, device_type, browser, is_bot, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        row.type,
        null,
        row.postId,
        row.session,
        UA_BY_DEVICE[row.v.device],
        '192.0.2.1',
        row.v.ref ? `https://${row.v.ref}/` : null,
        row.v.ref,
        row.v.country,
        row.v.city,
        row.v.code,
        row.v.device,
        row.v.browser,
        row.at.toISOString(),
      ]
    );
  };

  // Six weeks of traffic, with a weekday bias so the time series has shape.
  let sessions = 0;
  let events = 0;
  const now = Date.now();
  for (let daysAgo = 41; daysAgo >= 0; daysAgo--) {
    const day = new Date(now - daysAgo * 86400000);
    const weekday = day.getUTCDay();
    const visits = (weekday === 0 || weekday === 6) ? 2 + (daysAgo % 2) : 3 + (daysAgo % 4);

    for (let i = 0; i < visits; i++) {
      const v = visitors[(daysAgo + i) % visitors.length];

      // Roughly a third of visits reuse an earlier visitor's session id.
      // session_id is a 30-day cookie, so it identifies a visitor rather than a
      // visit — without some reuse every visitor is new, and the dashboard's
      // new-vs-returning split and visit-depth sessionisation have nothing to
      // show.
      const returning = (daysAgo + i) % 3 === 0 && daysAgo < 35;
      const session = returning
        ? `demo-visitor-${(daysAgo + i) % 14}`
        : `demo-${daysAgo}-${i}`;
      sessions++;

      const start = new Date(day);
      start.setUTCHours(8 + ((daysAgo + i) % 12), (i * 17) % 60, 0, 0);
      insert({ type: 'page_view', postId: null, session, v, at: start });
      events++;

      // A few post views per visit, drifting through the feed.
      const depth = 1 + ((daysAgo + i) % 4);
      for (let d = 0; d < depth && d < postIds.length; d++) {
        const at = new Date(start.getTime() + (d + 1) * 90000);
        insert({ type: 'post_view', postId: postIds[(i + d) % postIds.length], session, v, at });
        events++;
      }

      if ((daysAgo + i) % 3 === 0) {
        insert({ type: 'globe_interaction', postId: null, session, v, at: new Date(start.getTime() + 60000) });
        events++;
      }
      if ((daysAgo + i) % 5 === 0) {
        insert({ type: 'lightbox_open', postId: postIds[i % postIds.length], session, v, at: new Date(start.getTime() + 200000) });
        events++;
      }
    }
  }

  // A little crawler traffic. It is flagged rather than dropped, so the
  // dashboard can exclude it while the CSV export still shows it.
  for (let daysAgo = 20; daysAgo >= 0; daysAgo -= 4) {
    const at = new Date(now - daysAgo * 86400000);
    db.run(
      `INSERT INTO analytics_events
         (event_type, post_id, session_id, user_agent, ip_address, is_bot, created_at)
       VALUES ('page_view', NULL, ?, ?, '192.0.2.9', 1, ?)`,
      [`bot-${daysAgo}`, 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', at.toISOString()]
    );
    events++;
  }

  console.log(`  ${events} analytics events across ${sessions} visits (plus flagged bot traffic)`);
}

async function main(): Promise<void> {
  console.log('\nSeeding demo data\n=================\n');

  await initializeDatabase();
  const db = getDatabase();

  // Never touch a database that already has content.
  const existing = db.exec('SELECT COUNT(*) FROM posts')[0].values[0][0] as number;
  if (existing > 0) {
    console.error(
      `Refusing to seed: the database already has ${existing} post(s).\n`
      + 'Seeding is only for a fresh install. To start over, stop the backend and delete\n'
      + 'backend/data/travel-blog.db, then run this again.'
    );
    process.exit(1);
  }

  db.run('INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)',
    [DEMO_AUTHOR.username, bcrypt.hashSync(DEMO_AUTHOR.password, 10), DEMO_AUTHOR.displayName]);
  const authorId = db.exec('SELECT last_insert_rowid()')[0].values[0][0] as number;
  console.log(`  author  ${DEMO_AUTHOR.username} / ${DEMO_AUTHOR.password}`);

  db.run('INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)',
    ['viewer_password_hash', bcrypt.hashSync(DEMO_VIEWER_PASSWORD, 10)]);
  db.run('INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)',
    ['site_title', 'Travel Globe']);
  db.run('INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)',
    ['comment_moderation', 'off']);
  console.log(`  viewer password: ${DEMO_VIEWER_PASSWORD}\n`);

  const photoIds = await seedPhotoPosts(authorId);
  const otherIds = seedOtherPostTypes(authorId);
  seedComments(photoIds);
  seedAnalytics([...photoIds, ...otherIds]);

  saveDatabase();

  console.log(`
Done. Start the app and sign in:

  cd backend && npm run dev
  cd frontend && npm run dev

  http://localhost:5173
  viewer password : ${DEMO_VIEWER_PASSWORD}
  author login    : ${DEMO_AUTHOR.username} / ${DEMO_AUTHOR.password}
`);
}

main().catch((err) => {
  console.error('\nSeed failed:', err.message);
  process.exit(1);
});
