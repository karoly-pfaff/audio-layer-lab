import { useEffect, useRef, useState } from 'react';
import { audioEngine } from '../audio/AudioEngine';
import { useAudioLabStore } from '../store/useAudioLabStore';

export function usePlaybackTime(): number {
  const playing = useAudioLabStore((s) => s.transport.playing);
  useAudioLabStore((s) => s.transport.positionRevision);
  const [playingTime, setPlayingTime] = useState(() => audioEngine.currentTime);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!playing) {
      return;
    }

    const tick = () => {
      setPlayingTime(audioEngine.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [playing]);

  return playing ? playingTime : audioEngine.currentTime;
}
