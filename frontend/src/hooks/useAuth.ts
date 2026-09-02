import { useState, useEffect, useCallback } from 'react';
import { checkViewerSession, viewerLogin as apiViewerLogin, authorLogin as apiAuthorLogin, authorLogout, getCurrentUser } from '../api/client';

interface User {
  id: number;
  username: string;
  display_name: string;
}

interface AuthState {
  isLoading: boolean;
  isViewer: boolean;
  isAuthor: boolean;
  passwordRequired: boolean;
  user: User | null;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isViewer: false,
    isAuthor: false,
    passwordRequired: true,
    user: null,
    error: null,
  });

  const checkAuth = useCallback(async () => {
    setState(s => ({ ...s, isLoading: true, error: null }));
    const result = await checkViewerSession();

    if (result.error || !result.data) {
      setState(s => ({
        ...s,
        isLoading: false,
        error: result.error || 'Auth check failed',
      }));
      return;
    }

    let user: User | null = null;
    if (result.data.isAuthor) {
      const userResult = await getCurrentUser();
      if (userResult.data) {
        user = userResult.data as User;
      }
    }

    setState({
      isLoading: false,
      isViewer: result.data.isViewer,
      isAuthor: result.data.isAuthor,
      passwordRequired: result.data.passwordRequired,
      user,
      error: null,
    });
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const viewerLogin = async (password: string) => {
    setState(s => ({ ...s, isLoading: true, error: null }));
    const result = await apiViewerLogin(password);

    if (result.error) {
      setState(s => ({
        ...s,
        isLoading: false,
        error: result.error || 'Login failed',
      }));
      throw new Error(result.error);
    }

    await checkAuth();
  };

  const authorLogin = async (username: string, password: string) => {
    setState(s => ({ ...s, isLoading: true, error: null }));
    const result = await apiAuthorLogin(username, password);

    if (result.error || !result.data) {
      setState(s => ({
        ...s,
        isLoading: false,
        error: result.error || 'Login failed',
      }));
      throw new Error(result.error || 'Login failed');
    }

    setState(s => ({
      ...s,
      isLoading: false,
      isViewer: true,
      isAuthor: true,
      user: result.data!.user,
      error: null,
    }));
  };

  const logout = async () => {
    await authorLogout();
    setState({
      isLoading: false,
      isViewer: false,
      isAuthor: false,
      passwordRequired: true,
      user: null,
      error: null,
    });
  };

  return {
    ...state,
    viewerLogin,
    authorLogin,
    logout,
    checkAuth,
  };
}
