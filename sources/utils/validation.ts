export function clampFinite(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

export function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

export function parseBpm(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 20 && value <= 400
    ? value
    : null;
}

export function parseAssetId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  return /^(?:sha256-[a-f0-9]{64}|random-[a-zA-Z0-9-]{8,80})$/.test(value) ? value : null;
}

export function uniqueId(raw: unknown, fallback: string, used: Set<string>): string {
  const base = boundedString(raw, 80) ?? fallback;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}
