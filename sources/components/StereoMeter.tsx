import { useEffect, useRef } from 'react';
import { audioEngine } from '../audio/AudioEngine';
import { smoothLevel, clampLevel } from '../audio/meters';
import { useAudioLabStore } from '../store/useAudioLabStore';

const ATTACK = 0.3;
const DECAY = 0.88;

export function StereoMeter() {
  const barLRef = useRef<HTMLDivElement>(null);
  const barRRef = useRef<HTMLDivElement>(null);
  const levelsRef = useRef({ left: 0, right: 0 });
  const playing = useAudioLabStore((s) => s.transport.playing);

  useEffect(() => {
    let active = true;
    let rafId: number;

    function tick() {
      if (!active) {
        return;
      }
      const raw = audioEngine.getStereoLevels();
      const prev = levelsRef.current;
      const sLeft = clampLevel(
        smoothLevel(prev.left, raw.left, raw.left > prev.left ? ATTACK : DECAY),
      );
      const sRight = clampLevel(
        smoothLevel(prev.right, raw.right, raw.right > prev.right ? ATTACK : DECAY),
      );
      levelsRef.current = { left: sLeft, right: sRight };
      if (barLRef.current) {
        barLRef.current.style.width = `${sLeft * 100}%`;
      }
      if (barRRef.current) {
        barRRef.current.style.width = `${sRight * 100}%`;
      }
      if (playing || sLeft > 0.001 || sRight > 0.001) {
        rafId = requestAnimationFrame(tick);
      }
    }

    rafId = requestAnimationFrame(tick);
    return () => {
      active = false;
      cancelAnimationFrame(rafId);
    };
  }, [playing]);

  return (
    <div className="stereo-meter" aria-hidden="true">
      <div className="stereo-meter-row">
        <span className="stereo-meter-label">L</span>
        <div className="stereo-meter-track">
          <div ref={barLRef} className="stereo-meter-bar" />
        </div>
      </div>
      <div className="stereo-meter-row">
        <span className="stereo-meter-label">R</span>
        <div className="stereo-meter-track">
          <div ref={barRRef} className="stereo-meter-bar" />
        </div>
      </div>
    </div>
  );
}
