import exifr from 'exifr';

export interface ExifData {
  latitude?: number;
  longitude?: number;
  capturedAt?: Date;
  cameraMake?: string;
  cameraModel?: string;
  orientation?: number;
}

export async function extractExif(filePath: string): Promise<ExifData> {
  try {
    const exif = await exifr.parse(filePath, {
      pick: ['DateTimeOriginal', 'CreateDate', 'Make', 'Model', 'Orientation'],
    });

    // GPS has to be a second, separate read. `pick` restricts the output to the
    // listed tags, and latitude/longitude are values exifr *derives* from the
    // GPS block rather than tags in their own right — so a picked parse drops
    // them however gps:true is set, and coordinates came back undefined for
    // every photo.
    const gps = await exifr.gps(filePath).catch(() => null);

    if (!exif && !gps) {
      return {};
    }

    const result: ExifData = {};

    // Extract GPS coordinates
    if (gps && gps.latitude !== undefined && gps.longitude !== undefined) {
      result.latitude = gps.latitude;
      result.longitude = gps.longitude;
    }

    if (!exif) {
      return result;
    }

    // Extract capture date
    if (exif.DateTimeOriginal) {
      result.capturedAt = new Date(exif.DateTimeOriginal);
    } else if (exif.CreateDate) {
      result.capturedAt = new Date(exif.CreateDate);
    }

    // Extract camera info
    if (exif.Make) {
      result.cameraMake = exif.Make;
    }
    if (exif.Model) {
      result.cameraModel = exif.Model;
    }
    if (exif.Orientation) {
      result.orientation = exif.Orientation;
    }

    return result;
  } catch (error) {
    console.error('EXIF extraction error:', error);
    return {};
  }
}

export async function extractGps(filePath: string): Promise<{ latitude?: number; longitude?: number }> {
  try {
    const gps = await exifr.gps(filePath);
    if (gps) {
      return {
        latitude: gps.latitude,
        longitude: gps.longitude,
      };
    }
    return {};
  } catch {
    return {};
  }
}
