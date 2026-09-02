import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getComments, submitComment, editComment, deleteComment } from '../../api/client';
import { useAnalytics } from '../../hooks/useAnalytics';

interface Comment {
  id: number;
  author_name: string;
  content: string;
  created_at: string;
}

interface LinkPostProps {
  postId: number;
  authorName: string;
  content: {
    url?: string;
    title?: string;
    description?: string;
    thumbnail?: string;
    caption?: string;
  };
  locationName?: string;
  capturedAt?: string;
  createdAt: string;
  isAuthor?: boolean;
  onDelete?: () => void;
}

export function LinkPost({
  postId,
  authorName,
  content,
  locationName,
  capturedAt,
  createdAt,
  isAuthor = false,
  onDelete,
}: LinkPostProps) {
  const navigate = useNavigate();
  const { trackOutboundLink } = useAnalytics();
  const [showComments, setShowComments] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentCount, setCommentCount] = useState(0);
  const [newComment, setNewComment] = useState('');
  const [commentAuthor, setCommentAuthor] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [commentMessage, setCommentMessage] = useState<string | null>(null);

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

  // Extract domain from URL for display
  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  useEffect(() => {
    loadCommentCount();
  }, [postId]);

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
      if (result.data.comment.approved) {
        loadComments();
      } else {
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
      {/* Link Preview Card */}
      <a
        href={content.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block hover:bg-gray-50 transition-colors"
        onClick={() => content.url && trackOutboundLink(content.url, postId)}
      >
        {content.thumbnail && (
          <div className="aspect-video bg-gray-100 overflow-hidden">
            <img
              src={content.thumbnail.startsWith('/') ? `/uploads/${content.thumbnail}` : content.thumbnail}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span>{content.url ? getDomain(content.url) : 'Link'}</span>
          </div>
          {content.title && (
            <h3 className="text-lg font-semibold text-gray-900 mb-1 line-clamp-2">
              {content.title}
            </h3>
          )}
          {content.description && (
            <p className="text-gray-600 text-sm line-clamp-3">
              {content.description}
            </p>
          )}
        </div>
      </a>

      {/* Caption & Metadata */}
      <div className="p-4">
        {/* Caption */}
        {content.caption && (
          <p className="text-gray-700 mb-3 whitespace-pre-wrap">{content.caption}</p>
        )}

        {/* Author, date, and actions */}
        <div className="flex flex-col gap-1 mb-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-gray-900">{authorName}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">{formattedDate}</span>
              {isAuthor && (
                <div className="flex gap-1">
                  <button
                    onClick={(e) => { e.preventDefault(); navigate(`/edit/${postId}`); }}
                    className="p-1.5 text-gray-400 hover:text-sky-500 transition-colors"
                    title="Edit post"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => { e.preventDefault(); onDelete?.(); }}
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
    </article>
  );
}
