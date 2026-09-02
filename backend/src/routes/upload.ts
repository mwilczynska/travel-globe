import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authorAuth } from '../middleware/authorAuth.js';
import { extractExif } from '../services/exif.js';
import { processImage } from '../services/imageProcessor.js';
import { reverseGeocode } from '../services/geocoding.js';
import { convertHeicIfNeeded } from '../services/heicConverter.js';

const router = Router();

// Configure multer for temporary file storage
const uploadsDir = path.join(__dirname, '../../uploads');
const tempDir = path.join(uploadsDir, 'temp');

// Ensure directories exist
[uploadsDir, tempDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, tempDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
  const allowedAudioTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4'];

  // HEIC files are often sent as application/octet-stream by browsers
  const heicExtensions = ['.heic', '.heif'];
  const ext = path.extname(file.originalname).toLowerCase();

  const allAllowed = [...allowedImageTypes, ...allowedVideoTypes, ...allowedAudioTypes];

  if (allAllowed.includes(file.mimetype) || heicExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not allowed`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    // 200MB max. Must stay in step with client_max_body_size in
    // frontend/nginx-app.conf, which rejects larger uploads before they
    // reach Express.
    fileSize: 200 * 1024 * 1024,
  },
});

// POST /api/upload - Upload a media file
router.post('/', authorAuth, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const tempPath = req.file.path;
    const originalName = req.file.originalname;
    const mimeType = req.file.mimetype;

    let result: {
      filePath: string;
      fileType: string;
      originalFilename: string;
      width?: number;
      height?: number;
      sizeBytes: number;
      exifData?: Record<string, unknown>;
      latitude?: number;
      longitude?: number;
      locationName?: string;
      capturedAt?: string;
    };

    // Check if file is HEIC by extension (browsers often send wrong MIME type for HEIC)
    const ext = path.extname(originalName).toLowerCase();
    const isHeicByExtension = ext === '.heic' || ext === '.heif';
    const isImage = mimeType.startsWith('image/') || isHeicByExtension;

    console.log('Processing upload:', { originalName, mimeType, ext, isImage, isHeicByExtension });

    // Process based on file type
    if (isImage) {
      // Convert HEIC to JPEG if needed (sharp doesn't fully support HEIC decoding)
      const { convertedPath, wasConverted } = await convertHeicIfNeeded(tempPath, mimeType);

      // Extract EXIF data before processing (use original for EXIF, converted for sharp)
      const exifData = await extractExif(tempPath);

      // Process and compress the image
      const processed = await processImage(convertedPath, uploadsDir, originalName);

      // Clean up converted file if one was created
      if (wasConverted && fs.existsSync(convertedPath)) {
        fs.unlinkSync(convertedPath);
      }

      // Try to get location name from GPS coordinates
      let locationName: string | undefined;
      if (exifData.latitude && exifData.longitude) {
        try {
          const geoResult = await reverseGeocode(exifData.latitude, exifData.longitude);
          if (geoResult) {
            locationName = geoResult.displayName;
          }
        } catch (e) {
          console.error('Reverse geocoding failed:', e);
        }
      }

      result = {
        filePath: processed.filePath,
        fileType: 'image',
        originalFilename: originalName,
        width: processed.width,
        height: processed.height,
        sizeBytes: processed.sizeBytes,
        exifData: exifData as Record<string, unknown>,
        latitude: exifData.latitude,
        longitude: exifData.longitude,
        locationName,
        capturedAt: exifData.capturedAt?.toISOString(),
      };

      // Clean up temp file
      fs.unlinkSync(tempPath);
    } else if (mimeType.startsWith('video/')) {
      // For video, just move to uploads folder
      const newFilename = `video-${Date.now()}${path.extname(originalName)}`;
      const newPath = path.join(uploadsDir, newFilename);
      fs.renameSync(tempPath, newPath);
      const stats = fs.statSync(newPath);

      result = {
        filePath: newFilename,
        fileType: mimeType, // Return actual MIME type (e.g., 'video/mp4')
        originalFilename: originalName,
        sizeBytes: stats.size,
      };
    } else if (mimeType.startsWith('audio/')) {
      // For audio, just move to uploads folder
      const newFilename = `audio-${Date.now()}${path.extname(originalName)}`;
      const newPath = path.join(uploadsDir, newFilename);
      fs.renameSync(tempPath, newPath);
      const stats = fs.statSync(newPath);

      result = {
        filePath: newFilename,
        fileType: mimeType, // Return actual MIME type (e.g., 'audio/mpeg')
        originalFilename: originalName,
        sizeBytes: stats.size,
      };
    } else {
      fs.unlinkSync(tempPath);
      res.status(400).json({ error: 'Unsupported file type' });
      return;
    }

    res.json(result);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

export default router;
