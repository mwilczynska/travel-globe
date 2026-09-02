import { Router, Request, Response } from 'express';
import { viewerAuth } from '../middleware/viewerAuth.js';
import { searchLocation, reverseGeocode } from '../services/geocoding.js';

const router = Router();

// GET /api/geocoding/search?q=city name
router.get('/search', viewerAuth, async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;

    if (!query || query.length < 2) {
      res.status(400).json({ error: 'Query must be at least 2 characters' });
      return;
    }

    const results = await searchLocation(query);
    res.json({ results });
  } catch (error) {
    console.error('Location search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/geocoding/reverse?lat=...&lng=...
router.get('/reverse', viewerAuth, async (req: Request, res: Response) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);

    if (isNaN(lat) || isNaN(lng)) {
      res.status(400).json({ error: 'Valid lat and lng parameters required' });
      return;
    }

    const result = await reverseGeocode(lat, lng);

    if (!result) {
      res.status(404).json({ error: 'Location not found' });
      return;
    }

    res.json(result);
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    res.status(500).json({ error: 'Reverse geocoding failed' });
  }
});

export default router;
