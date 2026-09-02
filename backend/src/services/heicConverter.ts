import fs from 'fs';
import path from 'path';
import convert from 'heic-convert';

/**
 * Converts a HEIC/HEIF file to JPEG using heic-convert
 * Returns the path to the converted file (or original path if not HEIC)
 */
export async function convertHeicIfNeeded(
  filePath: string,
  mimeType: string
): Promise<{ convertedPath: string; wasConverted: boolean }> {
  const ext = path.extname(filePath).toLowerCase();
  const isHeic = mimeType === 'image/heic' || mimeType === 'image/heif' ||
    ext === '.heic' || ext === '.heif';

  if (!isHeic) {
    return { convertedPath: filePath, wasConverted: false };
  }

  console.log('Converting HEIC file to JPEG...');
  const startTime = Date.now();

  // Generate output path
  const dir = path.dirname(filePath);
  const baseName = path.basename(filePath, path.extname(filePath));
  const convertedPath = path.join(dir, `${baseName}-converted.jpg`);

  try {
    // Read the HEIC file
    const inputBuffer = fs.readFileSync(filePath);
    console.log('HEIC file size:', inputBuffer.length, 'bytes');

    // Convert to JPEG
    const outputBuffer = await convert({
      buffer: inputBuffer,
      format: 'JPEG',
      quality: 0.95,
    });

    // Write the converted file
    fs.writeFileSync(convertedPath, Buffer.from(outputBuffer));

    console.log('HEIC conversion complete in', Date.now() - startTime, 'ms');
    console.log('Output file:', convertedPath, '- size:', outputBuffer.byteLength, 'bytes');

    return { convertedPath, wasConverted: true };
  } catch (error) {
    console.error('HEIC conversion failed:', error);
    throw new Error(`Failed to convert HEIC file: ${error}`);
  }
}
