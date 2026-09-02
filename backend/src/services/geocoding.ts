// Using OpenStreetMap Nominatim API (free, no API key required)
// Rate limit: 1 request per second, include User-Agent
// Usage policy: https://operations.osmfoundation.org/policies/nominatim/

import https from 'https';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

// Nominatim's usage policy requires a User-Agent that identifies the
// application and gives a contact point, so both are configurable per
// deployment rather than hardcoded to one site.
// https://operations.osmfoundation.org/policies/nominatim/
//
// Read lazily, not at module scope: index.ts calls dotenv.config() after its
// import block, and imports are evaluated first, so anything read at module
// load would miss every value that comes from .env.
function siteUrl(): string {
  return process.env.SITE_URL || 'http://localhost:5173';
}

function userAgent(): string {
  const name = (process.env.SITE_NAME || 'TravelGlobe').replace(/\s+/g, '');
  return `${name}/1.0 (${siteUrl()})`;
}

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  displayName: string;
  city?: string;
  country?: string;
}

// Helper function to make HTTPS requests (more reliable in Docker than fetch)
function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': userAgent(),
        'Referer': siteUrl(),
      },
      timeout: 10000,
      family: 4, // Force IPv4
    };

    const req = https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

// Forward geocoding: search for a place by name
export async function searchLocation(query: string): Promise<GeocodingResult[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      addressdetails: '1',
      limit: '5',
    });

    const url = `${NOMINATIM_BASE}/search?${params}`;
    console.log('Nominatim search request:', url);

    const responseText = await httpsGet(url);
    const data = JSON.parse(responseText);

    return data.map((item: {
      lat: string;
      lon: string;
      display_name: string;
      address?: {
        city?: string;
        town?: string;
        village?: string;
        country?: string;
      };
    }) => ({
      latitude: parseFloat(item.lat),
      longitude: parseFloat(item.lon),
      displayName: item.display_name,
      city: item.address?.city || item.address?.town || item.address?.village,
      country: item.address?.country,
    }));
  } catch (error) {
    console.error('Geocoding search error:', error);
    return [];
  }
}

// Reverse geocoding: get place name from coordinates
export async function reverseGeocode(latitude: number, longitude: number): Promise<GeocodingResult | null> {
  try {
    const params = new URLSearchParams({
      lat: latitude.toString(),
      lon: longitude.toString(),
      format: 'json',
      addressdetails: '1',
    });

    const url = `${NOMINATIM_BASE}/reverse?${params}`;
    console.log('Nominatim reverse request:', url);

    const responseText = await httpsGet(url);
    const data = JSON.parse(responseText);

    if (data.error) {
      return null;
    }

    // Build a friendly location name
    const address = data.address || {};
    const parts: string[] = [];

    // Add city/town/village
    if (address.city) parts.push(address.city);
    else if (address.town) parts.push(address.town);
    else if (address.village) parts.push(address.village);
    else if (address.municipality) parts.push(address.municipality);

    // Add country
    if (address.country) parts.push(address.country);

    const displayName = parts.length > 0 ? parts.join(', ') : data.display_name;

    return {
      latitude,
      longitude,
      displayName,
      city: address.city || address.town || address.village,
      country: address.country,
    };
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return null;
  }
}
