import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { getPosts, deletePost } from '../../api/client';
import { PhotoPost } from './PhotoPost';
import { TextPost } from './TextPost';
import { QuotePost } from './QuotePost';
import { LinkPost } from './LinkPost';
import { AudioPost } from './AudioPost';
import { useAuth } from '../../hooks/useAuth';
import { usePostViewTracker } from '../../hooks/useAnalytics';

interface Post {
  id: number;
  author_name: string;
  post_type: string;
  content: Record<string, unknown>;
  latitude?: number;
  longitude?: number;
  location_name?: string;
  captured_at?: string;
  created_at: string;
  media: Array<{
    id: number;
    file_path: string;
    file_type: string;
    width?: number;
    height?: number;
    original_filename?: string;
  }>;
  tags: string[];
}

/**
 * A request from the page to bring a post into view. `seq` changes on every
 * request, so clicking the same pin twice still scrolls to the post again.
 */
export interface FeedJumpRequest {
  postId: number;
  seq: number;
}

interface FeedProps {
  filterType?: string;
  onPostHover?: (postId: number | null) => void;
  jumpRequest?: FeedJumpRequest | null;
}

const PAGE_SIZE = 10;

// How long a "Show newer posts" prepend keeps the reader's place pinned while
// the new posts' images and comments arrive and change their height.
const ANCHOR_HOLD_MS = 2000;

type PendingScroll = { kind: 'top' } | { kind: 'post'; postId: number };

function mergeUnique(first: Post[], second: Post[]): Post[] {
  const seen = new Set(first.map(p => p.id));
  return [...first, ...second.filter(p => !seen.has(p.id))];
}

// index.css sets `scroll-behavior: smooth` on <html>, which would animate these
// scrolls too. Placing the reader after posts are swapped or prepended has to be
// instant, or the page visibly lurches and then glides back.
function scrollInstantly(scroll: () => void) {
  const root = document.documentElement;
  const previous = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  scroll();
  root.style.scrollBehavior = previous;
}

function flashHighlight(el: HTMLElement) {
  el.classList.add('ring-2', 'ring-sky-500');
  setTimeout(() => {
    el.classList.remove('ring-2', 'ring-sky-500');
  }, 2000);
}

/**
 * The feed holds a contiguous slice of posts, newest first. Normally the slice
 * starts at the newest post and grows downwards as you scroll. A jump request
 * for a post that isn't loaded replaces the slice with one that starts at that
 * post, fetched by cursor in a single request, so reaching an old post costs
 * the same as reaching a new one. The slice then grows in both directions.
 */
