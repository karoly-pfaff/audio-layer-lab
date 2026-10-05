import { useId, useRef } from 'react';

interface SliderProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  unit?: string;
  className?: string;
  showLabel?: boolean;
  accessibleLabel?: string;
}

export function Slider({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  unit = '',
  className = '',
  showLabel = true,
  accessibleLabel,
}: SliderProps) {
  const inputId = useId();
  const displayVal =
    unit === 'dB'
      ? value === 0
        ? '-∞'
        : (20 * Math.log10(value)).toFixed(1) + ' dB'
      : unit === 'L/R'
        ? value === 0
          ? 'C'
          : value < 0
            ? `L${Math.abs(Math.round(value * 100))}`
            : `R${Math.round(value * 100)}`
        : Math.round(value * 100) + '%';

  return (
    <div className={`slider-group ${className}`}>
      <label className="slider-label" htmlFor={inputId}>
        {showLabel && <span className="slider-label-text">{label}</span>}
        <span className="slider-value">{displayVal}</span>
      </label>
      <input
        type="range"
        id={inputId}
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={accessibleLabel ?? (label ? `${label} (${displayVal})` : displayVal)}
        aria-valuetext={displayVal}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

interface ToggleButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
  variant?: 'mute' | 'solo' | 'loop' | 'default';
  title?: string;
  ariaLabel?: string;
}

interface KnobProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  unit?: string;
  className?: string;
  accessibleLabel?: string;
}

export function Knob({
  label,
  value,
  min = -1,
  max = 1,
  step = 0.01,
  onChange,
  unit = 'L/R',
  className = '',
  accessibleLabel,
}: KnobProps) {
  const drag = useRef<{ startY: number; startVal: number } | null>(null);

  const displayVal =
    unit === 'L/R'
      ? value === 0
        ? 'C'
        : value < 0
          ? `L${Math.abs(Math.round(value * 100))}`
          : `R${Math.round(value * 100)}`
      : `${Math.round(value * 100)}%`;

  const SIZE = 32;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const R = 11;
  const MIN_ANGLE = -135;
  const MAX_ANGLE = 135;

  function valToAngle(v: number) {
    return ((v - min) / (max - min)) * (MAX_ANGLE - MIN_ANGLE) + MIN_ANGLE;
  }

  function polar(angleDeg: number, r: number): [number, number] {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
  }

  const [tx1, ty1] = polar(MIN_ANGLE, R);
  const [tx2, ty2] = polar(MAX_ANGLE, R);
  const trackD = `M ${tx1.toFixed(2)} ${ty1.toFixed(2)} A ${R} ${R} 0 1 1 ${tx2.toFixed(2)} ${ty2.toFixed(2)}`;

  const curAngle = valToAngle(value);
  const [ax1, ay1] = polar(0, R);
  const [ax2, ay2] = polar(curAngle, R);
  const activeD = `M ${ax1.toFixed(2)} ${ay1.toFixed(2)} A ${R} ${R} 0 0 ${value >= 0 ? 1 : 0} ${ax2.toFixed(2)} ${ay2.toFixed(2)}`;
  const [dotX, dotY] = polar(curAngle, R);

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = SIZE / rect.width;
    const scaleY = SIZE / rect.height;
    const x = (e.clientX - rect.left) * scaleX - CX;
    const y = (e.clientY - rect.top) * scaleY - CY;
    let startVal = value;

    // A single click sets an absolute value; dragging vertically remains available
    // for fine adjustment. This is the non-dragging pointer alternative required by WCAG 2.5.7.
    if (Math.hypot(x, y) > 4) {
      const pointerAngle = (Math.atan2(y, x) * 180) / Math.PI + 90;
      const normalizedAngle = pointerAngle > 180 ? pointerAngle - 360 : pointerAngle;
      const clampedAngle = Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, normalizedAngle));
      const absoluteValue =
        min + ((clampedAngle - MIN_ANGLE) / (MAX_ANGLE - MIN_ANGLE)) * (max - min);
      startVal = Math.max(min, Math.min(max, Math.round(absoluteValue / step) * step));
      onChange(Number(startVal.toFixed(10)));
    }

    drag.current = { startY: e.clientY, startVal };
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!drag.current || e.buttons !== 1) {
      return;
    }
    const delta = ((drag.current.startY - e.clientY) * (max - min)) / 120;
    const snapped = Math.round((drag.current.startVal + delta) / step) * step;
    onChange(Math.max(min, Math.min(max, snapped)));
  }

  function handlePointerUp() {
    drag.current = null;
  }

  function handleKeyDown(e: React.KeyboardEvent<SVGSVGElement>) {
    let nextValue: number | null = null;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      nextValue = value + step;
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      nextValue = value - step;
    } else if (e.key === 'Home') {
      nextValue = min;
    } else if (e.key === 'End') {
      nextValue = max;
    }
    if (nextValue !== null) {
      e.preventDefault();
      onChange(Math.max(min, Math.min(max, Number(nextValue.toFixed(10)))));
    }
  }

  return (
    <div className={`knob-group ${className}`}>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="knob"
        role="slider"
        tabIndex={0}
        aria-label={accessibleLabel ?? `${label} (${displayVal})`}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={displayVal}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onBlur={handlePointerUp}
        onKeyDown={handleKeyDown}
        onDoubleClick={() => onChange(Math.max(min, Math.min(max, 0)))}
      >
        <path
          d={trackD}
          fill="none"
          stroke="var(--border-soft)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        {value !== 0 && (
          <path
            d={activeD}
            fill="none"
            stroke="var(--accent-blue)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        )}
        <circle cx={dotX.toFixed(2)} cy={dotY.toFixed(2)} r="2.5" fill="var(--text-primary)" />
        <text x={CX} y={CY} className="knob-value-text">
          {displayVal}
        </text>
      </svg>
    </div>
  );
}

export function ToggleButton({
  label,
  active,
  onClick,
  variant = 'default',
  title,
  ariaLabel,
}: ToggleButtonProps) {
  return (
    <button
      className={`toggle-btn toggle-btn--${variant}${active ? ' toggle-btn--active' : ''}`}
      onClick={onClick}
      type="button"
      aria-pressed={active}
      aria-label={ariaLabel}
      title={title}
    >
      {label}
    </button>
  );
}
