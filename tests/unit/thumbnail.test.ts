import { describe, it, expect } from 'vitest';

// Migrated from scripts/test-thumbnail.ts
describe('unit:thumbnail', () => {
  function generateThumbnailSize(originalWidth: number, originalHeight: number, maxDim: number = 300): { width: number; height: number } {
    if (originalWidth <= maxDim && originalHeight <= maxDim) {
      return { width: originalWidth, height: originalHeight };
    }
    const ratio = Math.min(maxDim / originalWidth, maxDim / originalHeight);
    return {
      width: Math.round(originalWidth * ratio),
      height: Math.round(originalHeight * ratio),
    };
  }

  it('should not resize smaller images', () => {
    const result = generateThumbnailSize(200, 150, 300);
    expect(result).toEqual({ width: 200, height: 150 });
  });

  it('should resize wider images to fit max dimension', () => {
    const result = generateThumbnailSize(800, 600, 300);
    expect(result.width).toBe(300);
    expect(result.height).toBe(225);
  });

  it('should resize taller images to fit max dimension', () => {
    const result = generateThumbnailSize(600, 800, 300);
    expect(result.width).toBe(225);
    expect(result.height).toBe(300);
  });

  it('should handle square images', () => {
    const result = generateThumbnailSize(1000, 1000, 300);
    expect(result).toEqual({ width: 300, height: 300 });
  });

  it('should handle zero dimensions gracefully', () => {
    const result = generateThumbnailSize(0, 0, 300);
    expect(result).toEqual({ width: 0, height: 0 });
  });
});
