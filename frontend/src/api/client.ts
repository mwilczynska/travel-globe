import type { ApiResponse, Post, User, GlobePoint, Comment } from '@/types';

const API_BASE = '/api';

// CSRF token cache
let csrfToken: string | null = null;

// Fetch CSRF token from server
async function getCsrfToken(): Promise<string> {
  if (csrfToken) {
    return csrfToken;
  }

  try {
    const response = await fetch(`${API_BASE}/csrf-token`, {
      credentials: 'include',
    });
    if (response.ok) {
      const data = await response.json();
      csrfToken = data.csrfToken;
      return csrfToken ?? '';
    }
  } catch {
    console.warn('Failed to fetch CSRF token');
  }
  return '';
}

// Clear CSRF token (call on logout or session expiry)
export function clearCsrfToken() {
  csrfToken = null;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    // Get CSRF token for state-changing requests
    const method = options.method?.toUpperCase() || 'GET';
    const needsCsrf = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);
    const token = needsCsrf ? await getCsrfToken() : '';

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-CSRF-Token': token } : {}),
        ...options.headers,
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      // Clear CSRF token on 403 to force refresh on next request
      if (response.status === 403 && error.error?.includes('CSRF')) {
        csrfToken = null;
      }
      return { error: error.error || `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { data };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' };
  }
}

// Viewer auth
export const viewerLogin = (password: string) =>
  request<{ success: boolean }>('/viewer/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });

export const checkViewerSession = () =>
  request<{ isViewer: boolean; isAuthor: boolean; passwordRequired: boolean }>('/viewer/check');

// Author auth
export const authorLogin = (username: string, password: string) =>
  request<{ user: User }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

export const authorLogout = async () => {
  const result = await request<{ success: boolean }>('/auth/logout', { method: 'POST' });
  // Clear CSRF token on logout
  clearCsrfToken();
  return result;
};

export const getCurrentUser = () =>
  request<User>('/auth/me');

// Posts
export const getPosts = (params?: {
  page?: number;
  limit?: number;
  type?: string;
}) => {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.type) searchParams.set('type', params.type);
  const query = searchParams.toString();
  return request<{ posts: Post[]; total: number; page: number; totalPages: number }>(`/posts${query ? `?${query}` : ''}`);
};

export const getPost = (id: number) =>
  request<Post>(`/posts/${id}`);

export const createPost = (data: Record<string, unknown>) =>
  request<{ id: number; message: string }>('/posts', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const updatePost = (id: number, data: Record<string, unknown>) =>
  request<{ message: string }>(`/posts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

export const deletePost = (id: number) =>
  request<{ success: boolean }>(`/posts/${id}`, { method: 'DELETE' });

// Globe data
export const getGlobeData = () =>
  request<{ points: GlobePoint[]; route: [number, number][] }>('/posts/globe/data');

// Comments
export const getComments = (postId: number) =>
  request<{ comments: Comment[] }>(`/comments/post/${postId}`);

export const submitComment = (postId: number, authorName: string, content: string) =>
  request<{ comment: Comment; message: string }>(`/comments/post/${postId}`, {
    method: 'POST',
    body: JSON.stringify({ author_name: authorName, content }),
  });

export const getPendingComments = () =>
  request<{ comments: Comment[] }>('/comments/pending');

export const approveComment = (id: number) =>
  request<{ success: boolean }>(`/comments/${id}/approve`, { method: 'PUT' });

export const deleteComment = (id: number) =>
  request<{ success: boolean }>(`/comments/${id}`, { method: 'DELETE' });

export const editComment = (id: number, content: string, authorName?: string) =>
  request<{ success: boolean; comment: Comment }>(`/comments/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ content, author_name: authorName }),
  });

export const getAllComments = () =>
  request<{ comments: (Comment & { post_title?: string })[] }>('/comments/all');

// Site settings
export const getSetting = (key: string) =>
  request<{ key: string; value: string | null }>(`/settings/${key}`);

export const updateSetting = (key: string, value: string) =>
  request<{ success: boolean; key: string; value: string }>(`/settings/${key}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });

// Upload
export const uploadMedia = async (file: File): Promise<ApiResponse<{
  filePath: string;
  fileType: string;
  width?: number;
  height?: number;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  capturedAt?: string;
  exifData?: Record<string, unknown>;
}>> => {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      return { error: error.error || `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { data };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' };
  }
};

// Settings
export const updateViewerPassword = (password: string) =>
  request<{ success: boolean }>('/settings/viewer-password', {
    method: 'PUT',
    body: JSON.stringify({ password }),
  });

// Health check
export const healthCheck = () =>
  request<{ status: string; timestamp: string }>('/health');
