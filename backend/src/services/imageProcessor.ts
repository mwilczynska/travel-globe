import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const MAX_WIDTH = 2000;
const QUALITY = 85;

export interface ProcessedImage {
  filePath: string;
  width: number;
  height: number;
  format: string;
  sizeBytes: number;
}

export async function processImage(
  inputPath: string,
  outputDir: string,
  filename: string
): Promise<ProcessedImage> {
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate output filename with webp extension
  const baseName = path.parse(filename).name;
  const outputFilename = `${baseName}-${Date.now()}.webp`;
  const outputPath = path.join(outputDir, outputFilename);

  // Get original image metadata
  const metadata = await sharp(inputPath).metadata();

  // Calculate new dimensions (maintain aspect ratio)
  let width = metadata.width || MAX_WIDTH;
  let height = metadata.height || MAX_WIDTH;

  if (width > MAX_WIDTH) {
    const ratio = MAX_WIDTH / width;
    width = MAX_WIDTH;
    height = Math.round(height * ratio);
  }

  // Process and save the image
  await sharp(inputPath)
    .rotate() // Auto-rotate based on EXIF orientation
    .resize(width, height, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: QUALITY })
    .toFile(outputPath);

  // Get the processed file stats
  const stats = fs.statSync(outputPath);
  const processedMeta = await sharp(outputPath).metadata();

  return {
    filePath: outputFilename,
    width: processedMeta.width || width,
    height: processedMeta.height || height,
    format: 'webp',
    sizeBytes: stats.size,
  };
}

export async function createThumbnail(
  inputPath: string,
  outputDir: string,
  filename: string,
  size: number = 400
): Promise<ProcessedImage> {
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const baseName = path.parse(filename).name;
  const outputFilename = `${baseName}-thumb-${Date.now()}.webp`;
  const outputPath = path.join(outputDir, outputFilename);

  await sharp(inputPath)
    .rotate()
    .resize(size, size, {
      fit: 'cover',
      position: 'center',
    })
    .webp({ quality: 80 })
    .toFile(outputPath);

  const stats = fs.statSync(outputPath);
  const meta = await sharp(outputPath).metadata();

  return {
    filePath: outputFilename,
    width: meta.width || size,
    height: meta.height || size,
    format: 'webp',
    sizeBytes: stats.size,
  };
}
