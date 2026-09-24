import { useState, useEffect, useRef, useMemo } from 'react';
import type { GlobePoint } from '../../types';

interface PostCarouselProps {
  // Every located post, oldest first, as loaded for the globe
  points: GlobePoint[];
  isLoading: boolean;
  // The post selected elsewhere (e.g. a pin tapped on the globe); the carousel
  // turns to it
  activePostId: number | null;
  onPostSelect: (postId: number) => void;
  onPostHighlight: (postId: number) => void;
}

export function PostCarousel({ points, isLoading, activePostId, onPostSelect, onPostHighlight }: PostCarouselProps) {
  // Newest first, matching the feed. Built from the globe data, so every
  // located post is here from the start and nothing is paged in.
  const posts = useMemo(() => [...points].reverse(), [points]);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, posts.findIndex(p => p.id === activePostId))
  );
  const touchStartX = useRef<number>(0);

  // Follow selections made outside the carousel, such as tapping a pin
  useEffect(() => {
    if (activePostId === null) return;
    const index = posts.findIndex(p => p.id === activePostId);
    if (index !== -1) setActiveIndex(index);
  }, [activePostId, posts]);

  // Notify parent when active post changes
  useEffect(() => {
    if (posts.length > 0 && posts[activeIndex]) {
      const post = posts[activeIndex];
      onPostHighlight(post.id);
    }
  }, [activeIndex, posts, onPostHighlight]);

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
                {post.thumbnail ? (
                  post.thumbnail_is_video ? (
                    <video
                      src={post.thumbnail}
                      className="w-full h-full object-cover"
                      muted
                    />
                  ) : (
                    <img
                      src={post.thumbnail}
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
                  {post.title || post.label || 'Untitled'}
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
    </div>
  );
}
