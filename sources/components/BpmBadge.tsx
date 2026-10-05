import type { BpmConfidence } from '../audio/types';
import type { BpmRelation } from '../audio/bpm';
import { formatBpm } from '../audio/bpm';

interface BpmBadgeProps {
  bpm?: number | null;
  confidence?: BpmConfidence | null;
  analyzing?: boolean;
  relation?: BpmRelation | null;
}

export function BpmBadge({ bpm, confidence, analyzing, relation }: BpmBadgeProps) {
  if (analyzing) {
    return (
      <span className="bpm-badge bpm-badge--analyzing" role="status">
        Analyzing BPM…
      </span>
    );
  }
  if (!bpm) {
    return null;
  }

  const label = formatBpm(bpm, confidence);
  let className = 'bpm-badge';
  let title: string | undefined;
  let relationLabel: string | undefined;

  if (relation === 'mismatch') {
    className += ' bpm-badge--mismatch';
    title = 'Layer tempo may not match main track';
    relationLabel = 'mismatch';
  } else if (relation === 'halfDouble') {
    className += ' bpm-badge--halfdouble';
    title = 'Half/double tempo relation detected';
    relationLabel = 'half/double';
  }

  return (
    <span className={className} title={title} aria-label={title ? `${label}. ${title}` : label}>
      {label}
      {relationLabel && <span className="bpm-relation"> · {relationLabel}</span>}
    </span>
  );
}