export function Feed({ filterType, onPostHover, jumpRequest }: FeedProps) {
  const { isAuthor } = useAuth();
  const registerPost = usePostViewTracker();
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [hasNewer, setHasNewer] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingNewer, setLoadingNewer] = useState(false);
  const [olderFailed, setOlderFailed] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const postsRef = useRef<Post[]>([]);
  // Bumped by every request to replace the slice; only the latest may apply.
  const windowRequest = useRef(0);
  // Bumped whenever the slice is replaced; older/newer pages fetched for a
  // previous slice are dropped when they arrive.
  const windowSeq = useRef(0);
  const pendingScroll = useRef<PendingScroll | null>(null);
  const prependAnchor = useRef<{ postId: number; top: number } | null>(null);
  const handledJump = useRef<number | null>(null);

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  const handleDelete = async (postId: number) => {
    if (!confirm('Are you sure you want to delete this post?')) return;

    const result = await deletePost(postId);
    if (result.error) {
      alert('Failed to delete post: ' + result.error);
      return;
    }

    setPosts(prev => prev.filter(p => p.id !== postId));
  };

  // Replace the slice: either the newest posts, or the posts from `postId` down.
  const loadWindow = useCallback(async (target: { postId: number } | { scrollToTop: boolean }) => {
    const request = ++windowRequest.current;
    const result = await getPosts({
      limit: PAGE_SIZE,
      type: filterType,
      at: 'postId' in target ? target.postId : undefined,
    });
    if (request !== windowRequest.current) return; // superseded by a later jump

    if (!result.data) {
      // Keep whatever is on screen; only an empty feed has nothing better to show.
      if (postsRef.current.length === 0) setError(result.error || 'Failed to load posts');
      else console.warn('Failed to load posts:', result.error);
      setIsLoading(false);
      return;
    }

    windowSeq.current += 1;
    pendingScroll.current =
      'postId' in target ? { kind: 'post', postId: target.postId }
      : target.scrollToTop ? { kind: 'top' }
      : null;
    setPosts(result.data.posts as unknown as Post[]);
    setHasOlder(result.data.hasOlder);
    setHasNewer(result.data.hasNewer);
    setLoadingOlder(false);
    setLoadingNewer(false);
    setOlderFailed(false);
    setError(null);
    setIsLoading(false);
  }, [filterType]);

  // Initial load, and reload when the filter changes
  useEffect(() => {
    setIsLoading(true);
    loadWindow({ scrollToTop: false });
  }, [loadWindow]);

  // Jump requests wait for the initial load, so the two never race.
  useEffect(() => {
    if (!jumpRequest || isLoading || handledJump.current === jumpRequest.seq) return;
    handledJump.current = jumpRequest.seq;

    const el = document.getElementById(`post-${jumpRequest.postId}`);
    if (el) {
      windowRequest.current += 1; // this click wins over any jump still in flight
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      flashHighlight(el);
    } else {
      loadWindow({ postId: jumpRequest.postId });
    }
  }, [jumpRequest, isLoading, loadWindow]);

  // After the slice is replaced: bring the jumped-to post (or the top) into view.
  useLayoutEffect(() => {
    const pending = pendingScroll.current;
    if (!pending) return;
    pendingScroll.current = null;

    if (pending.kind === 'top') {
      scrollInstantly(() => window.scrollTo({ top: 0 }));
      return;
    }
    // The slice starts at the post, so scroll to the top of the list, which
    // keeps the "Show newer posts" button above it in view.
    scrollInstantly(() => listRef.current?.scrollIntoView({ block: 'start' }));
    const el = document.getElementById(`post-${pending.postId}`);
    if (el) flashHighlight(el);
  }, [posts]);

  const loadOlder = useCallback(async () => {
    const last = posts[posts.length - 1];
    if (!last || loadingOlder || !hasOlder || olderFailed) return;

    const seq = windowSeq.current;
    setLoadingOlder(true);
    const result = await getPosts({ before: last.id, limit: PAGE_SIZE, type: filterType });
    if (seq !== windowSeq.current) return;

    setLoadingOlder(false);
    const data = result.data;
    if (!data) {
      // Stop here rather than retrying on every observer callback
      setOlderFailed(true);
      return;
    }
    setPosts(prev => mergeUnique(prev, data.posts as unknown as Post[]));
    setHasOlder(data.hasOlder);
  }, [posts, loadingOlder, hasOlder, olderFailed, filterType]);

  const loadNewer = useCallback(async () => {
    const first = posts[0];
    if (!first || loadingNewer) return;

    const seq = windowSeq.current;
    setLoadingNewer(true);
    const result = await getPosts({ after: first.id, limit: PAGE_SIZE, type: filterType });
    if (seq !== windowSeq.current) return;

    setLoadingNewer(false);
    const data = result.data;
    if (!data) {
      console.warn('Failed to load newer posts:', result.error);
      return;
    }
    // Newer posts go above, which would push the reader down the page. Note
    // where the current first post sits so it can be held in place.
    const el = document.getElementById(`post-${first.id}`);
    if (el) prependAnchor.current = { postId: first.id, top: el.getBoundingClientRect().top };
    setPosts(prev => mergeUnique(data.posts as unknown as Post[], prev));
    setHasNewer(data.hasNewer);
  }, [posts, loadingNewer, filterType]);

  // Hold the reader's place after posts are added above. This is done by hand
  // because Safari has no CSS scroll anchoring; the list opts out of the native
  // version (overflow-anchor: none) so other browsers don't correct it twice.
  useLayoutEffect(() => {
    const anchor = prependAnchor.current;
    if (!anchor) return;
    const el = document.getElementById(`post-${anchor.postId}`);
    if (!el) {
      prependAnchor.current = null;
      return;
    }

    const pin = () => {
      const drift = el.getBoundingClientRect().top - anchor.top;
      if (Math.abs(drift) >= 1) scrollInstantly(() => window.scrollBy(0, drift));
    };
    pin();

    // The new posts keep growing as their images and comments load. Keep
    // correcting until that settles, or until the reader takes over.
    const observer = new ResizeObserver(pin);
    if (listRef.current) observer.observe(listRef.current);
    const userEvents = ['wheel', 'touchstart', 'keydown'] as const;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const release = () => {
      observer.disconnect();
      clearTimeout(timer);
      userEvents.forEach(type => window.removeEventListener(type, release));
      prependAnchor.current = null;
    };
    timer = setTimeout(release, ANCHOR_HOLD_MS);
    userEvents.forEach(type => window.addEventListener(type, release, { passive: true }));
    return release;
  }, [posts]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadOlder();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadOlder, isLoading]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No posts yet. Create your first post!</p>
      </div>
    );
  }

  return (
    <div ref={listRef} className="space-y-6 scroll-mt-20" style={{ overflowAnchor: 'none' }}>
      {hasNewer && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadNewer}
            disabled={loadingNewer}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-full shadow-sm text-sm font-medium text-sky-600 hover:bg-sky-50 disabled:opacity-60 transition-colors"
          >
            {loadingNewer ? (
              <span className="w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            )}
            Show newer posts
          </button>
        </div>
      )}

      {posts.map(post => {
        // `key` is passed directly at each call site. React warns if it arrives
        // via a spread object.
        const commonWrapperProps = {
          id: `post-${post.id}`,
          ref: registerPost,
          'data-post-id': post.id,
          onMouseEnter: () => onPostHover?.(post.id),
          onMouseLeave: () => onPostHover?.(null),
          // scroll-mt clears the sticky header when a post is scrolled into view
          className: "rounded-xl scroll-mt-20 transition-all duration-300",
        };

        const commonPostProps = {
          postId: post.id,
          authorName: post.author_name,
          locationName: post.location_name,
          capturedAt: post.captured_at,
          createdAt: post.created_at,
          isAuthor,
          onDelete: () => handleDelete(post.id),
        };

        switch (post.post_type) {
          case 'photo':
            return (
              <div key={post.id} {...commonWrapperProps}>
                <PhotoPost
                  {...commonPostProps}
                  content={post.content as { caption?: string }}
                  media={post.media}
                />
              </div>
            );

          case 'quote':
            return (
              <div key={post.id} {...commonWrapperProps}>
                <QuotePost
                  {...commonPostProps}
                  content={post.content as { text?: string; source?: string }}
                />
              </div>
            );

          case 'text':
            return (
              <div key={post.id} {...commonWrapperProps}>
                <TextPost
                  {...commonPostProps}
                  content={post.content as { title?: string; body?: string }}
                />
              </div>
            );

          case 'link':
            return (
              <div key={post.id} {...commonWrapperProps}>
                <LinkPost
                  {...commonPostProps}
                  content={post.content as { url?: string; title?: string; description?: string; thumbnail?: string; caption?: string }}
                />
              </div>
            );

          case 'audio':
            return (
              <div key={post.id} {...commonWrapperProps}>
                <AudioPost
                  {...commonPostProps}
                  content={post.content as { title?: string; caption?: string }}
                  media={post.media}
                />
              </div>
            );

          case 'video':
            return (
              <div key={post.id} {...commonWrapperProps}>
                <PhotoPost
                  {...commonPostProps}
                  content={post.content as { caption?: string; title?: string }}
                  media={post.media}
                />
              </div>
            );

          default:
            // Unsupported post type - show placeholder
            return (
              <div key={post.id} {...commonWrapperProps}>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <p className="text-gray-500 text-sm">
                    Unsupported post type: {post.post_type}
                  </p>
                </div>
              </div>
            );
        }
      })}

      {/* Sentinel for infinite scroll */}
      <div ref={sentinelRef} className="h-1" />

      {/* Loading more indicator */}
      {loadingOlder && (
        <div className="flex justify-center py-6">
          <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}

      {olderFailed && (
        <div className="text-center py-6 text-sm text-gray-500">
          Couldn't load more posts.{' '}
          <button
            type="button"
            onClick={() => setOlderFailed(false)}
            className="text-sky-600 hover:text-sky-700 font-medium"
          >
            Try again
          </button>
        </div>
      )}

      {/* While reading an older stretch of the feed, a way back to the newest
          posts stays pinned to the bottom of the screen, centred on the feed
          column. Fixed rather than sticky: the feed's wrapper in App is an
          overflow container that never scrolls itself, so sticky never engages. */}
      {hasNewer && (
        <div className="fixed bottom-6 left-1/2 lg:left-3/4 -translate-x-1/2 z-10">
          <button
            type="button"
            onClick={() => loadWindow({ scrollToTop: true })}
            className="flex items-center gap-1.5 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium rounded-full shadow-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 11l7-7 7 7M5 19l7-7 7 7" />
            </svg>
            Back to latest
          </button>
        </div>
      )}
    </div>
  );
}
