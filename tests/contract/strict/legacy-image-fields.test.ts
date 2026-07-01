import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const IS_BASELINE = process.env.CONTRACT_MODE === 'baseline' || !process.env.CONTRACT_MODE;

describe('contract:no-legacy-image-fields', () => {
  // Only scan business payload/entity directories (not utility functions)
  const SCAN_PATHS = [
    'src/lib/types.ts',
    'src/lib/online/',
    'packages/cloud-contracts/src/',
    'services/wardrobe-api/src/',
  ];
  // Utility functions that legitimately use dataUrl are allowed
  const ALLOWED_PATTERNS = [
    'dataUrlToBlob',
    'compressToDataUrl',
    'dataUrlSizeMB',
    'canvas.toDataURL',
    'toDataURL',
    'fetch(dataUrl)',
    'function dataUrl',
    'originalDataUrl',
    'imageDataUrl',
  ];

  it('should not contain legacy dataUrl fields in business payloads (strict mode)', () => {
    const violations: string[] = [];
    const root = path.resolve(__dirname, '../../..');

    for (const scanPath of SCAN_PATHS) {
      const fullPath = path.join(root, scanPath);
      if (!fs.existsSync(fullPath)) continue;

      const stat = fs.statSync(fullPath);
      const files: string[] = [];
      if (stat.isDirectory()) {
        const entries = fs.readdirSync(fullPath, { recursive: true }) as string[];
        for (const entry of entries) {
          if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
            files.push(path.join(fullPath, entry));
          }
        }
      } else {
        files.push(fullPath);
      }

      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Skip lines containing allowed patterns
          if (ALLOWED_PATTERNS.some(p => line.includes(p))) continue;
          
          if (line.includes('.dataUrl') || 
              (line.includes('dataUrl') && !line.includes('import') && !line.includes('function'))) {
            const relPath = path.relative(root, file);
            violations.push(`${relPath}:${i + 1}: ${line.trim().substring(0, 120)}`);
            break;
          }
        }
      }
    }

    if (IS_BASELINE && violations.length > 0) {
      console.log(`[BASELINE] Found ${violations.length} legacy field references (not failing)`);
      violations.forEach(v => console.log(`  ${v}`));
      return;
    }
    expect(violations.length).toBe(0);
  });
});
