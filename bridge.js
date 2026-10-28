// Isolated-world content script: the only side that can talk to the popup and chrome.storage.
// It relays commands to inject.js (page world) through window.postMessage.
const TAG_OUT = 'meet-soundboard';
const TAG_IN = 'meet-soundboard-page';

let pageStatus = { activeMics: 0, audio: 'none' };
const sentToPage = new Set();

function toPage(msg, transfer = []) {
  window.postMessage({ source: TAG_OUT, ...msg }, location.origin, transfer);
}

async function playSound(id) {
  const settings = await loadSettings();
  const sound = allSounds(settings).find((s) => s.id === id);
  if (!sound || sentToPage.has(id)) {
    toPage({ type: 'play', id, volume: soundVolume(settings, id) });
    return;
  }
  const source = sound.file ? chrome.runtime.getURL(sound.file) : sound.dataUrl;
  const data = await (await fetch(source)).arrayBuffer();
  sentToPage.add(id);
  toPage({ type: 'play', id, data, volume: soundVolume(settings, id) }, [data]);
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== location.origin || event.data?.source !== TAG_IN) return;
  if (event.data.type === 'status') pageStatus = { activeMics: event.data.active, audio: event.data.audio };
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type !== 'status') console.info('[Meet Soundboard] popup →', msg.type, msg.id ?? '');
  if (msg.type === 'play') playSound(msg.id);
  else if (msg.type === 'stop') toPage({ type: 'stop' });
  else if (msg.type === 'forget') {
    sentToPage.delete(msg.id);
    toPage({ type: 'forget', id: msg.id });
  } else if (msg.type === 'status') reply(pageStatus);
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.monitor) toPage({ type: 'monitor', on: changes.monitor.newValue });
});

loadSettings().then((settings) => toPage({ type: 'monitor', on: settings.monitor }));

// Alt+Shift+1..9 plays the matching sound, Alt+Shift+0 stops everything.
// e.code is used because Alt changes the produced character on macOS.
window.addEventListener('keydown', async (event) => {
  if (!event.altKey || !event.shiftKey) return;
  const match = /^Digit(\d)$/.exec(event.code);
  if (!match) return;
  event.preventDefault();
  event.stopPropagation();
  const index = Number(match[1]);
  if (index === 0) {
    toPage({ type: 'stop' });
    return;
  }
  const sound = allSounds(await loadSettings())[index - 1];
  if (sound) playSound(sound.id);
}, true);
