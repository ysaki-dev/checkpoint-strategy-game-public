/** Seconds, tiles and half-point integers. All gameplay tuning lives here. */
export const CONFIG = {
  rulesVersion: 'waiting-priority-v2', seed: null as number | null, waterEventCount: 2,
  secretHillAreas: 5, secretForestPatches: 42,
  maxRivers: 3, fordTiles: 5, botDecision: .75, botMemory: 4,
  width: 48, height: 32, prepare: 30, duration: 300, capture: 5, cooldown: 30,
  normalOpenCount: 2, openingDuration: 30,
  checkpoints: 6, speed: 2.2, roadMultiplier: 1.5, forestRadius: 3, secretForestRadius: 2, secretViewRadius: 5, secretPoints: 1,
  hillRadius: Infinity, captureRadius: 1.1, tick: 0.05, inputTimeout: 0.6,
  reconnectGrace: 20, bonusMin: 18, bonusMax: 35,
  phaseBoundaries: [60, 240], points: [[1, 2], [2, 4], [4, 6]],
  waterChangeStart: [95, 125], waterChangeEnd: [195, 225],
} as const;
