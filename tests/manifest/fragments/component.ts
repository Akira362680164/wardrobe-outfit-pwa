import { TestEntry } from '../test-types';

export const componentTests: TestEntry[] = [
  { testId: 'component:async-action-button', layer: 'component', filePath: 'tests/component/async-action-button.test.tsx', tags: ['smoke'], blocking: true, inputDescription: 'React button element', expectedOutput: 'Renders, enables, disables', expectedEvidence: '3/3 tests' },
  { testId: 'component:online-asset-image', layer: 'component', filePath: 'tests/component/online-asset-image.test.tsx', tags: ['smoke'], blocking: true, inputDescription: 'Image elements with src/alt', expectedOutput: 'Correct attributes, no request on missing', expectedEvidence: '3/3 tests' },
  { testId: 'component:swipe-image-carousel', layer: 'component', filePath: 'tests/component/swipe-image-carousel.test.tsx', tags: ['smoke'], blocking: true, inputDescription: 'Carousel with 1-3 images', expectedOutput: 'Single image, filmstrip, active dot', expectedEvidence: '3/3 tests' },
  { testId: 'component:confirm-action-sheet', layer: 'component', filePath: 'tests/component/confirm-action-sheet.test.tsx', tags: ['smoke'], blocking: true, inputDescription: 'Confirm/cancel buttons', expectedOutput: 'Labels correct, disables when loading', expectedEvidence: '3/3 tests' },
  { testId: 'component:app-sub-page-top-bar', layer: 'component', filePath: 'tests/component/app-sub-page-top-bar.test.tsx', tags: ['smoke'], blocking: true, inputDescription: 'Top bar with back/title/save', expectedOutput: 'Title renders, save button appears', expectedEvidence: '2/2 tests' },
];
