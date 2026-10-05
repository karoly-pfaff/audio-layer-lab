import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Knob, Slider, ToggleButton } from './MixerControls';

function preparePointerKnob(knob: HTMLElement): void {
  vi.stubGlobal('PointerEvent', MouseEvent);
  knob.setPointerCapture = vi.fn();
  vi.spyOn(knob, 'getBoundingClientRect').mockReturnValue({
    bottom: 32,
    height: 32,
    left: 0,
    right: 32,
    top: 0,
    width: 32,
    x: 0,
    y: 0,
    toJSON: vi.fn(),
  });
}

describe('Slider', () => {
  it('formats decibels, pan, percentages, and accessible labels', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Slider label="Volume" value={0} unit="dB" onChange={onChange} />);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '-∞');
    rerender(<Slider label="Volume" value={0.5} unit="dB" onChange={onChange} />);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '-6.0 dB');
    rerender(<Slider label="Pan" value={0} unit="L/R" onChange={onChange} />);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'C');
    rerender(<Slider label="Pan" value={-0.4} unit="L/R" onChange={onChange} />);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'L40');
    rerender(<Slider label="Pan" value={0.25} unit="L/R" onChange={onChange} />);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'R25');
    rerender(
      <Slider
        label="Mix"
        value={0.7}
        onChange={onChange}
        showLabel={false}
        accessibleLabel="Custom mix"
      />,
    );
    expect(screen.getByRole('slider', { name: 'Custom mix' })).toHaveAttribute(
      'aria-valuetext',
      '70%',
    );
    expect(screen.queryByText('Mix')).toBeNull();
    fireEvent.change(screen.getByRole('slider'), { target: { value: '0.35' } });
    expect(onChange).toHaveBeenLastCalledWith(0.35);
  });

  it('falls back to the value when no label is supplied', () => {
    render(<Slider label="" value={0.25} onChange={vi.fn()} />);
    expect(screen.getByRole('slider', { name: '25%' })).toBeInTheDocument();
  });
});

describe('Knob', () => {
  it('exposes its real numeric range and supports arrow keys', () => {
    const onChange = vi.fn();
    render(<Knob label="Pan" value={0} min={-1} max={1} step={0.1} onChange={onChange} />);
    const knob = screen.getByRole('slider', { name: /Pan/ });
    expect(knob).toHaveAttribute('tabindex', '0');
    expect(knob).toHaveAttribute('aria-valuemin', '-1');
    expect(knob).toHaveAttribute('aria-valuemax', '1');
    fireEvent.keyDown(knob, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith(0.1);
  });

  it('supports Home, End, and centered reset', () => {
    const onChange = vi.fn();
    render(<Knob label="Pan" value={0.4} onChange={onChange} />);
    const knob = screen.getByRole('slider', { name: /Pan/ });
    fireEvent.keyDown(knob, { key: 'Home' });
    fireEvent.keyDown(knob, { key: 'End' });
    fireEvent.doubleClick(knob);
    expect(onChange.mock.calls.map(([value]) => value)).toEqual([-1, 1, 0]);
  });

  it('supports every keyboard direction, clamps at limits, and ignores unrelated keys', () => {
    const onChange = vi.fn();
    render(<Knob label="Pan" value={1} step={0.1} onChange={onChange} />);
    const knob = screen.getByRole('slider', { name: /Pan/ });
    fireEvent.keyDown(knob, { key: 'ArrowUp' });
    fireEvent.keyDown(knob, { key: 'ArrowDown' });
    fireEvent.keyDown(knob, { key: 'ArrowLeft' });
    fireEvent.keyDown(knob, { key: 'PageDown' });
    expect(onChange.mock.calls.map(([value]) => value)).toEqual([1, 0.9, 0.9]);
  });

  it('formats negative and positive values for pan and generic units', () => {
    const { rerender } = render(<Knob label="Pan" value={-0.25} onChange={vi.fn()} />);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'L25');
    rerender(<Knob label="Pan" value={0.25} onChange={vi.fn()} />);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'R25');
    rerender(
      <Knob
        label="Wet"
        value={0.25}
        unit="percent"
        accessibleLabel="Wet amount"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('slider', { name: 'Wet amount' })).toHaveAttribute(
      'aria-valuetext',
      '25%',
    );
  });

  it('supports absolute single-pointer adjustment without dragging', () => {
    const onChange = vi.fn();
    render(<Knob label="Pan" value={0} onChange={onChange} />);
    const knob = screen.getByRole('slider', { name: /Pan/ });
    preparePointerKnob(knob);

    fireEvent.pointerDown(knob, { clientX: 27, clientY: 16, pointerId: 1 });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toBeGreaterThan(0);
  });

  it('supports fine pointer dragging and stops after release, cancel, or blur', () => {
    const onChange = vi.fn();
    render(<Knob label="Pan" value={0} step={0.1} onChange={onChange} />);
    const knob = screen.getByRole('slider', { name: /Pan/ });
    preparePointerKnob(knob);

    fireEvent.pointerMove(knob, { clientY: 0, buttons: 1 });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.pointerDown(knob, { clientX: 16, clientY: 16, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.pointerMove(knob, { clientY: 4, buttons: 0 });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.pointerMove(knob, { clientY: 4, buttons: 1 });
    expect(onChange).toHaveBeenLastCalledWith(0.2);
    fireEvent.pointerUp(knob);
    fireEvent.pointerMove(knob, { clientY: 0, buttons: 1 });
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(knob, { clientX: 16, clientY: 16, pointerId: 2 });
    fireEvent.pointerCancel(knob);
    fireEvent.blur(knob);
  });

  it('normalizes wrapped pointer angles and clamps absolute adjustments', () => {
    const onChange = vi.fn();
    render(<Knob label="Pan" value={0} step={0.1} onChange={onChange} />);
    const knob = screen.getByRole('slider', { name: /Pan/ });
    preparePointerKnob(knob);
    fireEvent.pointerDown(knob, { clientX: 5, clientY: 27, pointerId: 1 });
    fireEvent.pointerDown(knob, { clientX: 16, clientY: 0, pointerId: 2 });
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls.every(([value]) => value >= -1 && value <= 1)).toBe(true);
  });
});

describe('ToggleButton', () => {
  it('renders active variants and forwards clicks', () => {
    const onClick = vi.fn();
    render(<ToggleButton label="M" active onClick={onClick} variant="mute" ariaLabel="Mute" />);
    const button = screen.getByRole('button', { name: 'Mute' });
    expect(button).toHaveClass('toggle-btn--mute', 'toggle-btn--active');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
