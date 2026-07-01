import { TestEntry, TestLayer } from '../../tests/manifest/test-types';
import { testManifest } from '../../tests/manifest/test-manifest';

export interface DiscoverOptions {
  layer?: TestLayer;
  tag?: string;
  baseline?: boolean;
}

export function discoverTests(opts: DiscoverOptions = {}): TestEntry[] {
  let entries = testManifest;
  if (opts.layer) {
    entries = entries.filter(e => e.layer === opts.layer);
  }
  if (opts.tag) {
    entries = entries.filter(e => e.tags?.includes(opts.tag));
  }
  if (opts.baseline) {
    // baseline mode: include all regardless of strict requirements
  }
  return entries;
}

// CLI entry point
if (require.main === module) {
  const layer = process.argv[2] as TestLayer | undefined;
  const tag = process.argv[3];
  const baseline = process.argv.includes('--baseline');
  const results = discoverTests({ layer, tag, baseline });
  console.log(JSON.stringify(results.map(r => ({ testId: r.testId, filePath: r.filePath })), null, 2));
}
