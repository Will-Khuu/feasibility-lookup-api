import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
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

  // MOCK RESPONSE (replace later with VanMap logic)
  return res.status(200).json({
    lookup_status: 'success',
    zoning_code: 'RT-1',
    lot_area_sf: 6000,
    data_source: 'Mock Dataset',
    timestamp: new Date().toISOString()
  });
}
