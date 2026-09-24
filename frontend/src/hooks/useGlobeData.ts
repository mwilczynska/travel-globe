import { useEffect, useState } from 'react';
import { getGlobeData } from '../api/client';
import type { GlobePoint } from '../types';

/**
 * Every located post (chronological, oldest first) plus the route through them.
 *
 * Fetched once for the whole page: the globe draws the pins from it, and the
 * mobile map-mode carousel builds its cards from it. The carousel used to
 * page through full posts for this, and only knew about the pages it had loaded.
 */
export function useGlobeData() {
  const [points, setPoints] = useState<GlobePoint[]>([]);
  const [route, setRoute] = useState<[number, number][]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    getGlobeData().then(result => {
      if (!isMounted) return;
      if (result.error) {
        setError(result.error);
      } else if (result.data) {
        setPoints(result.data.points);
        setRoute(result.data.route);
      }
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return { points, route, isLoading, error };
}
