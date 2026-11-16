import { calculateCapacityBytes, flattenPixels } from './steganography';

export const MAX_CARRIER_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_IMAGE_DIMENSION = 16_384; // 16K max dimension
export const MAX_IMAGE_PIXELS = 24_000_000; // ~24 MP safety cap for browser Canvas memory
export const LARGE_IMAGE_WARNING_PIXELS = 8_000_000; // >8 MP notice
export const ACCEPTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export type ImageFormat = 'png' | 'jpeg' | 'webp';

export interface LoadedImage {
  name: string;
  mimeType: string;
  format: ImageFormat;
  width: number;
  height: number;
  pixelCount: number;
  capacityBytes: number;
  fileSizeBytes: number;
  previewUrl: string;
  originalPixels: Uint8ClampedArray;
  flattenedPixels: Uint8ClampedArray;
  hasTransparency: boolean;
  isLargeImage: boolean;
  isLossySource: boolean;
}

export class ImageLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageLoadError';
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes.toLocaleString()} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Validates actual binary magic bytes of an image file to prevent MIME-spoofing attacks.
 */
export async function detectAndValidateImageFormat(
  fileOrBytes: File | Blob | Uint8Array
): Promise<ImageFormat> {
  let header: Uint8Array;
  if (fileOrBytes instanceof Uint8Array) {
    header = fileOrBytes.subarray(0, 16);
  } else {
    const slice = fileOrBytes.slice(0, 16);
    const buf = await slice.arrayBuffer();
    header = new Uint8Array(buf);
  }

  if (header.length < 4) {
    throw new ImageLoadError('The selected file is too small to be a valid image.');
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    header.length >= 8 &&
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47 &&
    header[4] === 0x0d &&
    header[5] === 0x0a &&
    header[6] === 0x1a &&
    header[7] === 0x0a
  ) {
    return 'png';
  }

  // JPEG: FF D8 FF
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return 'jpeg';
  }

  // WebP: 'RIFF' .... 'WEBP'
  if (
    header.length >= 12 &&
    header[0] === 0x52 && // R
    header[1] === 0x49 && // I
    header[2] === 0x46 && // F
    header[3] === 0x46 && // F
    header[8] === 0x57 && // W
    header[9] === 0x45 && // E
    header[10] === 0x42 && // B
    header[11] === 0x50 // P
  ) {
    return 'webp';
  }

  throw new ImageLoadError(
    'Unsupported or disguised file format. Ghostpix requires a genuine PNG, JPEG, or WebP image.'
  );
}

/**
 * Validates file size, file extensions, and basic attributes.
 */
export function validateImageFile(
  file: File,
  maxSizeBytes = MAX_CARRIER_FILE_SIZE_BYTES
): void {
  if (file.size === 0) {
    throw new ImageLoadError('The selected file is empty (0 bytes).');
  }

  if (file.size > maxSizeBytes) {
    throw new ImageLoadError(
      `File size (${formatBytes(file.size)}) exceeds the maximum allowed limit of ${formatBytes(
        maxSizeBytes
      )}.`
    );
  }

  const lower = file.name.toLowerCase();
  const extOk =
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.webp');

  const typeOk = (ACCEPTED_MIME_TYPES as readonly string[]).includes(file.type);

  if (!typeOk && !extOk) {
    throw new ImageLoadError(
      `Unsupported file "${file.name}". Please choose a PNG, JPG, or WebP image.`
    );
  }
}

function decodeHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new ImageLoadError('Could not decode this image. The file may be corrupted or malformed.'));
    img.src = src;
  });
}

async function processDecodedImage(
  img: HTMLImageElement,
  sourceBlob: Blob,
  name: string,
  format: ImageFormat,
  fileSizeBytes: number
): Promise<LoadedImage> {
  const width = img.naturalWidth;
  const height = img.naturalHeight;

  if (!width || !height || width <= 0 || height <= 0) {
    throw new ImageLoadError('Image dimensions are invalid (0x0).');
  }

  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    throw new ImageLoadError(
      `Image dimension ${width}×${height} exceeds the maximum supported dimension limit of ${MAX_IMAGE_DIMENSION}px.`
    );
  }

  const pixelCount = width * height;
  if (pixelCount > MAX_IMAGE_PIXELS) {
    throw new ImageLoadError(
      `This image is ${width}×${height} (${(pixelCount / 1_000_000).toFixed(
        1
      )} MP), which exceeds the 24 MP browser canvas limit. Please use a smaller image.`
    );
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new ImageLoadError('Browser Canvas 2D context is unavailable.');
  }

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, width, height);
  const originalPixels = new Uint8ClampedArray(imageData.data);

  let hasTransparency = false;
  for (let i = 3; i < originalPixels.length; i += 4) {
    if (originalPixels[i] < 255) {
      hasTransparency = true;
      break;
    }
  }

  const flattened = hasTransparency
    ? flattenPixels(originalPixels)
    : new Uint8ClampedArray(originalPixels);

  let previewUrl: string;
  if (hasTransparency) {
    ctx.putImageData(new ImageData(new Uint8ClampedArray(flattened), width, height), 0, 0);
    const previewBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new ImageLoadError('Failed to prepare image preview.'));
      }, 'image/png');
    });
    previewUrl = URL.createObjectURL(previewBlob);
  } else {
    previewUrl = URL.createObjectURL(sourceBlob);
  }

  const mimeType = format === 'png' ? 'image/png' : format === 'jpeg' ? 'image/jpeg' : 'image/webp';

  return {
    name,
    mimeType,
    format,
    width,
    height,
    pixelCount,
    capacityBytes: calculateCapacityBytes(pixelCount, 2),
    fileSizeBytes,
    previewUrl,
    originalPixels,
    flattenedPixels: flattened,
    hasTransparency,
    isLargeImage: pixelCount >= LARGE_IMAGE_WARNING_PIXELS,
    isLossySource: format === 'jpeg' || format === 'webp',
  };
}

export async function loadImageFromFile(file: File): Promise<LoadedImage> {
  validateImageFile(file, MAX_CARRIER_FILE_SIZE_BYTES);
  const detectedFormat = await detectAndValidateImageFormat(file);

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await decodeHtmlImage(objectUrl);
    return await processDecodedImage(
      img,
      file,
      file.name,
      detectedFormat,
      file.size
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function loadImageFromUrl(url: string, displayName: string): Promise<LoadedImage> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new ImageLoadError('Failed to load sample image.');
  }
  const blob = await response.blob();
  if (blob.size > MAX_CARRIER_FILE_SIZE_BYTES) {
    throw new ImageLoadError('Sample image exceeds maximum carrier file size.');
  }

  const detectedFormat = await detectAndValidateImageFormat(blob);
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await decodeHtmlImage(objectUrl);
    return await processDecodedImage(
      img,
      blob,
      displayName,
      detectedFormat,
      blob.size
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function pixelsToLosslessPng(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): Promise<{ blob: Blob; objectUrl: string }> {
  if (width <= 0 || height <= 0 || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    throw new ImageLoadError('Invalid dimensions for PNG export.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new ImageLoadError('Browser Canvas 2D context is unavailable.');
  }

  const imageData = new ImageData(new Uint8ClampedArray(pixels), width, height);
  ctx.putImageData(imageData, 0, 0);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new ImageLoadError('Canvas PNG serialization failed.'));
    }, 'image/png');
  });

  const objectUrl = URL.createObjectURL(blob);
  return { blob, objectUrl };
}
