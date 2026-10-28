const grid = document.getElementById('grid');
const pillEl = document.getElementById('pill');
const bannerEl = document.getElementById('banner');
const volumeEl = document.getElementById('volume');
const volumeValueEl = document.getElementById('volume-value');
const monitorEl = document.getElementById('monitor');
const studioOffEl = document.getElementById('studio-off');

const ICONS = {
  volume: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>',
  rename: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  remove: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="M7 5v14l12-7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
};

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'i');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.innerHTML = ICONS[name];
  return svg;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function sendToMeet(msg) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    return await chrome.tabs.sendMessage(tab.id, msg);
  } catch {
    return undefined;
  }
}

function showStatus(kind, pill, banner = '') {
  pillEl.className = `pill ${kind}`;
  pillEl.textContent = pill;
  bannerEl.textContent = banner;
}

async function refreshStatus() {
  const status = await sendToMeet({ type: 'status' });
  if (!status) {
    showStatus('', 'Hors de Meet', 'Ouvre (ou recharge) un onglet Google Meet pour jouer des sons.');
  } else if (status.audio === 'suspended') {
    showStatus('warn', 'Son bloqué', "Chrome bloque le son : clique une fois n'importe où dans la page Meet, puis réessaie.");
  } else if (status.activeMics === 0) {
    showStatus('warn', 'Micro pas encore ouvert', "Rejoins l'appel. Si tu viens d'installer l'extension, recharge l'onglet Meet.");
  } else {
    showStatus('ok', "Branché à l'appel");
  }
}

// A name can start with its own emoji ("🔔 Ding"); it becomes the tile's picture.
function splitName(name) {
  const match = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*(.*)$/u.exec(name);
  return match && match[2] ? { emoji: match[1], label: match[2] } : { emoji: '🎵', label: name };
}

function percent(level) {
  return `${Math.round(level * 100)}%`;
}

function soundTile(sound, index, removable) {
  const tile = el('div', 'tile');
  const { emoji, label } = splitName(sound.name);

  const cover = el('button', 'cover');
  cover.title = sound.name;
  cover.setAttribute('aria-label', `Jouer ${label}`);
  cover.addEventListener('click', async () => {
    tile.classList.remove('playing');
    void tile.offsetWidth;
    tile.classList.add('playing');
    await sendToMeet({ type: 'play', id: sound.id });
    setTimeout(refreshStatus, 400);
  });

  const name = el('div', 'name', label);
  tile.append(cover, el('div', 'emoji', emoji), name);
  if (index < 9) tile.append(el('span', 'key', String(index + 1)));
  const chip = el('span', 'chip', percent(sound.volume));
  chip.hidden = sound.volume === 1;
  tile.append(chip);

  const actions = el('div', 'actions');
  const action = (iconName, title, onClick, className) => {
    const button = el('button', className);
    button.title = title;
    button.append(icon(iconName));
    button.addEventListener('click', onClick);
    actions.append(button);
  };
  action('volume', 'Volume de ce son', () => toggleLevel(tile, sound, chip));
  action('rename', 'Renommer', () => startRename(tile, name, sound));
  if (removable) {
    action('remove', 'Supprimer', async () => {
      const settings = await loadSettings();
      const { [sound.id]: _name, ...names } = settings.names;
      const { [sound.id]: _volume, ...volumes } = settings.volumes;
      await chrome.storage.local.set({ sounds: settings.sounds.filter((s) => s.id !== sound.id), names, volumes });
      sendToMeet({ type: 'forget', id: sound.id });
      render();
    }, 'danger');
  }
  tile.append(actions);
  return tile;
}

