import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getPendingComments,
  getAllComments,
  approveComment,
  deleteComment,
  editComment,
  getSetting,
  updateSetting,
} from '../../api/client';
import type { Comment } from '../../types';

interface CommentWithTitle extends Comment {
  post_title?: string;
}

type TabType = 'pending' | 'all';

export function CommentModeration() {
  const navigate = useNavigate();
  const [comments, setComments] = useState<CommentWithTitle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [moderationEnabled, setModerationEnabled] = useState(false);
  const [moderationLoading, setModerationLoading] = useState(true);
  const [rateLimitingEnabled, setRateLimitingEnabled] = useState(true);
  const [rateLimitingLoading, setRateLimitingLoading] = useState(true);

  // Edit modal state
  const [editingComment, setEditingComment] = useState<CommentWithTitle | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editAuthorName, setEditAuthorName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadModerationSetting();
    loadRateLimitingSetting();
  }, []);

  useEffect(() => {
    loadComments();
  }, [activeTab]);

  const loadModerationSetting = async () => {
    setModerationLoading(true);
    const result = await getSetting('comment_moderation');
    if (result.data) {
      setModerationEnabled(result.data.value === 'on');
    }
    setModerationLoading(false);
  };

  const toggleModeration = async () => {
    const newValue = moderationEnabled ? 'off' : 'on';
    const result = await updateSetting('comment_moderation', newValue);
    if (result.error) {
      setError(result.error);
    } else {
      setModerationEnabled(newValue === 'on');
    }
  };

  const loadRateLimitingSetting = async () => {
    setRateLimitingLoading(true);
    const result = await getSetting('rate_limiting_enabled');
    if (result.data) {
      setRateLimitingEnabled(result.data.value === 'true');
    } else {
      // Default to false in development
      setRateLimitingEnabled(false);
    }
    setRateLimitingLoading(false);
  };

  const toggleRateLimiting = async () => {
    const newValue = rateLimitingEnabled ? 'false' : 'true';
    const result = await updateSetting('rate_limiting_enabled', newValue);
    if (result.error) {
      setError(result.error);
    } else {
      setRateLimitingEnabled(newValue === 'true');
    }
  };

  const loadComments = async () => {
    setIsLoading(true);
    setError(null);

    const result = activeTab === 'pending'
      ? await getPendingComments()
      : await getAllComments();

    if (result.error) {
      setError(result.error);
      setIsLoading(false);
      return;
    }

    if (result.data) {
      setComments(result.data.comments as CommentWithTitle[]);
    }

    setIsLoading(false);
  };

  const handleApprove = async (id: number) => {
    setActioningId(id);
    const result = await approveComment(id);
    if (result.error) {
      setError(result.error);
    } else {
      if (activeTab === 'pending') {
        setComments(prev => prev.filter(c => c.id !== id));
      } else {
        setComments(prev => prev.map(c => c.id === id ? { ...c, approved: 1 } : c));
      }
    }
    setActioningId(null);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this comment?')) return;

    setActioningId(id);
    const result = await deleteComment(id);
    if (result.error) {
      setError(result.error);
    } else {
      setComments(prev => prev.filter(c => c.id !== id));
    }
    setActioningId(null);
  };

  const openEditModal = (comment: CommentWithTitle) => {
    setEditingComment(comment);
    setEditContent(comment.content);
    setEditAuthorName(comment.author_name);
  };

  const closeEditModal = () => {
    setEditingComment(null);
    setEditContent('');
    setEditAuthorName('');
  };

  const handleSaveEdit = async () => {
    if (!editingComment) return;

    setIsSaving(true);
    const result = await editComment(editingComment.id, editContent, editAuthorName);
    if (result.error) {
      setError(result.error);
    } else if (result.data) {
      const updatedComment = result.data.comment;
      setComments(prev =>
        prev.map(c => c.id === editingComment.id ? { ...c, ...updatedComment } : c)
      );
      closeEditModal();
    }
    setIsSaving(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const pendingCount = comments.filter(c => c.approved === 0).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Settings</h1>
          <button
            onClick={() => navigate('/')}
            className="text-gray-500 hover:text-gray-700"
          >
            Back to Blog
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Settings Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 space-y-4">
          <h2 className="font-semibold text-gray-900 border-b border-gray-100 pb-2">Site Settings</h2>

          {/* Comment Moderation Toggle */}
          <div className="flex items-center justify-between gap-4 py-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-gray-900">Pre-approval Moderation</h3>
              <p className="text-sm text-gray-500">
                {moderationEnabled
                  ? 'Comments from viewers require approval before appearing'
                  : 'Comments are published immediately (no approval needed)'}
              </p>
            </div>
            {moderationLoading ? (
              <div className="w-11 h-6 bg-gray-200 rounded-full animate-pulse flex-shrink-0"></div>
            ) : (
              <button
                onClick={toggleModeration}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                  moderationEnabled ? 'bg-sky-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    moderationEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            )}
          </div>

          {/* Rate Limiting Toggle */}
          <div className="flex items-center justify-between gap-4 py-2 border-t border-gray-100">
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-gray-900">Rate Limiting</h3>
              <p className="text-sm text-gray-500">
                {rateLimitingEnabled
                  ? 'API requests are rate limited to prevent abuse'
                  : 'Rate limiting disabled (for development/testing)'}
              </p>
            </div>
            {rateLimitingLoading ? (
              <div className="w-11 h-6 bg-gray-200 rounded-full animate-pulse flex-shrink-0"></div>
            ) : (
              <button
                onClick={toggleRateLimiting}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                  rateLimitingEnabled ? 'bg-sky-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    rateLimitingEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            )}
          </div>
        </div>

        {/* Comments Section Header */}
        <h2 className="font-semibold text-gray-900 mb-4">Comment Moderation</h2>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'pending'
                ? 'bg-sky-500 text-white'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            Pending {pendingCount > 0 && activeTab === 'all' && `(${pendingCount})`}
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'all'
                ? 'bg-sky-500 text-white'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            All Comments
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-12">
            <svg
              className="w-16 h-16 mx-auto text-gray-300 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h2 className="text-xl font-medium text-gray-900 mb-2">
              {activeTab === 'pending' ? 'All caught up!' : 'No comments yet'}
            </h2>
            <p className="text-gray-500">
              {activeTab === 'pending'
                ? 'No pending comments to moderate.'
                : 'No comments have been posted yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 mb-4">
              {comments.length} comment{comments.length !== 1 ? 's' : ''}
              {activeTab === 'pending' && ' pending moderation'}
            </p>

            {comments.map(comment => (
              <div
                key={comment.id}
                className={`bg-white rounded-xl shadow-sm border p-4 ${
                  comment.approved === 0 ? 'border-amber-200 bg-amber-50/50' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="font-medium text-gray-900">{comment.author_name}</span>
                      <span className="text-xs text-gray-400">
                        on {comment.post_title || `Post #${comment.post_id}`}
                      </span>
                      {comment.approved === 0 && (
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
                          Pending
                        </span>
                      )}
                    </div>
                    <p className="text-gray-700 whitespace-pre-wrap break-words">
                      {comment.content}
                    </p>
                    <p className="text-xs text-gray-400 mt-2">
                      {formatDate(comment.created_at)}
                    </p>
                  </div>

                  <div className="flex gap-2 flex-shrink-0">
                    {comment.approved === 0 && (
                      <button
                        onClick={() => handleApprove(comment.id)}
                        disabled={actioningId === comment.id}
                        className="px-3 py-1.5 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white text-sm rounded-lg transition-colors"
                      >
                        {actioningId === comment.id ? '...' : 'Approve'}
                      </button>
                    )}
                    <button
                      onClick={() => openEditModal(comment)}
                      disabled={actioningId === comment.id}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(comment.id)}
                      disabled={actioningId === comment.id}
                      className="px-3 py-1.5 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white text-sm rounded-lg transition-colors"
                    >
                      {actioningId === comment.id ? '...' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Edit Modal */}
      {editingComment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Edit Comment</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Author Name
                </label>
                <input
                  type="text"
                  value={editAuthorName}
                  onChange={e => setEditAuthorName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Content
                </label>
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={closeEditModal}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSaving || !editContent.trim()}
                className="px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 text-white rounded-lg transition-colors"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
