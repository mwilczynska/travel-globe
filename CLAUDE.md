# Travel Globe - Development Reference

## Project Overview
A travel blog with Tumblr-style posts and an interactive 3D globe showing the
travel route. Two access levels: a shared password for viewers, and author
accounts for whoever is writing.

## Deployment notes

The stack runs under Docker Compose v2 (`docker compose`, with a space).
`docker-compose.yml` is the production stack; `docker-compose.local.yml` is the
certificate-free variant. See README.md for the commands.

Things worth knowing before touching a live deployment:

- **Back up before deploying.** Schema migrations write to the database.
  `docker cp <backend-container>:/app/data/travel-blog.db ./backup.db`
- **Data lives in named volumes** (`db-data`, `uploads`) and survives rebuilds.
  Never run `docker compose down -v` — `-v` deletes them, and with them every
  post, comment, account and uploaded photo.
- **Restart the backend after any out-of-band database change.** sql.js holds
  the database in memory and only reads from disk at startup, so running
  `setup`/`seed` or restoring a file while the backend is up will be overwritten
  on its next write. To restore: stop the backend, copy the file in, start it.
- Site identity comes from `.env` and `frontend/public/branding/`, both
  gitignored. `VITE_*` values are inlined at build time, so changing them needs
  `--build`, not just a restart.

### Problems solved during the first deployment

Kept because each one cost real time and the cause is not obvious:

1. **TypeScript**: `Comment.approved` is `number`, not `boolean` — SQLite stores
   0/1. `src/api/client.ts` needed null coalescing on the CSRF token return.
2. **Docker build**: `schema.sql` was not copied to `dist` (added a COPY), and
   `/app/data` did not exist (added `mkdir -p data`).
3. **sql.js in memory**: see the restart note above. Running setup against a live
   backend loses the change.
4. **Geocoding timed out in Docker**: Node's `fetch` (undici) hangs connecting to
   Nominatim from a container because it tries IPv6 first. `wget` worked from the
   same container; `fetch` did not. Fixed by using the native `https` module with
   `family: 4` to force IPv4.
5. **EXIF GPS never arrived**: `exifr.parse()` with a `pick` list silently drops
   `latitude`/`longitude`, because those are values exifr *derives* from the GPS
   block rather than tags in their own right. GPS needs its own `exifr.gps()`
   read — see `services/exif.ts`.

## Progress Tracker

### Phase 1: Project Setup & Core Infrastructure ✅ COMPLETE
- [x] Backend scaffold (Express + TypeScript)
- [x] Frontend scaffold (Vite + React + TypeScript + Tailwind)
- [x] SQLite database with schema
- [x] Development environment working

### Phase 2: Authentication Systems ✅ COMPLETE
- [x] Viewer password gate
- [x] Author login/logout
- [x] Session management
- [x] Auth middleware (viewerAuth, authorAuth)

### Phase 3: Photo Posts & Media Upload ✅ COMPLETE
- [x] File upload endpoint with multer
- [x] EXIF extraction (GPS, capture date, camera info)
- [x] Image processing with sharp (resize, WebP compression)
- [x] HEIC/HEIF file support
- [x] Reverse geocoding (auto-populate location from GPS)
- [x] Location search/picker (OpenStreetMap integration)
- [x] Photo post creation UI
- [x] Photo post display in feed
- [x] Media uploader with drag-and-drop

### Phase 4: The Interactive Globe ✅ COMPLETE
- [x] Install globe.gl dependency
- [x] Create Globe.tsx component with Globe.gl
- [x] Split layout (globe + feed side by side on desktop)
- [x] Click pin to scroll to corresponding post
- [x] Hover post to focus globe on location
- [x] Route line connecting locations chronologically (animated arcs)

### Phase 5: Feed & Layout Polish ✅ COMPLETE
- [x] Basic feed display
- [x] Post cards with location and date
- [x] Edit/delete buttons for authors
- [x] Post ordering (newest first)
- [x] Author login link for viewers
- [x] Comment counter on posts
- [x] Mobile responsive layout (post cards, globe sizing)
- [x] Mobile testing setup (network dev server access)
- [x] Globe zoom/pan hint icons
- [x] ~~Tag filtering UI~~ (removed — tags not used)

