import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

describe('component:app-sub-page-top-bar', () => {
  it('should render title', () => {
    render(React.createElement('div', { 'data-testid': 'top-bar' },
      React.createElement('button', { 'data-testid': 'back-btn' }, '‹'),
      React.createElement('h1', { 'data-testid': 'title' }, '衣物详情')
    ));
    expect(screen.getByTestId('title').textContent).toBe('衣物详情');
    expect(screen.getByTestId('back-btn').textContent).toBe('‹');
  });

  it('should render save button when provided', () => {
    render(React.createElement('div', { 'data-testid': 'top-bar' },
      React.createElement('button', { 'data-testid': 'back-btn' }, '‹'),
      React.createElement('h1', null, '编辑'),
      React.createElement('button', { 
        'data-testid': 'save-btn',
        style: { background: '#007AFF', color: 'white' }
      }, '保存')
    ));
    const saveBtn = screen.getByTestId('save-btn');
    expect(saveBtn.textContent).toBe('保存');
    expect(saveBtn.style.background).toBe('rgb(0, 122, 255)');
  });
});
