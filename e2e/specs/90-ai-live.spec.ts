import { test, expect } from '@playwright/test';

/**
 * @ai-live
 * @blocking false
 * 
 * AI Live test — requires ALLOW_LIVE_AI_TEST=true and E2E_AI_MODE=live
 * This test is manual and does not enter automatic release gate.
 * 
 * Test ID: e2e:ai-live-recognition
 * Layer: e2e
 * Tags: ai-live
 * Execution Policy: manual
 * Execution Nodes: []
 */

test.describe('AI Live Recognition @ai-live', () => {
  test('should perform AI garment recognition (requires live MiniMax)', async ({ page }) => {
    // 1. Log in
    // 2. Navigate to intake page
    // 3. Upload a test garment image
    // 4. Trigger AI recognition
    // 5. Verify AI-generated label candidates
    // 6. Verify no error state from MiniMax API
    
    test.skip(true, 'AI live test requires manual execution with ALLOW_LIVE_AI_TEST=true');
  });

  test('should generate outfit recommendations with AI (requires live MiniMax)', async ({ page }) => {
    test.skip(true, 'AI live test requires manual execution with ALLOW_LIVE_AI_TEST=true');
  });
});
