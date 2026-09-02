import { useCallback, useEffect, useRef } from 'react';

const API_BASE = '/api';

interface EventData {
  [key: string]: unknown;
}

async function trackEvent(eventType: string, eventData?: EventData, postId?: number) {
  try {
    await fetch(`${API_BASE}/analytics/event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        event_type: eventType,
        event_data: eventData,
        post_id: postId,
      }),
    });
  } catch (error) {
    // Silently fail - analytics shouldn't break the app
    console.debug('Analytics tracking failed:', error);
  }
}

// Module-level so StrictMode's double-mount in development can't double-count,
// and so the page view fires once per app load rather than once per hook user.
let pageViewSent = false;

/**
 * Records a single page view for this app load.
 *
 * Deliberately separate from useAnalytics(): the page view used to live inside
 * that hook, which meant every component calling it emitted another page view.
 * Only the top-level page should use this.
 */
export function usePageView() {
  useEffect(() => {
    if (pageViewSent) return;
    pageViewSent = true;
    trackEvent('page_view', {
      path: window.location.pathname,
      search: window.location.search,
    });
  }, []);
}

/** Event trackers. Safe to call from any component — no side effects on mount. */
export function useAnalytics() {
  const trackPostView = useCallback((postId: number) => {
    trackEvent('post_view', { post_id: postId }, postId);
  }, []);

  const trackPostInteraction = useCallback((postId: number, action: string) => {
    trackEvent('post_interaction', { post_id: postId, action }, postId);
  }, []);

  const trackCommentSubmit = useCallback((postId: number) => {
    trackEvent('comment_submit', { post_id: postId }, postId);
  }, []);

  const trackGlobeInteraction = useCallback((action: string, data?: EventData) => {
    trackEvent('globe_interaction', { action, ...data });
  }, []);

  const trackMediaPlay = useCallback((postId: number, mediaType: 'audio' | 'video') => {
    trackEvent('media_play', { post_id: postId, media_type: mediaType }, postId);
  }, []);

  const trackOutboundLink = useCallback((url: string, postId?: number) => {
    trackEvent('outbound_link', { url, post_id: postId }, postId);
  }, []);

  const trackLightboxOpen = useCallback((postId: number, index: number) => {
    trackEvent('lightbox_open', { post_id: postId, index }, postId);
  }, []);

  const trackGalleryOpen = useCallback((postId: number, itemCount: number) => {
    trackEvent('gallery_open', { post_id: postId, item_count: itemCount }, postId);
  }, []);

  const track = useCallback((eventType: string, eventData?: EventData, postId?: number) => {
    trackEvent(eventType, eventData, postId);
  }, []);

  return {
    trackPostView,
    trackPostInteraction,
    trackCommentSubmit,
    trackGlobeInteraction,
    trackMediaPlay,
    trackOutboundLink,
    trackLightboxOpen,
    trackGalleryOpen,
    track,
  };
}

// A post must be at least half on screen for this long before it counts as read,
// so scrolling quickly past a post doesn't register as a view.
const POST_VIEW_DWELL_MS = 1000;
const POST_VIEW_RATIO = 0.5;

/**
 * Returns a ref callback to attach to each post wrapper. Emits one `post_view`
 * per post per app load, once the post has genuinely been on screen.
 *
 * Nothing previously emitted `post_view` at all, so the "Top Posts" panel could
 * only ever be empty.
 */
export function usePostViewTracker() {
  const seen = useRef<Set<number>>(new Set());
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const observer = useRef<IntersectionObserver | null>(null);

  const getObserver = useCallback(() => {
    if (observer.current) return observer.current;

    observer.current = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          const postId = Number(el.dataset.postId);
          if (!postId || seen.current.has(postId)) continue;

          // Measure against whichever is smaller, the post or the viewport: a
          // photo post is routinely taller than the screen, and such a post's
          // intersectionRatio can never reach 0.5 no matter how much of it you read.
          const viewportH = entry.rootBounds?.height || window.innerHeight || 1;
          const reference = Math.min(viewportH, entry.boundingClientRect.height) || 1;
          const shown = entry.intersectionRect.height / reference;
          const visible = entry.isIntersecting && shown >= POST_VIEW_RATIO;

          if (visible && !timers.current.has(postId)) {
            timers.current.set(
              postId,
              setTimeout(() => {
                seen.current.add(postId);
                timers.current.delete(postId);
                observer.current?.unobserve(el);
                trackEvent('post_view', { post_id: postId }, postId);
              }, POST_VIEW_DWELL_MS)
            );
          } else if (!visible) {
            const pending = timers.current.get(postId);
            if (pending) {
              clearTimeout(pending);
              timers.current.delete(postId);
            }
          }
        }
      },
      // A spread of thresholds so the callback keeps firing as a tall post
      // scrolls through, not just at the two extremes.
      { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.75, 0.9, 1] }
    );

    return observer.current;
  }, []);

  const registerPost = useCallback(
    (el: HTMLElement | null) => {
      if (el) getObserver().observe(el);
    },
    [getObserver]
  );

  useEffect(() => {
    const timerMap = timers.current;
    return () => {
      observer.current?.disconnect();
      observer.current = null;
      timerMap.forEach(clearTimeout);
      timerMap.clear();
    };
  }, []);

  return registerPost;
}

// Standalone function for use outside of React components
export { trackEvent };