// Per-sound level, on top of the global volume: 0–200 %, 100 % leaves the sound as normalized.
function toggleLevel(tile, sound, chip) {
  const open = tile.querySelector('.level');
  if (open) {
    open.remove();
    tile.classList.remove('adjusting');
    return;
  }
  const row = el('div', 'level');
  const slider = el('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '2';
  slider.step = '0.05';
  slider.value = String(sound.volume);
  slider.setAttribute('aria-label', 'Volume de ce son');
  const value = el('span', '', percent(sound.volume));
  slider.addEventListener('input', async () => {
    sound.volume = Number(slider.value);
    value.textContent = percent(sound.volume);
    chip.textContent = value.textContent;
    chip.hidden = sound.volume === 1;
    const settings = await loadSettings();
    const volumes = { ...settings.volumes, [sound.id]: sound.volume };
    if (sound.volume === 1) delete volumes[sound.id];
    await chrome.storage.local.set({ volumes });
  });
  row.append(slider, value);
  tile.classList.add('adjusting');
  tile.append(row);
  slider.focus();
}

// Swaps the name for a text field. Enter or leaving the field saves, Escape cancels,
// and an empty name brings back the original one.
function startRename(tile, name, sound) {
  const input = el('input', 'rename');
  input.value = sound.name;
  input.placeholder = sound.defaultName;
  tile.classList.add('editing');
  name.replaceWith(input);
  input.focus();
  input.select();

  let finished = false;
  const finish = async (save) => {
    if (finished) return;
    finished = true;
    if (save) {
      const settings = await loadSettings();
      const value = input.value.trim();
      const names = { ...settings.names };
      if (value && value !== sound.defaultName) names[sound.id] = value;
      else delete names[sound.id];
      await chrome.storage.local.set({ names });
    }
    render();
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') finish(true);
    else if (event.key === 'Escape') {
      event.preventDefault();
      finish(false);
    }
  });
  input.addEventListener('blur', () => finish(true));
}

function addTile() {
  const label = el('label', 'add');
  label.title = 'Ajouter des sons (mp3, wav, ogg…)';
  const input = el('input');
  input.type = 'file';
  input.accept = 'audio/*';
  input.multiple = true;
  input.addEventListener('change', () => importFiles(input));
  label.append(icon('add'), el('span', '', 'Ajouter un son'), input);
  return label;
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function addSounds(sounds) {
  const settings = await loadSettings();
  await chrome.storage.local.set({ sounds: [...settings.sounds, ...sounds] });
  render();
}

async function importFiles(input) {
  addSounds(await Promise.all([...input.files].map(async (file) => ({
    id: crypto.randomUUID(),
    name: file.name.replace(/\.[^.]+$/, ''),
    dataUrl: await readAsDataUrl(file),
  }))));
}

// --- Myinstants search: results are fetched and parsed here, nothing from the site is ever run ---

const MYINSTANTS = 'https://www.myinstants.com';
const MYINSTANTS_SEARCH = `${MYINSTANTS}/fr/search/`;
const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024;

const resultsEl = document.getElementById('results');
const resultsListEl = document.getElementById('results-list');
const resultsFootEl = document.getElementById('results-foot');
const preview = new Audio();
let previewButton = null;
let searchRun = 0;

function searchUrl(query, page) {
  const url = new URL(MYINSTANTS_SEARCH);
  url.searchParams.set('name', query);
  if (page > 1) url.searchParams.set('page', String(page));
  return url.href;
}

// The page links each sound through an inline handler: play('/media/sounds/x.mp3', …).
// Only paths under /media/sounds/ on Myinstants itself are accepted.
function soundUrl(button) {
  const match = /play\('([^']+)'/.exec(button?.getAttribute('onclick') ?? '');
  if (!match) return null;
  const url = new URL(match[1], MYINSTANTS);
  return url.origin === MYINSTANTS && url.pathname.startsWith('/media/sounds/') ? url.href : null;
}

function parseResults(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const results = [...doc.querySelectorAll('.instant')].map((instant) => ({
    name: instant.querySelector('.instant-link')?.textContent.trim() ?? '',
    url: soundUrl(instant.querySelector('button.small-button')),
    color: instant.querySelector('.circle')?.style.backgroundColor || '',
  })).filter((result) => result.name && result.url);
  return { results, hasMore: Boolean(doc.querySelector('a.page-link[rel="next"]')) };
}

function stopPreview() {
  preview.pause();
  if (previewButton) previewButton.replaceChildren(icon('play'));
  previewButton = null;
}

function togglePreview(button, url) {
  const wasPlaying = previewButton === button;
  stopPreview();
  if (wasPlaying) return;
  preview.src = url;
  preview.play().catch(() => stopPreview());
  previewButton = button;
  button.replaceChildren(icon('pause'));
}
preview.addEventListener('ended', stopPreview);

