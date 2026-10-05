import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KeyboardHelp } from './KeyboardHelp';

describe('KeyboardHelp', () => {
  it('moves focus into the modal dialog and restores it when closed', () => {
    render(<KeyboardHelp />);
    const button = screen.getByRole('button', { name: 'Keyboard shortcuts' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    const closeButton = screen.getByRole('button', { name: 'Close keyboard shortcuts' });
    expect(closeButton).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(closeButton).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(button).toHaveFocus();
  });

  it('closes from both the backdrop and close button', () => {
    const { container } = render(<KeyboardHelp />);
    const trigger = screen.getByRole('button', { name: 'Keyboard shortcuts' });
    fireEvent.click(trigger);
    fireEvent.click(container.querySelector('.kb-help-backdrop')!);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Close keyboard shortcuts' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
