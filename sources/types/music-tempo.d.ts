declare module 'music-tempo' {
  interface MusicTempoOptions {
    bufferSize?: number;
    hopSize?: number;
    tempoStep?: number;
    timeStep?: number;
    minBPM?: number;
    maxBPM?: number;
  }

  class MusicTempo {
    tempo: number;
    beats: number[];
    constructor(audioData: Float32Array, options?: MusicTempoOptions);
  }

  export default MusicTempo;
}
