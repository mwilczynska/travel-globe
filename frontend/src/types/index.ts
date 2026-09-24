export interface User {
  id: number;
  username: string;
  display_name: string;
  created_at: string;
}

export type PostType = 'photo' | 'text' | 'quote' | 'link' | 'audio' | 'video';

export interface Post {
  id: number;
  author_id: number;
  author?: User;
  post_type: PostType;
  content: Record<string, unknown>;
  latitude?: number;
  longitude?: number;
  location_name?: string;
  captured_at?: string;
  created_at: string;
  updated_at: string;
  media?: Media[];
  tags?: string[];
}

export interface Media {
  id: number;
  post_id: number;
  file_path: string;
  file_type: string;
  original_filename?: string;
  size_bytes?: number;
  width?: number;
  height?: number;
  exif_data?: Record<string, unknown>;
  created_at: string;
}

export interface Comment {
  id: number;
  post_id: number;
  author_name: string;
  content: string;
  approved: number;
  created_at: string;
}

export interface GlobePoint {
  id: number;
  lat: number;
  lng: number;
  label: string;
  // Card fields for the mobile map-mode carousel
  post_type: PostType;
  title: string | null;
  thumbnail: string | null;
  thumbnail_is_video: boolean;
}

export interface AuthState {
  isViewer: boolean;
  isAuthor: boolean;
  user?: User;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}
