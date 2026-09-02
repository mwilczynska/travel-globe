import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LocationPicker } from './LocationPicker';
import { MediaUploader } from './MediaUploader';
import { SortableMediaGrid } from './SortableMediaGrid';
import { getPost, updatePost } from '../../api/client';

type PostType = 'photo' | 'text' | 'quote' | 'link' | 'audio' | 'video';

interface PostData {
  id: number;
  post_type: PostType;
  content: Record<string, unknown>;
  latitude?: number;
  longitude?: number;
  location_name?: string;
  captured_at?: string;
  tags: string[];
  media: Array<{
    id: number;
    file_path: string;
    file_type: string;
    original_filename?: string;
    size_bytes?: number;
    width?: number;
    height?: number;
    exif_data?: Record<string, unknown>;
  }>;
}

interface MediaItem {
  filePath: string;
  fileType: string;
  originalFilename: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  exifData?: Record<string, unknown>;
}

export function EditPost() {
  const navigate = useNavigate();
  const { postId } = useParams<{ postId: string }>();
  const [isLoading, setIsLoading] = useState(true);
  const [post, setPost] = useState<PostData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Content state for different post types
  const [caption, setCaption] = useState('');
  const [textTitle, setTextTitle] = useState('');
  const [textBody, setTextBody] = useState('');
  const [quoteText, setQuoteText] = useState('');
  const [quoteSource, setQuoteSource] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkDescription, setLinkDescription] = useState('');
  const [linkCaption, setLinkCaption] = useState('');
  const [audioTitle, setAudioTitle] = useState('');
  const [audioCaption, setAudioCaption] = useState('');
  // Shared state
  const [locationName, setLocationName] = useState('');
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();
  const [postDate, setPostDate] = useState('');
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function loadPost() {
      if (!postId) {
        setError('No post ID provided');
        setIsLoading(false);
        return;
      }

      const result = await getPost(parseInt(postId));
      if (result.error) {
        setError(result.error);
        setIsLoading(false);
        return;
      }

      if (result.data) {
        const postData = result.data as unknown as PostData;
        setPost(postData);

        // Populate media state from existing post
        if (postData.media && postData.media.length > 0) {
          setMediaItems(postData.media.map(m => ({
            filePath: m.file_path,
            fileType: m.file_type,
            originalFilename: m.original_filename || 'File',
            sizeBytes: m.size_bytes,
            width: m.width,
            height: m.height,
            exifData: m.exif_data,
          })));
        }

        // Populate form fields based on post type
        const content = postData.content || {};
        switch (postData.post_type) {
          case 'photo':
          case 'video':
            setCaption((content.caption as string) || '');
            break;
          case 'text':
            setTextTitle((content.title as string) || '');
            setTextBody((content.body as string) || '');
            break;
          case 'quote':
            setQuoteText((content.text as string) || '');
            setQuoteSource((content.source as string) || '');
            break;
          case 'link':
            setLinkUrl((content.url as string) || '');
            setLinkTitle((content.title as string) || '');
            setLinkDescription((content.description as string) || '');
            setLinkCaption((content.caption as string) || '');
            break;
          case 'audio':
            setAudioTitle((content.title as string) || '');
            setAudioCaption((content.caption as string) || '');
            break;
        }

        // Populate shared fields
        setLocationName(postData.location_name || '');
        setLatitude(postData.latitude);
        setLongitude(postData.longitude);
        // Set post date/time from captured_at
        const d = postData.captured_at ? new Date(postData.captured_at) : new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        setPostDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
      }

      setIsLoading(false);
    }

    loadPost();
  }, [postId]);

  const handleLocationChange = (location: { name: string; latitude?: number; longitude?: number }) => {
    setLocationName(location.name);
    if (location.latitude !== undefined && location.longitude !== undefined) {
      setLatitude(location.latitude);
      setLongitude(location.longitude);
    }
  };

  const buildPostData = () => {
    if (!post) return null;

    const baseData: Record<string, unknown> = {
      latitude,
      longitude,
      location_name: locationName || undefined,
      captured_at: postDate ? new Date(postDate).toISOString() : undefined,
    };

    // Include media for post types that use it
    if (['photo', 'audio', 'video'].includes(post.post_type)) {
      baseData.media = mediaItems.map(m => ({
        file_path: m.filePath,
        file_type: m.fileType,
        original_filename: m.originalFilename,
        size_bytes: m.sizeBytes || null,
        width: m.width || null,
        height: m.height || null,
        exif_data: m.exifData || null,
      }));
    }

    let content: Record<string, unknown>;
    switch (post.post_type) {
      case 'photo':
      case 'video':
        content = { caption };
        break;
      case 'text':
        content = { title: textTitle || undefined, body: textBody };
        break;
      case 'quote':
        content = { text: quoteText, source: quoteSource || undefined };
        break;
      case 'link':
        content = {
          url: linkUrl,
          title: linkTitle || undefined,
          description: linkDescription || undefined,
          caption: linkCaption || undefined,
        };
        break;
      case 'audio':
        content = { title: audioTitle || undefined, caption: audioCaption || undefined };
        break;
      default:
        content = {};
    }

    return { ...baseData, content };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!post) return;

    setIsSubmitting(true);
    setError(null);

    const data = buildPostData();
    if (!data) {
      setError('Failed to build post data');
      setIsSubmitting(false);
      return;
    }

    const result = await updatePost(post.id, data);
    if (result.error) {
      setError(result.error);
      setIsSubmitting(false);
      return;
    }

    navigate('/');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Post not found'}</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  const postTypeLabels: Record<PostType, string> = {
    photo: 'Photo/Video',
    text: 'Text',
    quote: 'Quote',
    link: 'Link',
    audio: 'Audio',
    video: 'Photo/Video',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Edit Post</h1>
          <button
            onClick={() => navigate('/')}
            className="text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Post Type Display */}
        <div className="mb-6 p-4 bg-gray-100 rounded-lg">
          <span className="text-sm text-gray-500">Post Type:</span>
          <span className="ml-2 font-medium text-gray-900">{postTypeLabels[post.post_type]}</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Photo/Video fields */}
          {(post.post_type === 'photo' || post.post_type === 'video') && (
            <>
              {/* Media */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Photos & Videos
                </label>
                {mediaItems.length > 0 && (
                  <div className="mb-3">
                    <SortableMediaGrid
                      items={mediaItems}
                      onReorder={setMediaItems}
                      onRemove={index => setMediaItems(prev => prev.filter((_, idx) => idx !== index))}
                    />
                  </div>
                )}
                <MediaUploader
                  accept="image/*,.heic,.heif,video/*"
                  multiple
                  onUpload={(media) => setMediaItems(prev => [...prev, media])}
                />
              </div>

              <div>
                <label htmlFor="caption" className="block text-sm font-medium text-gray-700 mb-2">
                  Caption
                </label>
                <textarea
                  id="caption"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                  placeholder="Write a caption..."
                />
              </div>
            </>
          )}

          {/* Text-specific fields */}
          {post.post_type === 'text' && (
            <>
              <div>
                <label htmlFor="textTitle" className="block text-sm font-medium text-gray-700 mb-2">
                  Title (optional)
                </label>
                <input
                  type="text"
                  id="textTitle"
                  value={textTitle}
                  onChange={(e) => setTextTitle(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none text-lg font-semibold"
                  placeholder="Post title"
                />
              </div>
              <div>
                <label htmlFor="textBody" className="block text-sm font-medium text-gray-700 mb-2">
                  Content *
                </label>
                <textarea
                  id="textBody"
                  value={textBody}
                  onChange={(e) => setTextBody(e.target.value)}
                  rows={8}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                  placeholder="Write your post..."
                  required
                />
              </div>
            </>
          )}

          {/* Quote-specific fields */}
          {post.post_type === 'quote' && (
            <>
              <div>
                <label htmlFor="quoteText" className="block text-sm font-medium text-gray-700 mb-2">
                  Quote *
                </label>
                <textarea
                  id="quoteText"
                  value={quoteText}
                  onChange={(e) => setQuoteText(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none font-serif text-lg"
                  placeholder="Enter the quote..."
                  required
                />
              </div>
              <div>
                <label htmlFor="quoteSource" className="block text-sm font-medium text-gray-700 mb-2">
                  Source (optional)
                </label>
                <input
                  type="text"
                  id="quoteSource"
                  value={quoteSource}
                  onChange={(e) => setQuoteSource(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                  placeholder="Who said this?"
                />
              </div>
            </>
          )}

          {/* Link-specific fields */}
          {post.post_type === 'link' && (
            <>
              <div>
                <label htmlFor="linkUrl" className="block text-sm font-medium text-gray-700 mb-2">
                  URL *
                </label>
                <input
                  type="url"
                  id="linkUrl"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                  placeholder="https://example.com"
                  required
                />
              </div>
              <div>
                <label htmlFor="linkTitle" className="block text-sm font-medium text-gray-700 mb-2">
                  Title (optional)
                </label>
                <input
                  type="text"
                  id="linkTitle"
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                  placeholder="Article title"
                />
              </div>
              <div>
                <label htmlFor="linkDescription" className="block text-sm font-medium text-gray-700 mb-2">
                  Description (optional)
                </label>
                <textarea
                  id="linkDescription"
                  value={linkDescription}
                  onChange={(e) => setLinkDescription(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                  placeholder="Brief description"
                />
              </div>
              <div>
                <label htmlFor="linkCaption" className="block text-sm font-medium text-gray-700 mb-2">
                  Your thoughts (optional)
                </label>
                <textarea
                  id="linkCaption"
                  value={linkCaption}
                  onChange={(e) => setLinkCaption(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                  placeholder="Why are you sharing this?"
                />
              </div>
            </>
          )}

          {/* Audio-specific fields */}
          {post.post_type === 'audio' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Audio File
                </label>
                {mediaItems.length > 0 ? (
                  <div className="p-3 bg-violet-50 rounded-lg flex items-center justify-between">
                    <span className="text-sm text-gray-700">{mediaItems[0].originalFilename}</span>
                    <button
                      type="button"
                      onClick={() => setMediaItems([])}
                      className="ml-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-sm"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <MediaUploader
                    accept="audio/*"
                    onUpload={(media) => setMediaItems([media])}
                  />
                )}
              </div>
              <div>
                <label htmlFor="audioTitle" className="block text-sm font-medium text-gray-700 mb-2">
                  Title (optional)
                </label>
                <input
                  type="text"
                  id="audioTitle"
                  value={audioTitle}
                  onChange={(e) => setAudioTitle(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                  placeholder="Audio title"
                />
              </div>
              <div>
                <label htmlFor="audioCaption" className="block text-sm font-medium text-gray-700 mb-2">
                  Caption (optional)
                </label>
                <textarea
                  id="audioCaption"
                  value={audioCaption}
                  onChange={(e) => setAudioCaption(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                  placeholder="Describe this audio..."
                />
              </div>
            </>
          )}

          {/* Location - shared */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Location
              {latitude && longitude && (
                <span className="ml-2 text-xs text-green-600">(coordinates set)</span>
              )}
            </label>
            <LocationPicker
              value={locationName}
              latitude={latitude}
              longitude={longitude}
              onChange={handleLocationChange}
            />
          </div>

          {/* Post Date & Time - shared */}
          <div>
            <label htmlFor="postDate" className="block text-sm font-medium text-gray-700 mb-2">
              Date & Time
            </label>
            <input
              type="datetime-local"
              id="postDate"
              value={postDate}
              onChange={(e) => setPostDate(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 text-white font-medium rounded-lg transition-colors"
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </main>
    </div>
  );
}
