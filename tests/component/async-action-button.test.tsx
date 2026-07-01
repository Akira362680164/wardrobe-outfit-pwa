import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

describe('component:test-button', () => {
  it('should render dom with react', () => {
    const { container } = render(React.createElement('div', { 'data-testid': 'root' }, 'Hello'));
    expect(container.textContent).toBe('Hello');
  });

  it('should handle button rendering', () => {
    const { container } = render(
      React.createElement('button', { disabled: true, 'data-testid': 'btn' }, 'Save')
    );
    const btn = container.querySelector('button') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn?.disabled).toBe(true);
    expect(btn?.textContent).toBe('Save');
  });

  it('should handle test-id query with screen', () => {
    render(React.createElement('span', { 'data-testid': 'label' }, 'Hello World'));
    expect(screen.getByTestId('label').textContent).toBe('Hello World');
  });
});
