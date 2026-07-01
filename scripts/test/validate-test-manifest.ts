import {
  TestEntry, TestLayer, ManifestValidationResult
} from '../../tests/manifest/test-types';
import { testManifest } from '../../tests/manifest/test-manifest';

const ALL_LAYERS: TestLayer[] = [
  'contract', 'unit', 'component', 'integration', 'api',
  'e2e', 'android', 'vendor-device', 'postrelease'
];

export function validateManifest(entries: TestEntry[] = testManifest): ManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check each layer has at least an empty fragment registered
  const foundLayers = new Set(entries.map(e => e.layer));
  for (const layer of ALL_LAYERS) {
    if (!foundLayers.has(layer)) {
      warnings.push(`No entries found for layer: ${layer}`);
    }
  }

  // Check for duplicate testIds
  const seenIds = new Map<string, number>();
  for (const entry of entries) {
    const count = (seenIds.get(entry.testId) || 0) + 1;
    seenIds.set(entry.testId, count);
  }
  for (const [id, count] of seenIds) {
    if (count > 1) {
      errors.push(`Duplicate testId: ${id} (appears ${count} times)`);
    }
  }

  // Check for duplicate filePaths
  const seenPaths = new Map<string, number>();
  for (const entry of entries) {
    const count = (seenPaths.get(entry.filePath) || 0) + 1;
    seenPaths.set(entry.filePath, count);
  }
  for (const [fp, count] of seenPaths) {
    if (count > 1) {
      errors.push(`Duplicate filePath: ${fp} (appears ${count} times across fragments)`);
    }
  }

  // Check UNCLASSIFIED count
  const unclassifiedCount = entries.filter(e => e.mappingStatus === 'UNCLASSIFIED').length;
  if (unclassifiedCount > 0) {
    warnings.push(`${unclassifiedCount} entries have mappingStatus UNCLASSIFIED`);
  }

  // Check blocking tests have required metadata
  for (const entry of entries) {
    if (entry.blocking) {
      if (!entry.inputDescription) {
        errors.push(`Blocking test ${entry.testId} missing inputDescription`);
      }
      if (!entry.expectedOutput) {
        errors.push(`Blocking test ${entry.testId} missing expectedOutput`);
      }
      if (!entry.expectedEvidence) {
        errors.push(`Blocking test ${entry.testId} missing expectedEvidence`);
      }
    }
    // manual tests must not enter automated release gate
    if (entry.executionPolicy === 'manual' && entry.blocking) {
      warnings.push(`Manual test ${entry.testId} is marked blocking - cannot enter automated gate`);
    }
    // scheduled tests must have executionNodes
    if (entry.executionPolicy === 'scheduled' && (!entry.executionNodes || entry.executionNodes.length === 0)) {
      errors.push(`Scheduled test ${entry.testId} has no executionNodes`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// CLI entry point
if (require.main === module) {
  const result = validateManifest();
  console.log(`Valid: ${result.valid}`);
  result.errors.forEach(e => console.log(`  ERROR: ${e}`));
  result.warnings.forEach(w => console.log(`  WARN: ${w}`));
  process.exit(result.valid ? 0 : 1);
}
