// Prepare the demo photo set in backend/demo-assets/.
//
// Run once; the output is committed, so a clone needs no network access. Rerun
// only to refresh or extend the set:  npm run demo:assets
//
// What it does, per photo:
//   1. Asks the Commons API for the file's licence and verifies it is public
//      domain or CC0. Anything else aborts the run — no CC-BY or CC-BY-SA,
//      whose attribution chains are a liability in a repo people fork.
//   2. Downloads the original.
//   3. Re-encodes it, which strips the original EXIF. These are other people's
//      photographs and may carry their names, camera serials or home
//      coordinates; none of that should end up in this repo.
//   4. Writes synthetic EXIF in its place: GPS for the landmark and a capture
//      date from the fictional itinerary. The seed then feeds these through
//      the real upload pipeline, so the demo exercises EXIF extraction and
//      reverse geocoding rather than side-loading rows into the database.
//   5. Regenerates docs/CREDITS.md from the verified licence data.

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
const OUT = path.join(REPO, 'backend/demo-assets');
const CACHE = path.join(REPO, 'backend/.demo-asset-cache');
const CREDITS = path.join(REPO, 'docs/CREDITS.md');

// Wikimedia asks for a descriptive User-Agent and rate limits aggressively.
const UA = 'TravelGlobe-demo-asset-prep/1.0 (https://github.com/; one-off, throttled)';
const THROTTLE_MS = 4000;

const ACCEPTED_LICENCES = [/^cc0/i, /^public domain/i];

// The fictional itinerary. Chronological: the route runs north Atlantic ->
// Iberia -> north Africa -> south-east Asia -> Japan -> California, so the
// final leg crosses the Pacific. That leg is the reason the route geometry
// uses great circles (see frontend/src/lib/geo.ts): interpolating lat/lng
// linearly would send it the long way round, back across Asia and Europe.
const SOURCES = [
  {
    key: 'reykjavik',
    file: 'File:Iceland - Reykjavik 043 - Hallgrimskirkja cathedral (6571026853).jpg',
    location: 'Reykjavík, Iceland',
    lat: 64.1417, lng: -21.9266,
    captured: '2025-06-03 11:20:00',
  },
  {
    key: 'oslo',
    file: 'File:Oslo Opera House, Oslo, Norway (Unsplash).jpg',
    location: 'Oslo, Norway',
    lat: 59.9075, lng: 10.7530,
    captured: '2025-06-18 17:45:00',
  },
  {
    key: 'lisbon',
    file: 'File:Jardim Botânico Tropical - Lisbon, Portugal - DSC06555.JPG',
    location: 'Lisbon, Portugal',
    lat: 38.6975, lng: -9.2058,
    captured: '2025-07-05 09:30:00',
  },
  {
    key: 'marrakesh',
    file: 'File:Koutoubia Mosque (34383957483).jpg',
    location: 'Marrakesh, Morocco',
    lat: 31.6236, lng: -7.9932,
    captured: '2025-07-22 18:05:00',
  },
  {
    key: 'cairo',
    file: 'File:Pyramids in Giza - Egypt.jpg',
    location: 'Giza, Egypt',
    lat: 29.9792, lng: 31.1342,
    captured: '2025-08-09 07:15:00',
  },
  {
    key: 'hanoi',
    file: 'File:Hoan Kiem Lake - Hanoi, Vietnam - DSC03695.JPG',
    location: 'Hanoi, Vietnam',
    lat: 21.0287, lng: 105.8524,
    captured: '2025-08-27 06:40:00',
  },
  {
    key: 'kyoto',
    file: 'File:20181110 Fushimi Inari Torii 8.jpg',
    location: 'Kyoto, Japan',
    lat: 34.9671, lng: 135.7727,
    captured: '2025-09-14 08:10:00',
  },
  {
    key: 'kyoto-lanterns',
    file: 'File:20181110 Fushimi Inari Torii 12.jpg',
    location: 'Kyoto, Japan',
    lat: 34.9677, lng: 135.7783,
    captured: '2025-09-14 16:25:00',
  },
  {
    key: 'sanfrancisco',
    file: 'File:San Francisco City Hall - San Francisco, CA - DSC01295.JPG',
    location: 'San Francisco, United States',
    lat: 37.7793, lng: -122.4193,
    captured: '2025-10-02 15:50:00',
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (h) => String(h || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA }, family: 4, timeout: 30000 }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const req = https.get(url, { headers: { 'User-Agent': UA }, family: 4, timeout: 120000 }, (res) => {
      if (res.statusCode !== 200) { file.close(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('download timeout')); });
  });
}

