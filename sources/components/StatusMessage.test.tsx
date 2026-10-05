import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StatusMessage } from './StatusMessage';

const storeMock = vi.hoisted(() => ({ dismissStatus: vi.fn() }));

vi.mock('../store/useAudioLabStore', () => ({
  useAudioLabStore: () => ({
    statusMessage: 'Snapshot saved',
    dismissStatus: storeMock.dismissStatus,
  }),
}));

describe('StatusMessage', () => {
  it('announces a persistent message and offers an explicit dismiss action', () => {
    render(<StatusMessage />);
    expect(screen.getByRole('status')).toHaveTextContent('Snapshot saved');

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));

    expect(storeMock.dismissStatus).toHaveBeenCalledTimes(1);
  });
});