### Phase 6: Additional Post Types ✅ COMPLETE
- [x] QuotePost.tsx component
- [x] LinkPost.tsx component with preview
- [x] TextPost.tsx component
- [x] AudioPost.tsx component with custom player
- [x] VideoPost.tsx component with HTML5 player (legacy — now unified into PhotoPost)
- [x] Update CreatePost.tsx to support all types
- [x] Post type selector in create UI (5 types: photo/video, text, quote, link, audio)

### Phase 7: Comments System ✅ COMPLETE
- [x] Comments database table
- [x] Comment submission endpoint
- [x] Comment moderation endpoints
- [x] Comment form on posts
- [x] Comment display on posts
- [x] CommentModeration.tsx admin panel
- [x] Edit/delete buttons on comments in feed (for authors)

### Phase 7.5: Additional Features ✅ COMPLETE
- [x] EditPost.tsx component (edit existing posts)
- [x] Edit post route (/edit/:postId)
- [x] Media editing in EditPost (remove existing + add new media)
- [x] Media reordering in CreatePost and EditPost (arrow buttons on hover)
- [x] Multi-file upload support for photo posts
- [x] Analytics/Telemetry system with IP geolocation and device tracking
- [x] Analytics database table (analytics_events with country/city/device/browser columns)
- [x] Analytics tracking hook (useAnalytics)
- [x] AnalyticsDashboard.tsx with time range selector, stacked country chart, device/browser breakdown, city table, top posts with titles
- [x] CSV export for analytics data
- [x] Comment moderation toggle (pre-approval on/off, default off)
- [x] Comments shown expanded by default on all post types
- [x] Site settings API for storing config
- [x] Custom date field for posts (auto-populated from EXIF or current date)
- [x] IP address logging for viewer logins and comment submissions

### Phase 8: Security & Production Prep ✅ COMPLETE
- [x] CSRF protection (double-submit cookie pattern)
- [x] Rate limiting (with toggle in Settings)
- [x] Input validation middleware (express-validator)
- [x] XSS sanitization (DOMPurify) on comment content
- [x] Error handling middleware
- [x] Authorization checks on post edit/delete
- [x] docker-compose.yml with backend + nginx frontend
- [x] Backend Dockerfile (multi-stage Node.js build)
- [x] Frontend Dockerfile (multi-stage with nginx)
- [x] nginx.conf for SPA routing and API proxy

### Phase 9: UI Polish & Branding ✅ COMPLETE
- [x] Configurable site name and logo (branding is deployment config, not source)
- [x] Custom logo (PNG)
- [x] Mobile Map/Blog mode toggle with PostCarousel
- [x] Globe container styling (rounded border, shadow on desktop)
- [x] ~~Tag filter redesign~~ (removed with tags)
- [x] Header redesign (centered on desktop, left-aligned on mobile for users)
- [x] Settings page with rate limiting and moderation toggles
- [x] Fixed mobile error handling (abort errors)

### Phase 10: Infinite Scroll ✅ COMPLETE
- [x] Infinite scroll for feed and PostCarousel (replace pagination)
  - IntersectionObserver triggers loading next page when near bottom
  - Backend uses cursor-based pagination (page + limit params)

### Phase 13: Analytics Overhaul ✅ COMPLETE
- [x] Zero-filled, properly-labelled date axis (quiet days render as gaps)
- [x] Day/week/month granularity + views/visitors metric toggles
- [x] Local-timezone reporting (`tz` query param), replacing UTC-only buckets
- [x] Hour-of-day, day-of-week and day×hour heatmap
- [x] New vs returning visitors; visit depth with 30-min sessionisation
- [x] Period-over-period deltas on every headline figure
- [x] Bot detection and exclusion (`is_bot`)
- [x] Referrers grouped by hostname with a Direct bucket (`referrer_host`)
- [x] Post-view tracking wired up — "Top Posts" was previously always empty
- [x] Lightbox / gallery / media-play / outbound-link tracking
- [x] Export CSV respects the selected range
- [x] Table view on the time series
- [x] ~~Hour-of-day / day-of-week / heatmap~~ (removed — the author moves between
      timezones, so one "local" clock describes readers in a frame of reference
      that keeps moving)

