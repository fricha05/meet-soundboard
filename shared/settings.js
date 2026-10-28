// Shared by the popup and bridge.js so the hotkey numbers match what the popup shows.
// The files are bundled from myinstants.com, so they play without a network connection.
const BUILTIN_SOUNDS = [
  { id: 'ding', name: '🔔 Ding', file: 'sounds/ding.mp3' },
  { id: 'tada', name: '🎉 Tada', file: 'sounds/tada.mp3' },
  { id: 'rimshot', name: '🥁 Ba dum tss', file: 'sounds/rimshot.mp3' },
  { id: 'airhorn', name: '📯 Airhorn', file: 'sounds/airhorn.mp3' },
  { id: 'wrong', name: '❌ Buzzer', file: 'sounds/wrong.mp3' },
  { id: 'applause', name: '👏 Applause', file: 'sounds/applause.mp3' },
  { id: 'crickets', name: '🦗 Crickets', file: 'sounds/crickets.mp3' },
];

// `names` (renames) and `volumes` (per-sound level, 1 = unchanged) are keyed by sound id,
// for built-in and imported sounds alike. `debug` turns on the [Meet Soundboard] traces in the Meet console.
const DEFAULT_SETTINGS = { volume: 0.8, monitor: true, debug: false, sounds: [], names: {}, volumes: {} };

function soundVolume(settings, id) {
  return settings.volume * (settings.volumes[id] ?? 1);
}

async function loadSettings() {
  return chrome.storage.local.get(DEFAULT_SETTINGS);
}

function allSounds(settings) {
  return [...BUILTIN_SOUNDS, ...settings.sounds].map((sound) => ({
    ...sound,
    defaultName: sound.name,
    name: settings.names[sound.id] || sound.name,
    volume: settings.volumes[sound.id] ?? 1,
  }));
}
