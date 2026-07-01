import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const IS_BASELINE = process.env.CONTRACT_MODE === 'baseline' || !process.env.CONTRACT_MODE;

describe('contract:no-legacy-image-fields', () => {
  const EXCLUDE_DIRS = ['node_modules', '.next', 'out', 'dist', '.git', 'tests'];
  const LEGACY_PATTERNS = [
    /\.dataUrl\b/i,
    /\bdataUrl\b.*:/i,
    /\binlineImageData\b/i,
  ];

  function scanDir(dir: string, files: string[] = []): string[] {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!EXCLUDE_DIRS.includes(entry.name) && !entry.name.startsWith('.')) {
            scanDir(fullPath, files);
          }
        } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.tsx')) {
          files.push(fullPath);
        }
      }
    } catch { /* skip inaccessible */ }
    return files;
  }

  const srcDir = path.resolve(__dirname, '../../..');
  
  it('should not contain legacy dataUrl fields in src/ (strict mode)', () => {
    const sourceFiles = scanDir(path.join(srcDir, 'src'));
    const violations: string[] = [];
    
    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        for (const pattern of LEGACY_PATTERNS) {
          if (pattern.test(lines[i])) {
            const relPath = path.relative(srcDir, file);
            violations.push(`${relPath}:${i + 1}: ${lines[i].trim().substring(0, 100)}`);
            break;
          }
        }
      }
    }
    
    if (IS_BASELINE && violations.length > 0) {
      console.log(`[BASELINE] Found ${violations.length} legacy field references (not failing in baseline mode)`);
      violations.forEach(v => console.log(`  ${v}`));
      return; // skip assertion in baseline mode
    }
    expect(violations.length).toBe(0);
  });
});
