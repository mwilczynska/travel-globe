import { useState, useCallback } from 'react';
import { uploadMedia } from '../../api/client';

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

interface MediaUploaderProps {
  onUpload: (media: UploadedMedia) => void;
  accept?: string;
  multiple?: boolean;
}

export function MediaUploader({ onUpload, accept = 'image/*', multiple = false }: MediaUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadCount, setUploadCount] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleUpload = useCallback(async (file: File) => {
    const result = await uploadMedia(file);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (result.data) {
      // Get coordinates from top-level response (extracted from EXIF)
      const data = result.data as {
        filePath: string;
        fileType: string;
        width?: number;
        height?: number;
        latitude?: number;
        longitude?: number;
        locationName?: string;
        capturedAt?: string;
        exifData?: Record<string, unknown>;
      };

      onUpload({
        filePath: data.filePath,
        fileType: data.fileType,
        originalFilename: file.name,
        width: data.width,
        height: data.height,
        sizeBytes: file.size,
        latitude: data.latitude,
        longitude: data.longitude,
        locationName: data.locationName,
        capturedAt: data.capturedAt,
        exifData: data.exifData,
      });
    }
  }, [onUpload]);

  const handleFiles = useCallback(async (files: FileList) => {
    setIsUploading(true);
    setError(null);
    setUploadCount({ done: 0, total: files.length });

    for (let i = 0; i < files.length; i++) {
      await handleUpload(files[i]);
      setUploadCount(prev => ({ ...prev, done: prev.done + 1 }));
    }

    setIsUploading(false);
  }, [handleUpload]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFiles(files);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      if (multiple) {
        handleFiles(files);
      } else {
        // Single mode: wrap first file in a new FileList
        const dt = new DataTransfer();
        dt.items.add(files[0]);
        handleFiles(dt.files);
      }
    }
  };

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
        dragActive
          ? 'border-sky-500 bg-sky-50'
          : 'border-gray-300 hover:border-gray-400'
      }`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      {isUploading ? (
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-600">
            {uploadCount.total > 1
              ? `Uploading ${uploadCount.done + 1} of ${uploadCount.total}...`
              : 'Uploading...'}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <svg
              className="w-12 h-12 mx-auto text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <p className="text-gray-600 mb-2">
            {multiple
              ? 'Drag and drop files here, or click to select'
              : 'Drag and drop a file here, or click to select'}
          </p>
          <input
            type="file"
            accept={accept}
            multiple={multiple}
            onChange={handleFileChange}
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className="inline-block px-4 py-2 bg-sky-500 text-white rounded-lg cursor-pointer hover:bg-sky-600 transition-colors"
          >
            Choose File
          </label>
          {error && (
            <p className="mt-3 text-red-600 text-sm">{error}</p>
          )}
        </>
      )}
    </div>
  );
}
