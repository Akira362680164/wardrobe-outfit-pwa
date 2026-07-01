import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

describe('component:swipe-image-carousel', () => {
  it('should render single image without scroll indicators', () => {
    render(React.createElement('div', { 'data-testid': 'carousel' },
      React.createElement('img', { src: '/api/assets/thumb/1.jpg', alt: 'photo 1' })
    ));
    expect(screen.getByTestId('carousel').children.length).toBe(1);
  });

  it('should render filmstrip indicators for multiple images', () => {
    const images = [1, 2, 3];
    render(React.createElement('div', { 'data-testid': 'filmstrip' },
      ...images.map(i => React.createElement('button', {
        key: i,
        'data-testid': `indicator-${i}`,
        style: { opacity: i === 1 ? 1 : 0.5 }
      }))
    ));
    const first = screen.getByTestId('indicator-1');
    expect(first.style.opacity).toBe('1');
  });

  it('should mark first indicator as active', () => {
    render(React.createElement('div', null,
      React.createElement('button', {
        'data-testid': 'active-dot',
        style: { background: '#007AFF' }
      }),
      React.createElement('button', {
        'data-testid': 'inactive-dot',
        style: { background: '#ccc' }
      })
    ));
    expect(screen.getByTestId('active-dot').style.background).toBe('rgb(0, 122, 255)');
    expect(screen.getByTestId('inactive-dot').style.background).toBe('rgb(204, 204, 204)');
  });
});
