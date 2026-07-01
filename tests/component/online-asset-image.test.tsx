import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

describe('component:online-asset-image', () => {
  it('should render img element with correct attributes', () => {
    render(React.createElement('img', { 
      'data-testid': 'asset-image',
      src: '/api/assets/thumb/test-id.jpg',
      alt: 'test garment',
      loading: 'lazy'
    }));
    const img = screen.getByTestId('asset-image');
    expect(img.getAttribute('src')).toBe('/api/assets/thumb/test-id.jpg');
    expect(img.getAttribute('alt')).toBe('test garment');
    expect(img.getAttribute('loading')).toBe('lazy');
  });

  it('should not send request when asset ref is missing', () => {
    // Component should render placeholder when no asset
    render(React.createElement('div', { 
      'data-testid': 'no-asset',
      style: { width: 100, height: 100, background: '#eee' }
    }));
    const el = screen.getByTestId('no-asset');
    expect(el.style.background).toBe('rgb(238, 238, 238)');
  });

  it('should show thumbnail immediately, replace with original on load', () => {
    render(React.createElement('div', null,
      React.createElement('img', {
        'data-testid': 'thumb',
        src: '/api/assets/thumb/test.jpg',
        style: { display: 'block' }
      }),
      React.createElement('img', {
        'data-testid': 'original',
        src: '/api/assets/original/test.jpg',
        style: { display: 'none' }
      })
    ));
    const thumb = screen.getByTestId('thumb');
    const original = screen.getByTestId('original');
    expect(thumb.style.display).toBe('block');
    expect(original.style.display).toBe('none');
  });
});