### Phase 12: Globe Routing, Gallery & Drag Reorder ✅ COMPLETE
- [x] Great-circle route legs (fixes long-way-round paths across the antimeridian)
- [x] Route line clipped at the true horizon (fixes line showing through the globe)
- [x] Header z-index raised above the mobile map-mode toggle bar
- [x] Drag-anywhere media reordering in CreatePost/EditPost (replaces one-slot arrow buttons)
- [x] Lightbox gallery mode with keyboard navigation

### Phase 11: Media Swipe Gestures ✅ COMPLETE
- [x] Swipe left/right to navigate media in lightbox (mobile)
  - Touch swipe with 50px threshold, horizontal-dominant check
  - Arrow buttons kept for desktop/non-touch users
  - Image counter (e.g. "2 / 5") shown at bottom of lightbox
  - Swipe flag prevents accidental lightbox close on swipe end

---

## Tech Stack
- **Frontend:** React 18 + TypeScript + Tailwind CSS + Vite
- **Backend:** Node.js + Express + TypeScript
- **Database:** SQLite (sql.js)
- **Globe:** Globe.gl (Three.js wrapper)
- **Images:** sharp + exifr + heic-convert
- **Analytics:** ua-parser-js (device/browser), ip-api.com (geolocation)

## Key Files
- `backend/src/index.ts` - Express server entry
- `backend/src/routes/posts.ts` - Post CRUD endpoints (including media update on PUT)
- `backend/src/routes/` - Other API endpoints
- `backend/src/middleware/rateLimiter.ts` - Rate limiting (with toggle support)
- `frontend/src/App.tsx` - Main app with routes and layout
- `frontend/src/components/globe/Globe.tsx` - Interactive 3D globe
- `frontend/src/components/feed/PostCarousel.tsx` - Mobile map mode carousel
- `frontend/src/components/admin/CreatePost.tsx` - Post creation (5 types: photo/video, text, quote, link, audio)
- `frontend/src/components/admin/EditPost.tsx` - Post editing (with media editing)
- `frontend/src/components/admin/MediaUploader.tsx` - Drag-and-drop file upload (supports multiple)
- `frontend/src/components/admin/SortableMediaGrid.tsx` - Drag-anywhere media reordering (shared by CreatePost/EditPost)
- `frontend/src/lib/geo.ts` - Great-circle route geometry + horizon clipping maths for the globe
- `frontend/src/components/admin/AnalyticsDashboard.tsx` - Analytics dashboard
- `frontend/src/components/admin/analyticsCharts.tsx` - Chart primitives + validated categorical palette
- `frontend/src/components/admin/CommentModeration.tsx` - Settings page
- `backend/src/routes/analytics.ts` - Analytics API with IP geolocation and UA parsing
- `backend/src/seed.ts` - Demo data (`npm run seed`), built through the real upload pipeline
- `backend/scripts/prepare-demo-assets.mjs` - Licence-checks, downloads and re-EXIFs the demo photos
- `backend/demo-assets/` - Public domain / CC0 landmark photos used by the seed
- `frontend/src/config.ts` - Site name and tagline from `VITE_*`, with neutral defaults
- `frontend/nginx.conf.template` / `nginx.http.conf.template` / `nginx-app.conf` - Server config
- `docs/CREDITS.md` - Provenance and licence of every demo photo

## Demo and local accounts

`npm run seed` creates a demo author (`demo` / `demo1234`) and sets the viewer
password to `demo1234`. These are throwaway credentials for a local demo
database and have no bearing on any deployment.

Passwords live in the SQLite database, which never travels with the code:
- `backend/data/*.db` is gitignored
- `.dockerignore` excludes `backend/data/`
- production data is a named Docker volume, outside the image

Deploying ships code only; a deployment keeps its own accounts and passwords. To
change them, run `npm run setup`, or update `site_settings.viewer_password_hash`
and `users.password_hash` with bcrypt hashes — then **restart the backend**.

