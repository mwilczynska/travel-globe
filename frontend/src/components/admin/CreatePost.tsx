import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MediaUploader } from './MediaUploader';
import { LocationPicker } from './LocationPicker';
import { SortableMediaGrid } from './SortableMediaGrid';
import { createPost } from '../../api/client';

type PostType = 'photo' | 'text' | 'quote' | 'link' | 'audio';

interface UploadedMedia {
  filePath: string;
  fileType: string;
  originalFilename: string;
  width?: number;
  height?: number;
  sizeBytes: number;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  capturedAt?: string;
  exifData?: Record<string, unknown>;
}

const POST_TYPE_INFO: Record<PostType, { label: string; icon: JSX.Element; description: string }> = {
  photo: {
    label: 'Photo/Video',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    description: 'Share photos & videos',
  },
  text: {
    label: 'Text',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    description: 'Write a blog post',
  },
  quote: {
    label: 'Quote',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
      </svg>
    ),
    description: 'Share a quote',
  },
  link: {
    label: 'Link',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
    description: 'Share a link',
  },
  audio: {
    label: 'Audio',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
    ),
    description: 'Share audio',
  },
};

export function CreatePost() {
  const navigate = useNavigate();
  const [postType, setPostType] = useState<PostType>('photo');

  // Photo-specific state
  const [media, setMedia] = useState<UploadedMedia[]>([]);
  const [caption, setCaption] = useState('');

  // Text-specific state
  const [textTitle, setTextTitle] = useState('');
  const [textBody, setTextBody] = useState('');

  // Quote-specific state
  const [quoteText, setQuoteText] = useState('');
  const [quoteSource, setQuoteSource] = useState('');

  // Link-specific state
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkDescription, setLinkDescription] = useState('');
  const [linkCaption, setLinkCaption] = useState('');

  // Audio-specific state
  const [audioMedia, setAudioMedia] = useState<UploadedMedia[]>([]);
  const [audioTitle, setAudioTitle] = useState('');
  const [audioCaption, setAudioCaption] = useState('');

  // Shared state
  const [locationName, setLocationName] = useState('');
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();
  const [postDate, setPostDate] = useState(() => {
    // Default to current datetime in local timezone for datetime-local input
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMediaUpload = (uploaded: UploadedMedia) => {
    setMedia(prev => [...prev, uploaded]);

    // Auto-populate location from first photo with GPS data
    if (!latitude && !longitude && uploaded.latitude && uploaded.longitude) {
      setLatitude(uploaded.latitude);
      setLongitude(uploaded.longitude);
      if (uploaded.locationName) {
        setLocationName(uploaded.locationName);
      }
    }

    // Auto-populate date/time from first media with capture date
    if (uploaded.capturedAt && media.length === 0) {
      const d = new Date(uploaded.capturedAt);
      const pad = (n: number) => n.toString().padStart(2, '0');
      setPostDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
    }
  };

  const handleAudioUpload = (uploaded: UploadedMedia) => {
    setAudioMedia(prev => [...prev, uploaded]);
  };

  const handleLocationChange = (location: { name: string; latitude?: number; longitude?: number }) => {
    setLocationName(location.name);
    if (location.latitude !== undefined && location.longitude !== undefined) {
      setLatitude(location.latitude);
      setLongitude(location.longitude);
    }
  };

  const removeMedia = (index: number) => {
    setMedia(prev => prev.filter((_, i) => i !== index));
  };

  const removeAudioMedia = (index: number) => {
    setAudioMedia(prev => prev.filter((_, i) => i !== index));
  };

  const validateForm = (): string | null => {
    switch (postType) {
      case 'photo':
        if (media.length === 0) return 'Please upload at least one photo or video';
        break;
      case 'text':
        if (!textBody.trim()) return 'Please enter some text';
        break;
      case 'quote':
        if (!quoteText.trim()) return 'Please enter a quote';
        break;
      case 'link':
        if (!linkUrl.trim()) return 'Please enter a URL';
        try {
          new URL(linkUrl);
        } catch {
          return 'Please enter a valid URL';
        }
        break;
      case 'audio':
        if (audioMedia.length === 0) return 'Please upload an audio file';
        break;
    }
    return null;
  };

  const buildPostData = () => {
    const baseData = {
      post_type: postType,
      latitude,
      longitude,
      location_name: locationName || undefined,
      captured_at: postDate ? new Date(postDate).toISOString() : undefined,
    };

    switch (postType) {
      case 'photo':
        return {
          ...baseData,
          content: { caption },
          media: media.map(m => ({
            file_path: m.filePath,
            file_type: m.fileType,
            original_filename: m.originalFilename,
            size_bytes: m.sizeBytes,
            width: m.width,
            height: m.height,
            exif_data: m.exifData,
          })),
        };
      case 'text':
        return {
          ...baseData,
          content: {
            title: textTitle || undefined,
            body: textBody,
          },
        };
      case 'quote':
        return {
          ...baseData,
          content: {
            text: quoteText,
            source: quoteSource || undefined,
          },
        };
      case 'link':
        return {
          ...baseData,
          content: {
            url: linkUrl,
            title: linkTitle || undefined,
            description: linkDescription || undefined,
            caption: linkCaption || undefined,
          },
        };
      case 'audio':
        return {
          ...baseData,
          content: {
            title: audioTitle || undefined,
            caption: audioCaption || undefined,
          },
          media: audioMedia.map(m => ({
            file_path: m.filePath,
            file_type: m.fileType,
            original_filename: m.originalFilename,
            size_bytes: m.sizeBytes,
          })),
        };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = await createPost(buildPostData());

    if (result.error) {
      setError(result.error);
      setIsSubmitting(false);
      return;
    }

    navigate('/');
  };

  const isSubmitDisabled = () => {
    if (isSubmitting) return true;
    switch (postType) {
      case 'photo':
        return media.length === 0;
      case 'text':
        return !textBody.trim();
      case 'quote':
        return !quoteText.trim();
      case 'link':
        return !linkUrl.trim();
      case 'audio':
        return audioMedia.length === 0;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Create Post</h1>
          <button
            onClick={() => navigate('/')}
            className="text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Post Type Selector */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Post Type
          </label>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {(Object.keys(POST_TYPE_INFO) as PostType[]).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setPostType(type)}
                className={`p-3 rounded-xl border-2 text-center transition-all ${
                  postType === type
                    ? 'border-sky-500 bg-sky-50 text-sky-700'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-900'
                }`}
              >
                <div className="flex justify-center mb-1">
                  {POST_TYPE_INFO[type].icon}
                </div>
                <div className="text-xs font-medium">{POST_TYPE_INFO[type].label}</div>
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Photo-specific fields */}
          {postType === 'photo' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Photos & Videos
                </label>
                <MediaUploader onUpload={handleMediaUpload} accept="image/*,.heic,.heif,video/*" multiple />

                {media.length > 0 && (
                  <div className="mt-4">
                    <SortableMediaGrid
                      items={media}
                      onReorder={setMedia}
                      onRemove={removeMedia}
                    />
                  </div>
                )}
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
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-colors"
                  placeholder="Write a caption..."
                />
              </div>
            </>
          )}

          {/* Text-specific fields */}
          {postType === 'text' && (
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
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-colors text-lg font-semibold"
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
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-colors"
                  placeholder="Write your post..."
                  required
                />
              </div>
            </>
          )}

          {/* Quote-specific fields */}
          {postType === 'quote' && (
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
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-colors font-serif text-lg"
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
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-colors"
                  placeholder="Who said this? e.g., Local saying, Mark Twain"
                />
              </div>
            </>
          )}

          {/* Link-specific fields */}
          {postType === 'link' && (
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
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-colors"
                  placeholder="https://example.com/article"
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
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-colors"
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
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-colors"
                  placeholder="Brief description of the link"
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
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-colors"
                  placeholder="Why are you sharing this?"
                />
              </div>
            </>
          )}

          {/* Audio-specific fields */}
          {postType === 'audio' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Audio File *
                </label>
                <MediaUploader onUpload={handleAudioUpload} accept="audio/*" />

                {audioMedia.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {audioMedia.map((m, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 bg-violet-50 rounded-lg">
                        <svg className="w-8 h-8 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                        <span className="flex-1 text-sm text-gray-700 truncate">{m.originalFilename}</span>
                        <button
                          type="button"
                          onClick={() => removeAudioMedia(index)}
                          className="text-red-500 hover:text-red-700"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
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
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-colors"
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
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-colors"
                  placeholder="Describe this audio..."
                />
              </div>
            </>
          )}

          {/* Location - shared by all post types */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Location
              {latitude && longitude && (
                <span className="ml-2 text-xs text-green-600">
                  (coordinates set)
                </span>
              )}
            </label>
            <LocationPicker
              value={locationName}
              latitude={latitude}
              longitude={longitude}
              onChange={handleLocationChange}
            />
            <p className="mt-1 text-xs text-gray-500">
              Search for a city or place to add coordinates for the map
            </p>
          </div>

          {/* Post Date - shared by all post types */}
          <div>
            <label htmlFor="postDate" className="block text-sm font-medium text-gray-700 mb-2">
              Date & Time
            </label>
            <input
              type="datetime-local"
              id="postDate"
              value={postDate}
              onChange={(e) => setPostDate(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-colors"
            />
            <p className="mt-1 text-xs text-gray-500">
              Auto-filled from photo date/time if available, or defaults to now. Time controls post ordering within a day.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitDisabled()}
            className="w-full py-3 px-4 bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 text-white font-medium rounded-lg transition-colors"
          >
            {isSubmitting ? 'Creating...' : 'Create Post'}
          </button>
        </form>
      </main>
    </div>
  );
}
