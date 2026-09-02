import { useState, useEffect, useRef, useCallback } from 'react';
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

interface FeedProps {
  filterType?: string;
  onPostHover?: (postId: number | null) => void;
}

export function Feed({ filterType, onPostHover }: FeedProps) {
  const { isAuthor } = useAuth();
  const registerPost = usePostViewTracker();
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const handleDelete = async (postId: number) => {
    if (!confirm('Are you sure you want to delete this post?')) return;

    const result = await deletePost(postId);
    if (result.error) {
      alert('Failed to delete post: ' + result.error);
      return;
    }

    setPosts(prev => prev.filter(p => p.id !== postId));
  };

  // Reset when filters change
  useEffect(() => {
    setPosts([]);
    setPage(1);
    setHasMore(true);
  }, [filterType]);

  // Load posts
  useEffect(() => {
    let isMounted = true;

    async function loadPosts() {
      if (page === 1) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      setError(null);

      const result = await getPosts({
        page,
        limit: 10,
        type: filterType,
      });

      if (!isMounted) return;

      if (result.error) {
        setError(result.error);
        setIsLoading(false);
        setIsLoadingMore(false);
        return;
      }

      if (result.data) {
        const newPosts = result.data.posts as unknown as Post[];
        if (page === 1) {
          setPosts(newPosts);
        } else {
          setPosts(prev => [...prev, ...newPosts]);
        }
        setHasMore(result.data.page < result.data.totalPages);
      }

      setIsLoading(false);
      setIsLoadingMore(false);
    }

    loadPosts();

    return () => {
      isMounted = false;
    };
  }, [page, filterType]);

  // IntersectionObserver for infinite scroll
  const loadMore = useCallback(() => {
    if (!isLoadingMore && hasMore) {
      setPage(prev => prev + 1);
    }
  }, [isLoadingMore, hasMore]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, isLoading]);

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
    <div className="space-y-6">
      {posts.map(post => {
        // `key` is passed directly at each call site. React warns if it arrives
        // via a spread object.
        const commonWrapperProps = {
          id: `post-${post.id}`,
          ref: registerPost,
          'data-post-id': post.id,
          onMouseEnter: () => onPostHover?.(post.id),
          onMouseLeave: () => onPostHover?.(null),
          className: "transition-all duration-300",
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
      {isLoadingMore && (
        <div className="flex justify-center py-6">
          <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
    </div>
  );
}
