import type { VercelRequest, VercelResponse } from '@vercel/node';

const VANMAP_GEOCODER =
  'https://geodata.vancouver.ca/arcgis/rest/services/Geocoder/GeocodeServer/findAddressCandidates';

const PARCEL_LAYER =
  'https://geodata.vancouver.ca/arcgis/rest/services/VanMapViewer/VanMapViewer/MapServer/4';

const ZONING_LAYER =
  'https://geodata.vancouver.ca/arcgis/rest/services/VanMapViewer/VanMapViewer/MapServer/17';

async function fetchJson(url: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${url}?${qs}`);
  if (!res.ok) throw new Error('Request failed');
  return res.json();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { address } = req.body;

    if (!address || typeof address !== 'string') {
      return res.status(400).json({
        lookup_status: 'not_found',
        zoning_code: null,
        lot_area_sf: null,
        data_source: null,
        timestamp: new Date().toISOString()
      });
    }

    /* -------------------------------------------------
       1. GEOCODE ADDRESS
    ------------------------------------------------- */
    const geo = await fetchJson(VANMAP_GEOCODER, {
      SingleLine: address,
      City: 'Vancouver',
      outFields: '*',
      maxLocations: '1',
      f: 'json'
    });

    if (!geo.candidates || geo.candidates.length === 0) {
      throw new Error('Geocode failed');
    }

    const { x, y } = geo.candidates[0].location;

    /* -------------------------------------------------
       2. PARCEL LOOKUP (LOT AREA)
    ------------------------------------------------- */
    const parcel = await fetchJson(PARCEL_LAYER, {
      geometry: JSON.stringify({
        x,
        y,
        spatialReference: { wkid: 4326 }
      }),
      geometryType: 'esriGeometryPoint',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: '*',
      f: 'json'
    });

    if (!parcel.features || parcel.features.length !== 1) {
      throw new Error('Parcel ambiguous or not found');
    }

    const lotArea =
      parcel.features[0].attributes?.LOT_AREA ||
      parcel.features[0].attributes?.LOT_AREA_SQM * 10.7639;

    if (!lotArea) {
      throw new Error('Lot area missing');
    }

    /* -------------------------------------------------
       3. ZONING LOOKUP
    ------------------------------------------------- */
    const zoning = await fetchJson(ZONING_LAYER, {
      geometry: JSON.stringify({
        x,
        y,
        spatialReference: { wkid: 4326 }
      }),
      geometryType: 'esriGeometryPoint',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: '*',
      f: 'json'
    });

    if (!zoning.features || zoning.features.length !== 1) {
      throw new Error('Zoning ambiguous or not found');
    }

    const zoningCode =
      zoning.features[0].attributes?.ZONE_DISTRICT;

    if (!zoningCode) {
      throw new Error('Zoning code missing');
    }

    /* -------------------------------------------------
       4. SUCCESS RESPONSE
    ------------------------------------------------- */
    return res.status(200).json({
      lookup_status: 'success',
      zoning_code: zoningCode,
      lot_area_sf: Math.round(lotArea),
      data_source: 'City of Vancouver VanMap',
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    return res.status(200).json({
      lookup_status: 'not_found',
      zoning_code: null,
      lot_area_sf: null,
      data_source: 'City of Vancouver VanMap',
      timestamp: new Date().toISOString()
    });
  }
}
