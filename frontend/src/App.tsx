import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { useState, useRef, useCallback } from 'react'
import { useAuth } from './hooks/useAuth'
import { ViewerGate } from './components/auth/ViewerGate'
import { AuthorLogin } from './components/auth/AuthorLogin'
import { CreatePost } from './components/admin/CreatePost'
import { EditPost } from './components/admin/EditPost'
import { CommentModeration } from './components/admin/CommentModeration'
import { AnalyticsDashboard } from './components/admin/AnalyticsDashboard'
import { Feed } from './components/feed/Feed'
import { Globe } from './components/globe/Globe'
import { PostCarousel } from './components/feed/PostCarousel'
import { useAnalytics, usePageView } from './hooks/useAnalytics'
import { SITE_NAME } from './config'

type MobileMode = 'blog' | 'map'

function HomePage({ isAuthor, user, onLogout }: { isAuthor: boolean; user: { display_name: string } | null; onLogout: () => void }) {
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null)
  const [mobileMode, setMobileMode] = useState<MobileMode>('blog')
  const feedRef = useRef<HTMLDivElement>(null)
  const pinHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { trackGlobeInteraction } = useAnalytics()
  usePageView()

  const handlePinClick = useCallback((postId: number) => {
    setSelectedPostId(postId)
    trackGlobeInteraction('pin_click', { post_id: postId })
    // Scroll to the post in the feed
    const postElement = document.getElementById(`post-${postId}`)
    if (postElement) {
      postElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // Brief highlight effect
      postElement.classList.add('ring-2', 'ring-sky-500')
      setTimeout(() => {
        postElement.classList.remove('ring-2', 'ring-sky-500')
      }, 2000)
    }
  }, [trackGlobeInteraction])

  const handlePostHover = useCallback((postId: number | null) => {
    setSelectedPostId(postId)
  }, [])

  const handlePinHover = useCallback((postId: number | null) => {
    if (pinHoverTimer.current) clearTimeout(pinHoverTimer.current)
    if (postId === null) return
    pinHoverTimer.current = setTimeout(() => {
      setSelectedPostId(postId)
      const el = document.getElementById(`post-${postId}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 400)
  }, [])

  // Handle post selection from carousel (map mode)
  const handleCarouselPostSelect = useCallback((postId: number) => {
    setMobileMode('blog')
    setSelectedPostId(postId)
    // Wait for mode switch, then scroll to post
    setTimeout(() => {
      const postElement = document.getElementById(`post-${postId}`)
      if (postElement) {
        postElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        postElement.classList.add('ring-2', 'ring-sky-500')
        setTimeout(() => {
          postElement.classList.remove('ring-2', 'ring-sky-500')
        }, 2000)
      }
    }, 100)
  }, [])

  // Handle post highlight from carousel (center globe)
  const handleCarouselPostHighlight = useCallback((postId: number) => {
    setSelectedPostId(postId)
  }, [])

  return (
    <div className={`min-h-screen bg-gray-50 flex flex-col ${mobileMode === 'map' ? 'lg:overflow-auto overflow-hidden h-screen' : ''}`}>
      {/* Header */}
      {/* z-50 keeps the header above the globe pane (z-20) and its map-mode
          toggle bar (z-30) — at equal z-index the later DOM node would win and
          the blue bar would paint over the header once the page scrolls. */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 h-16">
        <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between relative">
          {/* Left/Center: Logo + Title */}
          <div className="flex items-center gap-2 flex-1 min-w-0 lg:flex-none lg:absolute lg:left-1/2 lg:-translate-x-1/2">
            <img
              src="/logo.png"
              alt={SITE_NAME}
              className="h-8 w-auto flex-shrink-0"
            />
            <h1 className={`font-bold text-gray-900 truncate ${isAuthor ? 'hidden lg:block lg:text-2xl' : 'text-base lg:text-2xl'}`}>
              {SITE_NAME}
            </h1>
          </div>

          {/* Right: Navigation */}
          <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
            {isAuthor ? (
              <>
                <Link
                  to="/create"
                  className="px-3 py-1.5 sm:px-4 sm:py-2 bg-sky-500 hover:bg-sky-600 text-white text-xs sm:text-sm font-medium rounded-lg transition-colors"
                >
                  + New
                </Link>
                <Link
                  to="/comments"
                  className="text-sm text-gray-500 hover:text-sky-500"
                  title="Settings"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </Link>
                <Link
                  to="/analytics"
                  className="text-sm text-gray-500 hover:text-sky-500"
                  title="View analytics"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </Link>
                <span className="text-sm text-gray-600 hidden lg:inline">
                  {user?.display_name}
                </span>
                <button
                  onClick={onLogout}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                to="/author/login"
                className="text-xs sm:text-sm text-gray-500 hover:text-sky-500"
              >
                Author login
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main content - split layout */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Globe section */}
        <div className={`lg:w-1/2 lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:border-r border-gray-200 overflow-hidden ${
          mobileMode === 'map'
            ? 'fixed left-0 right-0 top-16 h-[calc(100vh-4rem)] z-20 bg-slate-900'
            : 'relative h-[30vh]'
        } lg:relative lg:inset-auto lg:z-auto lg:bg-transparent lg:h-[calc(100vh-4rem)] lg:p-4`}>
          <div className="w-full h-full lg:rounded-2xl lg:overflow-hidden lg:shadow-lg lg:border lg:border-gray-200">
            <Globe onPinClick={handlePinClick} onPinHover={handlePinHover} selectedPostId={selectedPostId} />
          </div>

          {/* Carousel in map mode */}
          {mobileMode === 'map' && (
            <div className="lg:hidden absolute bottom-24 left-0 right-0 z-20">
              <PostCarousel
                onPostSelect={handleCarouselPostSelect}
                onPostHighlight={handleCarouselPostHighlight}
              />
            </div>
          )}

          {/* Mobile mode toggle button */}
          <button
            onClick={() => setMobileMode(mobileMode === 'blog' ? 'map' : 'blog')}
            className={`lg:hidden absolute left-0 right-0 h-10 bg-sky-500 hover:bg-sky-600 text-white flex items-center justify-center transition-colors z-30 ${
              mobileMode === 'map' ? 'bottom-12' : 'bottom-0'
            }`}
            aria-label={mobileMode === 'blog' ? 'Enter map mode' : 'Exit map mode'}
          >
            <svg
              className={`w-5 h-5 transition-transform ${mobileMode === 'map' ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Feed section - hidden in map mode on mobile */}
        <div ref={feedRef} className={`lg:w-1/2 flex-1 overflow-y-auto ${
          mobileMode === 'map' ? 'hidden lg:block' : ''
        }`}>
          <main className="max-w-2xl mx-auto px-4 py-8">
            <Feed onPostHover={handlePostHover} />
          </main>
        </div>
      </div>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-500">Loading...</p>
      </div>
    </div>
  )
}

function AppContent() {
  const auth = useAuth()

  if (auth.isLoading) {
    return <LoadingScreen />
  }

  // If password is required and user is not a viewer, show gate
  if (auth.passwordRequired && !auth.isViewer) {
    return (
      <Routes>
        <Route
          path="/author/login"
          element={
            <AuthorLogin
              onLogin={auth.authorLogin}
              error={auth.error}
              isLoading={auth.isLoading}
            />
          }
        />
        <Route
          path="*"
          element={
            <ViewerGate
              onLogin={auth.viewerLogin}
              error={auth.error}
              isLoading={auth.isLoading}
            />
          }
        />
      </Routes>
    )
  }

  // User is authenticated
  return (
    <Routes>
      <Route
        path="/author/login"
        element={
          <AuthorLogin
            onLogin={auth.authorLogin}
            error={auth.error}
            isLoading={auth.isLoading}
          />
        }
      />
      {auth.isAuthor && (
        <>
          <Route path="/create" element={<CreatePost />} />
          <Route path="/edit/:postId" element={<EditPost />} />
          <Route path="/comments" element={<CommentModeration />} />
          <Route path="/analytics" element={<AnalyticsDashboard />} />
        </>
      )}
      <Route
        path="/"
        element={
          <HomePage
            isAuthor={auth.isAuthor}
            user={auth.user}
            onLogout={auth.logout}
          />
        }
      />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}

export default App
