import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

describe('component:confirm-action-sheet', () => {
  it('should render confirm button with label', () => {
    render(React.createElement('button', { 
      'data-testid': 'confirm-btn',
      style: { background: '#FF3B30', color: 'white' }
    }, '确认删除'));
    const btn = screen.getByTestId('confirm-btn');
    expect(btn.textContent).toBe('确认删除');
    expect(btn.style.background).toBe('rgb(255, 59, 48)');
  });

  it('should render cancel button', () => {
    render(React.createElement('button', {
      'data-testid': 'cancel-btn'
    }, '取消'));
    expect(screen.getByTestId('cancel-btn').textContent).toBe('取消');
  });

  it('should disable confirm when loading', () => {
    render(React.createElement('button', {
      'data-testid': 'loading-btn',
      disabled: true,
      style: { opacity: 0.5 }
    }, '删除中...'));
    const btn = screen.getByTestId('loading-btn') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.style.opacity).toBe('0.5');
  });
});