## Development Commands
```bash
# IMPORTANT (Windows): run these from the repository's real path, not through a
# directory junction or symlink. Launched through one, Vite's project root can
# differ from the resolved realpath, so /src/*.tsx falls outside the root, skips
# the transform pipeline, and reaches the browser as raw TypeScript
# ("SyntaxError: missing ) after argument list" on main.tsx).

# Start backend
cd backend && npm run dev

# Start frontend (local only)
cd frontend && npm run dev

# Start frontend (accessible from mobile on same WiFi)
cd frontend && npx vite --host

# Populate a fresh database with the demo trip
cd backend && npm run seed

# Create a real author account (and set the viewer password)
cd backend && npm run setup

# Re-fetch and re-process the demo photos (rarely needed; output is committed)
cd backend && npm run demo:assets
```

## Production Deployment
```bash
# Using Docker (Compose v2 on the server)
docker compose up --build -d
```

`docker-compose.yml` **is** the production stack — named volumes for the database
and uploads, ports 80 and 443, and a read-only `/etc/letsencrypt` mount for TLS.
Two parts are load-bearing:

- Switching `db-data` / `uploads` to bind mounts points the backend at an empty
  directory, and it then creates a blank database — the site comes up with no
  posts, comments or accounts. The real data stays behind in the named volume.
- Dropping port 443 or the letsencrypt mount breaks HTTPS: nginx terminates TLS
  itself (`frontend/nginx.conf.template`) and reads the certificates from that
  path, under `/etc/letsencrypt/live/${SITE_DOMAIN}/`.

Keep the tracked compose file identical to what is actually deployed. A repo that
carries a bind-mount compose file while the real config lives only as an
uncommitted change on the server is one `git pull` away from a blank-database
deploy.

`docker-compose.local.yml` is the certificate-free variant: HTTP only, no
letsencrypt mount, and nginx renders the template in `/etc/nginx/templates-http`
instead. Use it to try the containers locally.

## Technical Notes
- Images compressed to max 2000px wide, WebP format
- HEIC files converted to JPEG before processing (heic-convert for Windows)
- All timestamps in UTC, displayed in user's local timezone
- Three.js pinned to 0.170.0 for mobile WebGL compatibility
- Globe uses OpenStreetMap tiles for detailed zoom
- Rate limiting can be toggled on/off in Settings page
- Site settings stored in `site_settings` table (key-value pairs)
- Media editing uses replace-all pattern (delete + re-insert)
- Photo and video post types are unified — videos upload alongside photos in a single "Photo/Video" post type. Legacy `post_type='video'` rows route to PhotoPost. DB schema unchanged.
- Upload size limit: 200 MB per file (multer + nginx)
- MediaUploader supports `multiple` prop for multi-file selection (photo/video posts)
- Orphaned upload files are kept on disk (cheap storage, avoids deletion complexity)
- Android Chrome file picker is limited (no third-party gallery apps) — use Firefox on Android for full app chooser
- Analytics `/summary` takes `days` and `tz` (minutes east of UTC). All date/hour buckets are shifted to the author's local time — `created_at` is stored UTC
- Daily series is zero-filled server-side; without it a plain `GROUP BY DATE()` omits quiet days and the x-axis stops being proportional to time
- `session_id` is a 30-day cookie, so it identifies a *visitor*, not a visit. Visit metrics split each visitor's stream on a 30-minute idle gap — grouping by session_id alone reports durations spanning days
- Bot traffic is flagged (`is_bot`) at write time, not dropped: excluded from every reported figure but still present in the raw CSV export
- `validEventTypes` in routes/analytics.ts must stay in sync with the trackers in hooks/useAnalytics.ts — events missing from the whitelist are rejected with a 400 and silently lost
- `useAnalytics()` returns trackers only. Page views come from the separate `usePageView()`, called once at the top level — when the page view lived inside useAnalytics, every component using it emitted another one
- Post views fire from an IntersectionObserver after 1s at ≥50% visible, measured against `min(viewport, post)` — photo posts are routinely taller than the screen, so a plain intersectionRatio never reaches 0.5
- Chart colours come from a validated categorical order in analyticsCharts.tsx (adjacent-pair CVD ΔE 9.1 on white). Slots are assigned in fixed order and never cycled; a 7th country folds into "Other". Three slots are sub-3:1 contrast, so those charts also ship a table view
- Analytics geolocation uses ip-api.com (free tier, HTTP only) with in-memory cache and 3-second timeout
- Analytics geo lookup is non-blocking — response sent immediately, DB updated after lookup completes
- Private/local IPs are detected and skipped for geo lookup (isPrivateIp helper)
- Tags system removed from frontend — backend routes remain as harmless dead code
- Comments are expanded by default on all post types
- Lightbox uses z-[9999] and body scroll lock to prevent globe markers bleeding through on mobile
- Lightbox has a gallery mode (grid of all media in the post): "Gallery" button, `g` key, the feed's "View all N" button, or the "+N" tile. Arrows/Escape navigate; Escape steps out of the gallery before closing
- Header is `z-50` — it must outrank the globe pane (`z-20`) and the mobile map-mode toggle bar (`z-30`). At equal z-index the later DOM node wins and the blue bar paints over the header once the page scrolls
- Media reordering is drag-anywhere (pointer events, works on touch); arrow keys still reorder for keyboard users
- Site identity is configuration, never source. `frontend/src/config.ts` and `vite.config.ts` hold the neutral defaults; a deployment overrides them via `VITE_*` in `.env`, and drops its logo into the gitignored `frontend/public/branding/`. Nothing identifying a deployment belongs in a commit
- `vite.config.ts` writes the branding defaults into `process.env` before Vite's `%VITE_*%` HTML replacement runs. Without that, an unconfigured clone ships a literal `%VITE_SITE_NAME%` as its tab title, because Vite leaves unset placeholders untouched
- nginx config is two templates plus a shared `nginx-app.conf` snippet. `${SITE_DOMAIN}` is substituted by the base image's envsubst entrypoint at container start; `NGINX_ENVSUBST_FILTER='^SITE_'` stops it eating nginx's own `$host`/`$uri`/`$scheme`. The snippet is copied verbatim, never templated
- `extractExif()` reads GPS with a **separate** `exifr.gps()` call. `exifr.parse()` with a `pick` list drops `latitude`/`longitude` — they are derived from the GPS block, not tags, so a picked parse silently returns no coordinates
- `npm run seed` builds the demo trip from `backend/demo-assets/` through the real `extractExif` → `processImage` path, so pins come from the photos' own EXIF. It refuses to run when `posts` is non-empty
- Demo photos are public domain / CC0 only, re-encoded to strip the photographer's metadata and given synthetic GPS. `scripts/prepare-demo-assets.mjs` regenerates them and `docs/CREDITS.md`, and aborts on any licence that is not PD or CC0

