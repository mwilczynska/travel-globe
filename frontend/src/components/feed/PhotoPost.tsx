import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getComments, submitComment, editComment, deleteComment } from '../../api/client';
import { useAnalytics } from '../../hooks/useAnalytics';

interface Media {
  id: number;
  file_path: string;
  file_type: string;
  width?: number;
  height?: number;
}

interface Comment {
  id: number;
  author_name: string;
  content: string;
  created_at: string;
}

interface PhotoPostProps {
  postId: number;
  authorName: string;
  content: { caption?: string; title?: string };
  media: Media[];
  locationName?: string;
  capturedAt?: string;
  createdAt: string;
  isAuthor?: boolean;
  onDelete?: () => void;
}

export function PhotoPost({
  postId,
  authorName,
  content,
  media,
  locationName,
  capturedAt,
  createdAt,
  isAuthor = false,
  onDelete,
}: PhotoPostProps) {
  const navigate = useNavigate();
  // comment_submit is logged server-side in routes/comments.ts, so don't double-count it here.
  const { trackLightboxOpen, trackGalleryOpen, trackMediaPlay } = useAnalytics();
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  const [galleryMode, setGalleryMode] = useState(false);
  const [showComments, setShowComments] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentCount, setCommentCount] = useState(0);
  const [newComment, setNewComment] = useState('');
  const [commentAuthor, setCommentAuthor] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [commentMessage, setCommentMessage] = useState<string | null>(null);

  const closeLightbox = () => {
    setSelectedImage(null);
    setGalleryMode(false);
  };

  const openLightbox = (index: number) => {
    // Only count opening the lightbox from the feed, not stepping between items.
    if (selectedImage === null) trackLightboxOpen(postId, index);
    setSelectedImage(index);
    setGalleryMode(false);
  };

  const openGallery = (index = 0) => {
    trackGalleryOpen(postId, media.length);
    setSelectedImage(index);
    setGalleryMode(true);
  };

  const showPrev = () =>
    setSelectedImage(prev => (prev !== null ? (prev === 0 ? media.length - 1 : prev - 1) : null));

  const showNext = () =>
    setSelectedImage(prev => (prev !== null ? (prev === media.length - 1 ? 0 : prev + 1) : null));

  // Lock body scroll when lightbox is open
  useEffect(() => {
    if (selectedImage !== null) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [selectedImage]);

  // Keyboard navigation while the lightbox is open
  useEffect(() => {
    if (selectedImage === null) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Escape steps back out of the gallery first, then closes.
        if (galleryMode) setGalleryMode(false);
        else closeLightbox();
      } else if (e.key === 'g' || e.key === 'G') {
        if (media.length > 1) setGalleryMode(g => !g);
      } else if (!galleryMode && media.length > 1) {
        if (e.key === 'ArrowLeft') showPrev();
        else if (e.key === 'ArrowRight') showNext();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedImage, galleryMode, media.length]);

  // Lightbox swipe state
  const lightboxTouchStartX = useRef<number>(0);
  const lightboxTouchStartY = useRef<number>(0);
  const lightboxSwiped = useRef(false);

  // Comment edit state
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editCommentContent, setEditCommentContent] = useState('');
  const [editCommentAuthor, setEditCommentAuthor] = useState('');
  const [isSavingComment, setIsSavingComment] = useState(false);

  const displayDate = capturedAt || createdAt;
  const formattedDate = new Date(displayDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Load comment count on mount
  useEffect(() => {
    loadCommentCount();
  }, [postId]);

  // Load full comments when expanded
  useEffect(() => {
    if (showComments) {
      loadComments();
    }
  }, [showComments, postId]);

  const loadCommentCount = async () => {
    const result = await getComments(postId);
    if (result.data) {
      setCommentCount(result.data.comments.length);
    }
  };

  const loadComments = async () => {
    const result = await getComments(postId);
    if (result.data) {
      setComments(result.data.comments);
      setCommentCount(result.data.comments.length);
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !commentAuthor.trim()) return;

    setIsSubmitting(true);
    setCommentMessage(null);

    const result = await submitComment(postId, commentAuthor.trim(), newComment.trim());

    if (result.error) {
      setCommentMessage('Failed to submit comment');
    } else if (result.data) {
      setCommentMessage(result.data.message);
      setNewComment('');
      // Reload comments if auto-approved
      if (result.data.comment.approved) {
        loadComments();
      } else {
        // Still show success message for pending comments
        setCommentMessage('Comment submitted for moderation');
      }
    }

    setIsSubmitting(false);
  };

  const handleEditComment = (comment: Comment) => {
    setEditingCommentId(comment.id);
    setEditCommentContent(comment.content);
    setEditCommentAuthor(comment.author_name);
  };

  const handleSaveComment = async () => {
    if (!editingCommentId || !editCommentContent.trim()) return;

    setIsSavingComment(true);
    const result = await editComment(editingCommentId, editCommentContent.trim(), editCommentAuthor.trim());

    if (result.data) {
      setComments(prev => prev.map(c =>
        c.id === editingCommentId
          ? { ...c, content: editCommentContent.trim(), author_name: editCommentAuthor.trim() }
          : c
      ));
      setEditingCommentId(null);
    }
    setIsSavingComment(false);
  };

  const handleDeleteComment = async (id: number) => {
    if (!confirm('Delete this comment?')) return;

    const result = await deleteComment(id);
    if (result.data) {
      setComments(prev => prev.filter(c => c.id !== id));
      setCommentCount(prev => prev - 1);
    }
  };

  return (
    <article className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Media Gallery */}
      {media.length === 1 ? (
        media[0].file_type.startsWith('video/') ? (
          <div
            className="relative cursor-pointer"
            onClick={() => openLightbox(0)}
          >
            <video
              src={`/uploads/${media[0].file_path}`}
              width={media[0].width}
              height={media[0].height}
              preload="metadata"
              className="w-full max-h-[600px] object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-16 h-16 text-white/80 drop-shadow-lg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        ) : (
          // width/height reserve the image's space before it loads, so posts
          // don't grow and push the rest of the feed around as images arrive
          <img
            src={`/uploads/${media[0].file_path}`}
            width={media[0].width}
            height={media[0].height}
            alt=""
            className="w-full max-h-[600px] object-cover cursor-pointer"
            onClick={() => openLightbox(0)}
          />
        )
      ) : media.length > 1 ? (
        <div className="relative">
        <div className="grid grid-cols-2 gap-1">
          {media.slice(0, 4).map((m, index) => (
            <div
              key={m.id}
              className="relative aspect-square cursor-pointer"
              onClick={() => (index === 3 && media.length > 4 ? openGallery(3) : openLightbox(index))}
            >
              {m.file_type.startsWith('video/') ? (
                <>
                  <video
                    src={`/uploads/${m.file_path}`}
                    preload="metadata"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-10 h-10 text-white/80 drop-shadow-lg" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </>
              ) : (
                <img
                  src={`/uploads/${m.file_path}`}
                  alt=""
                  className="w-full h-full object-cover"
                />
              )}
              {index === 3 && media.length > 4 && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-2xl font-bold">
                  +{media.length - 4}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Open every item in the post at once */}
        <button
          type="button"
          onClick={() => openGallery(0)}
          className="absolute bottom-2 right-2 flex items-center gap-1.5 px-2.5 py-1.5 bg-black/60 hover:bg-black/80 text-white text-xs font-medium rounded-lg backdrop-blur-sm transition-colors"
          title="View all photos in this post"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          View all {media.length}
        </button>
        </div>
      ) : null}

      {/* Content */}
      <div className="p-4">
        {/* Author, date, and actions */}
        <div className="flex flex-col gap-1 mb-3">
          {/* Top row: author, date, actions */}
          <div className="flex items-center justify-between">
            <span className="font-medium text-gray-900">{authorName}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">{formattedDate}</span>
              {/* Edit/Delete buttons for authors */}
              {isAuthor && (
                <div className="flex gap-1">
                  <button
                    onClick={() => navigate(`/edit/${postId}`)}
                    className="p-1.5 text-gray-400 hover:text-sky-500 transition-colors"
                    title="Edit post"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={onDelete}
                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                    title="Delete post"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>
          {/* Location row (separate line for better mobile display) */}
          {locationName && (
            <div className="text-sm text-gray-500 flex items-center gap-1">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="truncate">{locationName}</span>
            </div>
          )}
        </div>

        {/* Title (for legacy video posts) */}
        {content.title && (
          <h3 className="text-lg font-semibold text-gray-900 mb-1">{content.title}</h3>
        )}

        {/* Caption */}
        {content.caption && (
          <p className="text-gray-700 mb-3 whitespace-pre-wrap">{content.caption}</p>
        )}

        {/* Comments toggle */}
        <button
          onClick={() => setShowComments(!showComments)}
          className="text-sm text-gray-500 hover:text-sky-500 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {showComments ? 'Hide comments' : `Comments${commentCount > 0 ? ` (${commentCount})` : ''}`}
        </button>

        {/* Comments section */}
        {showComments && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            {/* Existing comments */}
            {comments.length > 0 ? (
              <div className="space-y-3 mb-4">
                {comments.map(comment => (
                  <div key={comment.id} className="text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-gray-900">{comment.author_name}</span>
                        <span className="text-gray-500 ml-2 text-xs">
                          {new Date(comment.created_at).toLocaleDateString()}
                        </span>
                        <p className="text-gray-700 mt-1">{comment.content}</p>
                      </div>
                      {isAuthor && (
                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            onClick={() => handleEditComment(comment)}
                            className="p-1 text-gray-400 hover:text-sky-500 transition-colors"
                            title="Edit comment"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteComment(comment.id)}
                            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                            title="Delete comment"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 mb-4">No comments yet. Be the first to comment!</p>
            )}

            {/* Comment form */}
            <form onSubmit={handleSubmitComment} className="space-y-2">
              <input
                type="text"
                value={commentAuthor}
                onChange={(e) => setCommentAuthor(e.target.value)}
                placeholder="Your name"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-sky-500 focus:border-sky-500 outline-none"
                required
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Write a comment..."
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-sky-500 focus:border-sky-500 outline-none"
                  required
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-sky-500 text-white text-sm rounded-lg hover:bg-sky-600 disabled:bg-sky-300 transition-colors"
                >
                  {isSubmitting ? '...' : 'Post'}
                </button>
              </div>
              {commentMessage && (
                <p className="text-sm text-green-600">{commentMessage}</p>
              )}
            </form>
          </div>
        )}
      </div>

      {/* Comment Edit Modal */}
      {editingCommentId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit Comment</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Author</label>
                <input
                  type="text"
                  value={editCommentAuthor}
                  onChange={e => setEditCommentAuthor(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                <textarea
                  value={editCommentContent}
                  onChange={e => setEditCommentContent(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setEditingCommentId(null)}
                className="px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveComment}
                disabled={isSavingComment || !editCommentContent.trim()}
                className="px-3 py-1.5 bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 text-white rounded-lg transition-colors text-sm"
              >
                {isSavingComment ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {selectedImage !== null && (
        <div
          className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center"
          onClick={() => {
            if (!lightboxSwiped.current) {
              closeLightbox();
            }
          }}
          onTouchStart={(e) => {
            lightboxTouchStartX.current = e.touches[0].clientX;
            lightboxTouchStartY.current = e.touches[0].clientY;
            lightboxSwiped.current = false;
          }}
          onTouchEnd={(e) => {
            if (galleryMode) return;
            const dx = lightboxTouchStartX.current - e.changedTouches[0].clientX;
            const dy = lightboxTouchStartY.current - e.changedTouches[0].clientY;
            // Only swipe if horizontal movement is dominant and exceeds threshold
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) && media.length > 1) {
              lightboxSwiped.current = true;
              if (dx > 0) {
                showNext(); // swipe left -> next
              } else {
                showPrev(); // swipe right -> previous
              }
            }
          }}
        >
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4">
            {media.length > 1 ? (
              <button
                data-testid="gallery-toggle"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setGalleryMode(g => !g);
                }}
                title={galleryMode ? 'Back to photo' : 'View all photos in this post'}
              >
                {galleryMode ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Back
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                    Gallery
                  </>
                )}
              </button>
            ) : (
              <span />
            )}

            <button
              className="text-white text-4xl leading-none px-2"
              onClick={(e) => {
                e.stopPropagation();
                closeLightbox();
              }}
              aria-label="Close"
            >
              &times;
            </button>
          </div>

          {galleryMode ? (
            /* Gallery: every item in the post at once */
            <div
              data-testid="gallery-grid"
              className="absolute inset-0 pt-16 pb-4 px-4 overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {media.map((m, index) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => openLightbox(index)}
                    className={`relative aspect-square overflow-hidden rounded-lg group ${
                      index === selectedImage ? 'ring-2 ring-sky-400' : ''
                    }`}
                    title={`Open item ${index + 1}`}
                  >
                    {m.file_type.startsWith('video/') ? (
                      <>
                        <video
                          src={`/uploads/${m.file_path}`}
                          preload="metadata"
                          className="w-full h-full object-cover bg-black"
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <svg className="w-8 h-8 text-white/80 drop-shadow-lg" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </>
                    ) : (
                      <img
                        src={`/uploads/${m.file_path}`}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                    )}
                    <span className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/60 text-white text-[11px] rounded">
                      {index + 1}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {media.length > 1 && (
                <>
                  <button
                    className="absolute left-4 text-white text-4xl p-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      showPrev();
                    }}
                    aria-label="Previous"
                  >
                    &#8249;
                  </button>
                  <button
                    className="absolute right-4 text-white text-4xl p-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      showNext();
                    }}
                    aria-label="Next"
                  >
                    &#8250;
                  </button>
                </>
              )}

              {/* Image counter */}
              {media.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/80 text-sm bg-black/50 px-3 py-1 rounded-full">
                  {selectedImage + 1} / {media.length}
                </div>
              )}

              {media[selectedImage].file_type.startsWith('video/') ? (
                <video
                  key={selectedImage}
                  src={`/uploads/${media[selectedImage].file_path}`}
                  controls
                  autoPlay
                  className="max-w-full max-h-full object-contain"
                  onClick={(e) => e.stopPropagation()}
                  onPlay={() => trackMediaPlay(postId, 'video')}
                />
              ) : (
                <img
                  src={`/uploads/${media[selectedImage].file_path}`}
                  alt=""
                  className="max-w-full max-h-full object-contain"
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </>
          )}
        </div>
      )}
    </article>
  );
}