async function addResult(button, result) {
  button.disabled = true;
  button.textContent = '…';
  try {
    const response = await fetch(result.url, { credentials: 'omit' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (blob.size > MAX_DOWNLOAD_BYTES) throw new Error('fichier trop gros');
    if (!blob.type.startsWith('audio/') && !result.url.endsWith('.mp3')) throw new Error('pas un fichier audio');
    await addSounds([{ id: crypto.randomUUID(), name: result.name, dataUrl: await readAsDataUrl(blob) }]);
    button.className = 'add-result added';
    button.replaceChildren(icon('check'), 'Ajouté');
  } catch (error) {
    console.warn('[Meet Soundboard] import failed', result.url, error);
    button.disabled = false;
    button.textContent = 'Réessayer';
  }
}

function resultRow(result) {
  const row = el('li', 'result');
  const dot = el('span', 'dot');
  dot.style.backgroundColor = result.color || 'var(--accent)';
  const label = el('span', 'label', result.name);
  label.title = result.name;

  const listen = el('button', 'listen');
  listen.title = 'Écouter';
  listen.append(icon('play'));
  listen.addEventListener('click', () => togglePreview(listen, result.url));

  const add = el('button', 'add-result');
  add.title = 'Ajouter à la soundboard';
  add.append(icon('add'), 'Ajouter');
  add.addEventListener('click', () => addResult(add, result));

  row.append(dot, label, listen, add);
  return row;
}

async function loadResults(query, page) {
  const run = searchRun;
  resultsFootEl.textContent = 'Recherche…';
  try {
    const response = await fetch(searchUrl(query, page), { credentials: 'omit' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { results, hasMore } = parseResults(await response.text());
    if (run !== searchRun) return;
    resultsListEl.append(...results.map(resultRow));
    resultsFootEl.replaceChildren();
    if (!resultsListEl.childElementCount) resultsFootEl.textContent = 'Aucun son trouvé.';
    else if (hasMore) {
      const more = el('button', '', 'Plus de résultats');
      more.addEventListener('click', () => loadResults(query, page + 1));
      resultsFootEl.append(more);
    }
  } catch (error) {
    if (run !== searchRun) return;
    console.warn('[Meet Soundboard] search failed', error);
    resultsFootEl.textContent = 'Myinstants ne répond pas. Réessaie dans un instant.';
  }
}

function search(query) {
  searchRun++;
  stopPreview();
  resultsListEl.replaceChildren();
  document.getElementById('results-title').textContent = `Résultats pour « ${query} »`;
  document.getElementById('results-site').href = searchUrl(query, 1);
  resultsEl.hidden = false;
  loadResults(query, 1);
}

function closeResults() {
  searchRun++;
  stopPreview();
  resultsEl.hidden = true;
  resultsListEl.replaceChildren();
}

document.getElementById('search').addEventListener('submit', (event) => {
  event.preventDefault();
  const query = document.getElementById('search-input').value.trim();
  if (query) search(query);
  else closeResults();
});
document.getElementById('results-close').addEventListener('click', closeResults);

function showVolume() {
  volumeValueEl.textContent = percent(Number(volumeEl.value));
}

async function render() {
  const settings = await loadSettings();
  volumeEl.value = settings.volume;
  showVolume();
  monitorEl.checked = settings.monitor;
  studioOffEl.checked = settings.studioOff;
  grid.replaceChildren(
    ...allSounds(settings).map((sound, index) => soundTile(sound, index, index >= BUILTIN_SOUNDS.length)),
    addTile(),
  );
}

document.getElementById('stop').addEventListener('click', () => sendToMeet({ type: 'stop' }));
volumeEl.addEventListener('input', () => {
  showVolume();
  chrome.storage.local.set({ volume: Number(volumeEl.value) });
});
monitorEl.addEventListener('change', () => chrome.storage.local.set({ monitor: monitorEl.checked }));
studioOffEl.addEventListener('change', () => chrome.storage.local.set({ studioOff: studioOffEl.checked }));

render();
refreshStatus();
