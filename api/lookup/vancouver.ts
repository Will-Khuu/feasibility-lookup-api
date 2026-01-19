import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point, polygon, multiPolygon } from '@turf/helpers';

/* -----------------------------
   CONFIG
----------------------------- */

const ZONING_DATASET_URL =
  'https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/' +
  'zoning-districts-and-labels/records' +
  '?limit=10000' +
  '&select=zoning_district,geo_shape';

/* -----------------------------
   GEOCODING (OpenStreetMap)
----------------------------- */

async function geocodeAddress(address: string) {
  const url =
    'https://nominatim.openstreetmap.org/search' +
    '?format=json' +
    '&limit=1' +
    '&q=' +
    encodeURIComponent(address + ', Vancouver, BC');

  const res = await fetch(url, {
    headers: {
      // REQUIRED by Nominatim usage policy
      'User-Agent': 'vancouver-pre-feasibility-tool'
    }
  });

  if (!res.ok) return null;

  const data = await res.json();
  if (!data || data.length === 0) return null;

  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon)
  };
}

/* -----------------------------
   FETCH ZONING POLYGONS
----------------------------- */

async function fetchZoningPolygons() {
  const res = await fetch(ZONING_DATASET_URL);
  if (!res.ok) return null;

  const json = await res.json();
  return json.results || [];
}

/* -----------------------------
   FIND ZONING BY POINT
----------------------------- */

function findZoning(lat: number, lng: number, zones: any[]) {
  const pt = point([lng, lat]);

  for (const zone of zones) {
    const zoningCode = zone.zoning_district;
    const geom = zone.geo_shape?.geometry;

    if (!zoningCode || !geom) continue;

    let shape;

    if (geom.type === 'Polygon') {
      shape = polygon(geom.coordinates);
    } else if (geom.type === 'MultiPolygon') {
      shape = multiPolygon(geom.coordinates);
    } else {
      continue;
    }

    if (booleanPointInPolygon(pt, shape)) {
      return zoningCode;
    }
  }

  return null;
}

/* -----------------------------
   API HANDLER
----------------------------- */

export default async function handler(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405 }
      );
    }

    const body = await req.json();
    const address = body?.address;

    if (!address || typeof address !== 'string') {
      throw new Error('Invalid address');
    }

    // 1. Geocode
    const coords = await geocodeAddress(address);
    if (!coords) {
      throw new Error('Geocoding failed');
    }

    // 2. Fetch zoning polygons
    const zones = await fetchZoningPolygons();
    if (!zones || zones.length === 0) {
      throw new Error('Zoning dataset unavailable');
    }

    // 3. Determine zoning
    const zoningCode = findZoning(coords.lat, coords.lng, zones);
    if (!zoningCode) {
      throw new Error('Zoning not found');
    }

    // 4. Success
    return new Response(
      JSON.stringify({
        lookup_status: 'success',
        zoning_code: zoningCode,
        lot_area_sf: null, // zoning-only MVP
        data_source: 'City of Vancouver Open Data',
        timestamp: new Date().toISOString()
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({
        lookup_status: 'not_found',
        zoning_code: null,
        lot_area_sf: null,
        data_source: 'City of Vancouver Open Data',
        timestamp: new Date().toISOString()
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

