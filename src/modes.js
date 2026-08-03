// modes.js — race mode configuration
// Add a new entry here to add a new mode; all scaling flows from sizeMultiplier/trackSamples/arenaSize.

export const MODES = [
  {
    id: 'quickRace',
    label: 'QUICK RACE',
    description: 'Classic circuits · 5 laps',
    totalLaps: 5,
    sizeMultiplier: 1.0,
    trackSamples: 1000,
    arenaSize: 4000,
    hasFuel: false,
    hasTireWear: false,
    hasPit: false,
  },
  {
    id: 'grandPrix',
    label: 'GRAND PRIX',
    description: 'Larger circuits · 15 laps',
    totalLaps: 15,
    sizeMultiplier: 2.0,
    trackSamples: 2000,
    arenaSize: 8000,
    hasFuel: true,
    hasTireWear: true,
    hasPit: true,
  },
];
