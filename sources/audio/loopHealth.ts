import type { LoopHealthIssue } from './types';

const TOO_SHORT_S = 0.3;
const SILENCE_THRESHOLD = 0.005;
const LOUD_BOUNDARY_THRESHOLD = 0.15;
const SILENCE_CHECK_FRACTION = 0.1;

// Inspects the original (unsmoothed) buffer and returns an array of heuristic warnings.
// Returns [] when the buffer looks fine for looping.
export function checkLoopHealth(buffer: AudioBuffer): LoopHealthIssue[] {
  const issues: LoopHealthIssue[] = [];

  if (buffer.duration < TOO_SHORT_S) {
    issues.push('tooShort');
    return issues;
  }

  const data = buffer.getChannelData(0);
  const len = data.length;
  const checkLen = Math.max(1, Math.floor(len * SILENCE_CHECK_FRACTION));

  if (Math.abs(data[0] ?? 0) > LOUD_BOUNDARY_THRESHOLD) {
    issues.push('loudBoundary');
  }

  let leadRms = 0;
  for (let i = 0; i < checkLen; i++) {
    const sample = data[i] ?? 0;
    leadRms += sample * sample;
  }
  if (Math.sqrt(leadRms / checkLen) < SILENCE_THRESHOLD) {
    issues.push('leadingSilence');
  }

  let trailRms = 0;
  for (let i = len - checkLen; i < len; i++) {
    const sample = data[i] ?? 0;
    trailRms += sample * sample;
  }
  if (Math.sqrt(trailRms / checkLen) < SILENCE_THRESHOLD) {
    issues.push('trailingSilence');
  }

  return issues;
}

export function loopHealthLabel(issue: LoopHealthIssue): string {
  switch (issue) {
    case 'tooShort':
      return 'Very short — loop may buzz';
    case 'loudBoundary':
      return 'Hard cut at boundary — may click';
    case 'leadingSilence':
      return 'Leading silence — gap at restart';
    case 'trailingSilence':
      return 'Trailing silence — gap before restart';
  }
}