async function licenceInfo(title) {
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json'
    + '&titles=' + encodeURIComponent(title)
    + '&prop=imageinfo&iiprop=url|size|extmetadata'
    + '&iiextmetadatafilter=LicenseShortName|UsageTerms|LicenseUrl|Artist|Credit';
  const json = JSON.parse(await fetchText(url));
  const page = Object.values(json?.query?.pages || {})[0];
  const ii = page?.imageinfo?.[0];
  if (!ii) throw new Error(`no imageinfo for ${title}`);
  const m = ii.extmetadata || {};
  return {
    licence: strip(m.LicenseShortName?.value),
    terms: strip(m.UsageTerms?.value),
    licenceUrl: strip(m.LicenseUrl?.value),
    author: strip(m.Artist?.value),
    url: ii.url,
    page: ii.descriptionurl,
    width: ii.width,
    height: ii.height,
  };
}

// EXIF stores coordinates as three rationals plus a hemisphere reference.
function toRationalDMS(decimal) {
  const abs = Math.abs(decimal);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = Math.round((minFloat - min) * 60 * 100);
  return `${deg}/1 ${min}/1 ${sec}/100`;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(CACHE, { recursive: true });
  fs.mkdirSync(path.dirname(CREDITS), { recursive: true });

  const verified = [];

  console.log('Verifying licences...\n');
  for (const src of SOURCES) {
    await sleep(THROTTLE_MS);
    const info = await licenceInfo(src.file);
    const ok = ACCEPTED_LICENCES.some((re) => re.test(info.licence));
    console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${src.key.padEnd(16)} [${info.licence}] ${info.width}x${info.height}`);
    if (!ok) {
      throw new Error(
        `${src.file} is licensed "${info.licence}", which is not public domain or CC0. `
        + 'Refusing to include it. Pick a different file.'
      );
    }
    verified.push({ ...src, ...info });
  }

  console.log('\nDownloading and processing...\n');
  for (const v of verified) {
    const cached = path.join(CACHE, v.key + path.extname(new URL(v.url).pathname));
    if (!fs.existsSync(cached)) {
      await sleep(THROTTLE_MS);
      await download(v.url, cached);
    }

    const out = path.join(OUT, `${v.key}.jpg`);
    const [datePart, timePart] = v.captured.split(' ');

    // Re-encoding drops the source metadata; withExif then writes only what we
    // put there. Output is JPEG rather than WebP on purpose: it is what a
    // camera would hand the app, so the seed exercises the real upload path.
    await sharp(cached)
      .rotate()
      .resize(1600, null, { withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .withExif({
        IFD0: {
          Make: 'DemoCam',
          Model: 'Seed 1',
          Software: 'prepare-demo-assets.mjs',
        },
        IFD2: {
          DateTimeOriginal: `${datePart.replace(/-/g, ':')} ${timePart}`,
        },
        IFD3: {
          GPSLatitude: toRationalDMS(v.lat),
          GPSLatitudeRef: v.lat >= 0 ? 'N' : 'S',
          GPSLongitude: toRationalDMS(v.lng),
          GPSLongitudeRef: v.lng >= 0 ? 'E' : 'W',
        },
      })
      .toFile(out);

    const kb = Math.round(fs.statSync(out).size / 1024);
    console.log(`  ${v.key.padEnd(16)} -> ${path.basename(out)} (${kb} KB)`);
  }

  const rows = verified.map((v) =>
    `| ${v.key} | [${v.file.replace(/^File:/, '')}](${v.page}) | ${v.author || '—'} | ${v.licence} |`
  ).join('\n');

  fs.writeFileSync(CREDITS, `# Image credits

The photographs in \`backend/demo-assets/\` are used by \`npm run seed\` to
populate the demo site. They are **not** the work of this project's authors.

Every one is either public domain or CC0, verified against its Wikimedia
Commons file page by \`backend/scripts/prepare-demo-assets.mjs\`, which refuses
to include anything under a licence requiring attribution. The table below is
generated by that script.

Each file was re-encoded, which strips the photographer's original EXIF, and
then given synthetic GPS and capture-date metadata matching the fictional
itinerary. The camera fields read \`DemoCam / Seed 1\`. No metadata from the
original photographs survives.

| Demo asset | Source file | Author | Licence |
|---|---|---|---|
${rows}

Credit is not legally required for public domain or CC0 material. It is
recorded here so the provenance of every binary in this repository is
auditable.

The placeholder logo (\`frontend/public/logo.svg\` and \`logo.png\`) was drawn
for this project and carries the same MIT licence as the code.
`, 'utf-8');

  console.log(`\nWrote ${path.relative(REPO, CREDITS)}`);
  console.log(`Cache kept at ${path.relative(REPO, CACHE)} (gitignored); safe to delete.`);
}

main().catch((err) => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