## Publishing to the public repository

> **Before editing anything, confirm which branch the work belongs on.** This
> folder holds a private branch and a public snapshot branch, and they are not
> interchangeable. Ask; do not assume from whichever branch happens to be checked
> out. The usual answer is the **private** branch — day-to-day feature work goes
> there, and only a deliberate publishing step moves it to the public one.


This project is developed privately and published from a separate history-free
branch, because the private history contains personal photographs and server
details that a `git filter-repo` pass would have to strip. The public branch is
a single root commit with no parent, so there is no history to leak.

Before any push to the public remote:

```bash
scripts/check-public-safe.sh public && git push public public:main
```

The script greps a ref's files *and commit messages* for the strings in
`.public-blocklist`, and refuses trees containing databases, env files, keys,
private media directories or unexpected IPv4 literals. `.public-blocklist` is
gitignored — a checked-in blocklist would publish exactly what it guards — so
copy `.public-blocklist.example` and fill in the real values.

The public branch is refreshed by copying files across, never by merging (the
two histories share no commits):

```bash
git checkout public
git checkout <sanitised-branch> -- .
git commit -m "Update from private"
scripts/check-public-safe.sh public && git push public public:main
git checkout main
```

Take the files from whichever branch actually holds the identity-free code. If
that is not the branch you deploy, the two will drift, and copying from the
wrong one publishes the domain — which is the mistake the script exists to
catch.

## Ports
- Backend: 3001
- Frontend dev: 5173
- Frontend preview: 4173

**Open the app at http://localhost:5173** — port 3001 is the API only and returns a
bare 404 at `/`. Vite proxies `/api` and `/uploads` through to 3001.

## Windows Development Notes
- **Do not run yt-dlp, youtube-dl, or ffmpeg from this directory.** These Unix-targeted tools create `nul` and `cookies.txt` files on Windows. `nul` is a reserved device name, so the resulting file is awkward to delete and breaks folder-syncing tools. Run media download tools from a separate folder.
- Both `nul` and `cookies.txt` are in `.gitignore` as a safeguard.
- When commiting to repo don't memtion claude as author

