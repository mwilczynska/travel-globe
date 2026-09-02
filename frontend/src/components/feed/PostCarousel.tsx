import { useState, useEffect, useRef, useCallback } from 'react';
import { getPosts } from '../../api/client';

interface Post {
  id: number;
  post_type: string;
  content: {
    caption?: string;
    title?: string;
    text?: string;
    thumbnail?: string;
  };
  location_name?: string;
  latitude?: number;
  longitude?: number;
  media?: {
    id: number;
    file_path: string;
    file_type: string;
  }[];
}

interface PostCarouselProps {
  onPostSelect: (postId: number) => void;
  onPostHighlight: (postId: number) => void;
}

export function PostCarousel({ onPostSelect, onPostHighlight }: PostCarouselProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(1);
  const touchStartX = useRef<number>(0);

  const loadPosts = useCallback(async (page: number) => {
    if (page === 1) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }

    const result = await getPosts({ page, limit: 20 });

    if (result.data) {
      const postsWithLocation = result.data.posts.filter(
        (p: Post) => p.latitude && p.longitude
      );
      if (page === 1) {
        setPosts(postsWithLocation);
      } else {
        setPosts(prev => [...prev, ...postsWithLocation]);
      }
      setHasMore(result.data.page < result.data.totalPages);
    }

    setIsLoading(false);
    setIsLoadingMore(false);
  }, []);

  useEffect(() => {
    loadPosts(1);
  }, [loadPosts]);

  // Load more when user gets close to the end
  useEffect(() => {
    if (posts.length > 0 && activeIndex >= posts.length - 3 && hasMore && !isLoadingMore) {
      pageRef.current += 1;
      loadPosts(pageRef.current);
    }
  }, [activeIndex, posts.length, hasMore, isLoadingMore, loadPosts]);

  // Notify parent when active post changes
  useEffect(() => {
    if (posts.length > 0 && posts[activeIndex]) {
      const post = posts[activeIndex];
      onPostHighlight(post.id);
    }
  }, [activeIndex, posts, onPostHighlight]);

  const getPostThumbnail = (post: Post): { url: string; isVideo: boolean } | null => {
    // Check media array first
    if (post.media && Array.isArray(post.media) && post.media.length > 0) {
      const firstMedia = post.media[0];
      if (firstMedia && firstMedia.file_path) {
        return {
          url: `/uploads/${firstMedia.file_path}`,
          isVideo: firstMedia.file_type?.startsWith('video/') || false
        };
      }
    }
    // Fallback to content thumbnail (for link posts)
    if (post.content?.thumbnail) {
      const thumb = post.content.thumbnail;
      const url = thumb.startsWith('http') ? thumb : (thumb.startsWith('/uploads/') ? thumb : `/uploads/${thumb}`);
      return { url, isVideo: false };
    }
    return null;
  };

  const getPostIcon = (postType: string) => {
    switch (postType) {
      case 'text':
        return (
          <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
      case 'quote':
        return (
          <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
          </svg>
        );
      case 'audio':
        return (
          <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
        );
      case 'link':
        return (
          <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        );
      default:
        return (
          <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        );
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;

    if (Math.abs(diff) > 50) {
      if (diff > 0 && activeIndex < posts.length - 1) {
        setActiveIndex(prev => prev + 1);
      } else if (diff < 0 && activeIndex > 0) {
        setActiveIndex(prev => prev - 1);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="h-48 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-white text-sm">
        No posts with locations
      </div>
    );
  }

  // Get visible posts (prev, current, next)
  const getVisiblePosts = () => {
    const visible = [];
    for (let i = -2; i <= 2; i++) {
      const index = activeIndex + i;
      if (index >= 0 && index < posts.length) {
        visible.push({ post: posts[index], offset: i, index });
      }
    }
    return visible;
  };

  return (
    <div
      className="relative h-52 flex items-end justify-center pb-4"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Cards */}
      <div className="relative flex items-end justify-center gap-2 px-4">
        {getVisiblePosts().map(({ post, offset, index }) => {
          const thumbnailData = getPostThumbnail(post);
          const isCenter = offset === 0;
          const isAdjacent = Math.abs(offset) === 1;

          return (
            <div
              key={post.id}
              onClick={() => isCenter ? onPostSelect(post.id) : setActiveIndex(index)}
              className={`
                flex-shrink-0 rounded-lg overflow-hidden shadow-xl cursor-pointer
                transition-all duration-300 ease-out
                ${isCenter
                  ? 'w-28 h-40 z-20 scale-100 opacity-100'
                  : isAdjacent
                    ? 'w-20 h-32 z-10 scale-95 opacity-80'
                    : 'w-16 h-24 z-0 scale-90 opacity-50'
                }
              `}
            >
              {/* Image */}
              <div className={`bg-gray-800 ${isCenter ? 'h-32' : isAdjacent ? 'h-24' : 'h-18'} relative`}>
                {thumbnailData ? (
                  thumbnailData.isVideo ? (
                    <video
                      src={thumbnailData.url}
                      className="w-full h-full object-cover"
                      muted
                    />
                  ) : (
                    <img
                      src={thumbnailData.url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  )
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-500 bg-gray-700">
                    {getPostIcon(post.post_type)}
                  </div>
                )}
              </div>
              {/* Title */}
              <div className="bg-white p-1.5">
                <p className={`font-medium text-gray-900 truncate ${isCenter ? 'text-xs' : 'text-[10px]'}`}>
                  {post.content.title || post.content.caption || post.location_name || 'Untitled'}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dots indicator - show a window of dots if too many */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-1 pb-1">
        {posts.length <= 20 ? (
          posts.map((_, index) => (
            <button
              key={index}
              onClick={() => setActiveIndex(index)}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                index === activeIndex ? 'bg-white' : 'bg-white/40'
              }`}
            />
          ))
        ) : (
          // For many posts, show a sliding window of dots
          <>
            {activeIndex > 2 && <span className="text-white/40 text-xs leading-none">...</span>}
            {Array.from({ length: Math.min(11, posts.length) }, (_, i) => {
              const dotIndex = Math.max(0, Math.min(posts.length - 11, activeIndex - 5)) + i;
              if (dotIndex >= posts.length) return null;
              return (
                <button
                  key={dotIndex}
                  onClick={() => setActiveIndex(dotIndex)}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    dotIndex === activeIndex ? 'bg-white' : 'bg-white/40'
                  }`}
                />
              );
            })}
            {activeIndex < posts.length - 6 && <span className="text-white/40 text-xs leading-none">...</span>}
          </>
        )}
      </div>

      {/* Loading more indicator */}
      {isLoadingMore && (
        <div className="absolute top-2 right-4">
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
