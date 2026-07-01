#!/usr/bin/env node
const ALLOW_LIVE_AI_TEST = process.env.ALLOW_LIVE_AI_TEST;
const E2E_AI_MODE = process.env.E2E_AI_MODE;

if (ALLOW_LIVE_AI_TEST !== 'true' || E2E_AI_MODE !== 'live') {
  console.error('ERROR: AI live tests require ALLOW_LIVE_AI_TEST=true and E2E_AI_MODE=live');
  console.error('This protects against accidental MiniMax API usage during CI.');
  process.exit(1);
}
console.log('AI live test flags verified - OK');
