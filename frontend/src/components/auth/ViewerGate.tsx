import { useState, FormEvent } from 'react';
import { SITE_NAME, SITE_TAGLINE } from '../../config';

interface ViewerGateProps {
  onLogin: (password: string) => Promise<void>;
  error: string | null;
  isLoading: boolean;
}

export function ViewerGate({ onLogin, error, isLoading }: ViewerGateProps) {
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!password.trim()) {
      setLocalError('Please enter a password');
      return;
    }

    try {
      await onLogin(password);
    } catch {
      // Error is handled by parent
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <img
            src="/logo.png"
            alt={SITE_NAME}
            className="h-20 w-auto mx-auto mb-4"
          />
          <h1 className="text-2xl lg:text-4xl font-bold text-gray-900">{SITE_NAME}</h1>
          <p className="text-gray-500 mt-2">{SITE_TAGLINE}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="mb-4">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-colors"
              placeholder="Enter viewer password"
              disabled={isLoading}
              autoFocus
            />
          </div>

          {(error || localError) && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error || localError}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 text-white font-medium rounded-lg transition-colors"
          >
            {isLoading ? 'Checking...' : 'Enter'}
          </button>

          <div className="mt-4 text-center">
            <a href="/author/login" className="text-sm text-gray-500 hover:text-sky-500">
              Author login
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
