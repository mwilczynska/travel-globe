// Pure spherical geometry helpers for the globe route line.
// Kept free of three.js so they can be exercised directly in tests.

export const GLOBE_RADIUS = 100;
export const DEG2RAD = Math.PI / 180;

type Vec3 = [number, number, number];

/**
 * three-globe's coordinate convention (matches its internal polar2Cartesian).
 */
export function latLngToXYZ(lat: number, lng: number, alt = 0): Vec3 {
  const phi = (90 - lat) * DEG2RAD;
  const theta = (90 - lng) * DEG2RAD;
  const r = GLOBE_RADIUS * (1 + alt);
  const sinPhi = Math.sin(phi);
  return [r * sinPhi * Math.cos(theta), r * Math.cos(phi), r * sinPhi * Math.sin(theta)];
}

function latLngToUnit(lat: number, lng: number): Vec3 {
  const [x, y, z] = latLngToXYZ(lat, lng, 0);
  return [x / GLOBE_RADIUS, y / GLOBE_RADIUS, z / GLOBE_RADIUS];
}

/** Inverse of latLngToUnit. Used by tests and for reasoning about a built route. */
export function xyzToLatLng([x, y, z]: Vec3): [number, number] {
  const r = Math.hypot(x, y, z) || 1;
  const lat = 90 - Math.acos(Math.min(1, Math.max(-1, y / r))) / DEG2RAD;
  // theta = atan2(z, x), and lng = 90 - theta/DEG2RAD
  let lng = 90 - Math.atan2(z, x) / DEG2RAD;
  while (lng > 180) lng -= 360;
  while (lng < -180) lng += 360;
  return [lat, lng];
}

/**
 * Flat [x,y,z,x,y,z,...] positions tracing the route through `route` stops,
 * walking each leg along its great circle, the actual shortest path between
 * two points on a sphere.
 *
 * Interpolating lat/lng linearly instead takes the long way round whenever a
 * leg crosses the antimeridian (Yogyakarta lng 110 -> San Francisco lng -122
 * would sweep west across Asia and the Atlantic), so we slerp unit vectors on
 * the sphere, which has no seam and always yields the shorter arc.
 */
/** Great-circle arc between two stops, inclusive of both endpoints. */
function arcPositions(from: [number, number], to: [number, number], degreesPerStep: number): number[] {
  const positions: number[] = [];
  const push = (v: Vec3) =>
    positions.push(v[0] * GLOBE_RADIUS, v[1] * GLOBE_RADIUS, v[2] * GLOBE_RADIUS);

  const a = latLngToUnit(from[0], from[1]);
  const b = latLngToUnit(to[0], to[1]);

  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega);
  const segments = Math.max(1, Math.ceil(omega / DEG2RAD / degreesPerStep));

  for (let j = 0; j <= segments; j++) {
    const t = j / segments;
    let v: Vec3;
    if (sinOmega < 1e-6) {
      // Coincident (or exactly antipodal) stops, so there is no unique great circle.
      v = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    } else {
      const wa = Math.sin((1 - t) * omega) / sinOmega;
      const wb = Math.sin(t * omega) / sinOmega;
      v = [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb];
    }
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    push([v[0] / len, v[1] / len, v[2] / len]);
  }

  return positions;
}

/**
 * One flat position array per leg, each starting at its own stop.
 *
 * Drawing the route as separate legs keeps each line's accumulated dash
 * distance small. A single polyline accumulates distance from the very first
 * stop, and that total is multiplied by dashScale in the shader, so on a late,
 * long leg a tiny change in dashScale swings the dash phase by a large fraction
 * of a cycle, which reads as the line flickering between dashed and solid.
 */
/** Two stops close enough to be the same place for routing purposes (~11 km). */
const SAME_PLACE_DEG = 0.1;

function samePlace(p: [number, number], q: [number, number]): boolean {
  const dLat = Math.abs(p[0] - q[0]);
  // Shortest longitude difference, so the antimeridian doesn't read as far apart.
  const dLng = Math.abs((((p[1] - q[1]) % 360) + 540) % 360 - 180);
  return dLat <= SAME_PLACE_DEG && dLng <= SAME_PLACE_DEG;
}

export function buildRouteLegPositions(route: [number, number][], degreesPerStep = 0.5): number[][] {
  const legs: number[][] = [];
  const drawn: [[number, number], [number, number]][] = [];

  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];

    // Skip a leg that retraces one already drawn, in either direction.
    //
    // A there-and-back pair (Soho -> Ho Chi Minh, then Ho Chi Minh -> London)
    // covers the same great circle, so two dashed lines land on top of each
    // other. Each is measured from its own start, so their dash phases differ
    // and the relative phase sweeps as dashScale changes with zoom, so one line's
    // dashes fill the other's gaps and the pair flickers between dashed and
    // solid. The second line also adds nothing visually: it is the same stroke.
    if (drawn.some(([x, y]) => (samePlace(a, x) && samePlace(b, y)) || (samePlace(a, y) && samePlace(b, x)))) {
      continue;
    }
    drawn.push([a, b]);

    // Draw in a canonical direction so an exact repeat of a leg still shares one
    // dash parameterisation. Reversing a leg does not change the drawn geometry,
    // only the distances the dash pattern is measured against.
    const forward = `${a[0]},${a[1]}` <= `${b[0]},${b[1]}`;
    legs.push(arcPositions(forward ? a : b, forward ? b : a, degreesPerStep));
  }

  return legs;
}

/**
 * The whole route as one continuous position array (no duplicated seam
 * vertices). Kept for callers that want a single polyline.
 */
export function buildRoutePositions(route: [number, number][], degreesPerStep = 0.5): number[] {
  const positions: number[] = [];

  for (let i = 0; i < route.length - 1; i++) {
    const leg = arcPositions(route[i], route[i + 1], degreesPerStep);
    // Drop the closing vertex; the next leg contributes it.
    positions.push(...leg.slice(0, leg.length - 3));
  }

  if (route.length > 0) {
    const last = route[route.length - 1];
    const [x, y, z] = latLngToUnit(last[0], last[1]);
    positions.push(x * GLOBE_RADIUS, y * GLOBE_RADIUS, z * GLOBE_RADIUS);
  }

  return positions;
}

/**
 * Distance from the globe centre, along the camera direction, of the plane
 * containing the visible horizon.
 *
 * The horizon of a sphere of radius R seen from distance d is NOT the great
 * circle through the centre. It is the smaller circle at n·p = R²/d, and it
 * shrinks as the camera moves in. Clipping the route line at the centre plane
 * (offset 0) leaves a band of line beyond the horizon still drawn, which reads
 * as the route showing "through" the globe.
 */
export function horizonPlaneOffset(cameraDistance: number, radius = GLOBE_RADIUS): number {
  return (radius * radius) / cameraDistance;
}