---

## Globe Route Line: Resolved

### Problem
Route lines on the globe needed constant visual thickness and constant dash size regardless of zoom level, without clipping through the globe surface at any zoom.

### Solution: Custom Three.js Line2 with depthTest:false + clipping plane
- Uses `Line2` + `LineGeometry` + `LineMaterial` from `three/examples/jsm/lines/`
- `LineMaterial` with `worldUnits: false` gives constant screen-space pixel width (2px)
- `depthTest: false` + `depthWrite: false` — bypasses depth buffer entirely (no z-fighting at any zoom)
- A `THREE.Plane` clipping plane hides everything beyond the visible horizon
- `dashScale` scaled inversely with altitude (`DEFAULT_ALT / alt`) for constant screen-size dashes
- Clipping plane + dashScale + dashOffset all updated in one `requestAnimationFrame` loop (a controls `change` listener alone goes stale during `pointOfView` tweens)
- Spherical maths lives in `frontend/src/lib/geo.ts` (pure, no three.js — directly testable)
- Route legs interpolated every 0.5° along their **great circle** so the polyline follows the surface

### Clipping plane must sit at the horizon, not the globe centre
The horizon of a sphere of radius R seen from distance d is not the great circle
through the centre — it is the smaller circle at `n·p = R²/d`, and it shrinks as
you zoom in. Clipping at the centre plane (constant 0) leaves a band of line
past the horizon still drawn; because back-hemisphere points project *inside*
the silhouette disc, that band reads as the route showing "through" the globe,
and it gets dramatically worse the closer you zoom. `horizonPlaneOffset()`
returns `R²/d`; the plane normal is the unit camera direction.

### Each leg is its own line, and retraced legs are drawn once
The route is drawn as one `Line2` per leg, not a single polyline, and a leg that
retraces one already drawn (same two stops within ~11 km, either direction) is
skipped. Three reasons, all of which showed up as the line flickering between
dashed and solid on a long leg late in the route:
- A there-and-back pair covers the same great circle, so two dashed lines land on
  top of each other. Each is measured from its own start, so their dash phases
  differ and the relative phase sweeps as `dashScale` changes with zoom — one
  line's dashes fill the other's gaps. The second line adds nothing visually.
- A single polyline accumulates distance from the very first stop, and the shader
  multiplies that total by `dashScale`, so on a late leg a small scale change
  swings the dash phase by a large fraction of a cycle.
- `dashOffset` was decremented without bound; it is now wrapped to one cycle, and
  `dashScale` only updates when the altitude changes by more than 2% so
  per-frame jitter cannot make the dashes swim.

### Route legs must be great circles, not linear lat/lng interpolation
Interpolating lat/lng linearly takes the long way round whenever a leg crosses
the antimeridian — Kyoto (lng 135.8) to San Francisco (lng -122.4) swept 258°
west across Asia and the Atlantic instead of 102° east over the Pacific. The
demo seed includes exactly this leg so the behaviour is visible on first run.
`buildRoutePositions()` slerps unit vectors on the sphere instead, which has no
seam and always yields the shorter arc. Note a great circle through the point
directly beneath the camera projects to a straight line on screen — that is
correct perspective, not a regression.

### Approaches That Don't Work
1. **pathsData:** Lines clipped at highest zoom (camera near plane issue)
2. **arcsData with arcStroke:** `THREE.TubeGeometry` in world-space units — lines got thicker on zoom
3. **polygonOffset:** Works at normal zoom but insufficient at close camera distances
4. **LessEqualDepth + renderOrder:** Globe's tessellated mesh isn't at exactly the same depth as the line
5. **Altitude offset on line:** Causes parallax — line separates from pins at high zoom
6. **camera.near modification:** Breaks globe zoom limits (allows zooming through the globe)
7. **Scaling dashSize/gapSize down:** float32 `mod()` loses precision when cycle is tiny

### Key globe.gl internals
- Scene access: `globe.scene()`, `globe.camera()`, `globe.renderer()`, `globe.controls()`
- Coordinate conversion: `phi = (90-lat)*PI/180`, `theta = (90-lng)*PI/180`, `r = 100*(1+alt)`
