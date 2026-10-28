// Runs in the page's own JS world so it can replace getUserMedia before Meet grabs the mic.
// Every audio stream Meet asks for is rerouted through a Web Audio graph: mic + soundboard bus.
(() => {
  if (window.__meetSoundboard) return;
  window.__meetSoundboard = true;

  const TAG_IN = 'meet-soundboard';
  const TAG_OUT = 'meet-soundboard-page';
  const originalGetUserMedia = MediaDevices.prototype.getUserMedia;

  let ctx = null;
  let bus = null;
  let sfxOut = null;
  let monitor = null;
  let monitorOn = true;
  let debug = false;
  const outputs = new Set();
  const prepared = new Map();
  const voices = new Set();

  function trace(...args) {
    if (debug) console.info('[Meet Soundboard]', ...args);
  }

  // Sounds → bus → limiter → sfxOut → (monitor, every hooked mic).
  // The limiter only catches peaks, e.g. two sounds at once, so they never drown the voice or clip.
  function ensureContext() {
    if (ctx) return;
    ctx = new AudioContext();
    bus = ctx.createGain();
    const limiter = new DynamicsCompressorNode(ctx, {
      threshold: -3, knee: 0, ratio: 20, attack: 0.002, release: 0.15,
    });
    sfxOut = ctx.createGain();
    monitor = ctx.createGain();
    monitor.gain.value = monitorOn ? 1 : 0;
    bus.connect(limiter).connect(sfxOut).connect(monitor);
    monitor.connect(ctx.destination);
    ctx.onstatechange = report;
    if (sinkId) followSink(sinkId);
    trace('audio context', ctx.state);
  }

  // Meet plays the call on the speaker picked in its own settings, which may not be the system default.
  // Follow that choice so the local monitor comes out where the user is listening.
  let sinkId = '';
  const originalSetSinkId = AudioContext.prototype.setSinkId;
  function followSink(id) {
    sinkId = id;
    if (ctx && originalSetSinkId) originalSetSinkId.call(ctx, id).catch(() => {});
  }
  for (const proto of [HTMLMediaElement.prototype, AudioContext.prototype]) {
    const original = proto.setSinkId;
    if (!original) continue;
    proto.setSinkId = function (id) {
      if (this !== ctx) followSink(typeof id === 'string' ? id : '');
      return original.apply(this, arguments);
    };
  }

  // Chrome keeps an AudioContext suspended until the page itself gets a click or key press
  // (clicks in the extension popup do not count). While suspended, both the mic and the sounds are silent.
  const resumeOnGesture = () => {
    if (ctx && ctx.state !== 'running') ctx.resume();
  };
  window.addEventListener('pointerdown', resumeOnGesture, true);
  window.addEventListener('keydown', resumeOnGesture, true);

  function report() {
    window.postMessage({
      source: TAG_OUT, type: 'status', active: outputs.size, audio: ctx ? ctx.state : 'none',
    }, location.origin);
  }

  function wrap(stream) {
    const micTrack = stream.getAudioTracks()[0];
    if (!micTrack) return stream;
    ensureContext();

    const source = ctx.createMediaStreamSource(new MediaStream([micTrack]));
    const dest = ctx.createMediaStreamDestination();
    source.connect(dest);
    sfxOut.connect(dest);
    const mixed = dest.stream.getAudioTracks()[0];

    // Meet reads the device info and toggles noise suppression on the track it gets back:
    // answer with the real mic so its settings UI keeps working.
    for (const method of ['getSettings', 'getCapabilities', 'getConstraints']) {
      mixed[method] = () => micTrack[method]();
    }
    mixed.applyConstraints = (constraints) => micTrack.applyConstraints(constraints);
    Object.defineProperty(mixed, 'label', { get: () => micTrack.label });

    const output = { mixed };
    outputs.add(output);
    const stopMixed = mixed.stop.bind(mixed);
    const release = () => {
      if (!outputs.delete(output)) return;
      source.disconnect();
      sfxOut.disconnect(dest);
      micTrack.stop();
      stopMixed();
      report();
    };
    mixed.stop = release;
    micTrack.addEventListener('ended', () => {
      release();
      mixed.dispatchEvent(new Event('ended'));
    });

    ctx.resume();
    trace('mic hooked:', micTrack.label, '- audio context', ctx.state);
    report();
    return new MediaStream([mixed, ...stream.getVideoTracks()]);
  }

  MediaDevices.prototype.getUserMedia = async function (constraints) {
    const stream = await originalGetUserMedia.call(this, constraints);
    if (!constraints || !constraints.audio) return stream;
    try {
      return wrap(stream);
    } catch (error) {
      console.warn('[Meet Soundboard] could not hook the mic, using it untouched', error);
      return stream;
    }
  };

  // --- Loudness normalization, so an imported file mastered very loud sits at the same level as the rest ---

  const TARGET_LOUDNESS = 0.1; // K-weighted RMS, about -20 LUFS
  const MAX_BOOST = 8;
  const MAX_VOLUME = 3; // global 150 % × per-sound 200 %
  const SILENCE_GATE = 1e-5; // mean square of a 50 ms window, about -50 dB

  // Approximates the ITU-R BS.1770 K-weighting (low cut + presence boost) so a shrill sound
  // like crickets is not judged quieter than it sounds, then averages only the non-silent windows.
  async function loudnessGain(buffer) {
    const offline = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    const src = new AudioBufferSourceNode(offline, { buffer });
    const lowCut = new BiquadFilterNode(offline, { type: 'highpass', frequency: 60, Q: 0.5 });
    const presence = new BiquadFilterNode(offline, { type: 'highshelf', frequency: 1500, gain: 4 });
    src.connect(lowCut).connect(presence).connect(offline.destination);
    src.start();
    const weighted = await offline.startRendering();

    const channels = Array.from({ length: weighted.numberOfChannels }, (_, i) => weighted.getChannelData(i));
    const windowSize = Math.round(weighted.sampleRate * 0.05);
    let sum = 0;
    let count = 0;
    for (let start = 0; start + windowSize <= weighted.length; start += windowSize) {
      let energy = 0;
      for (const data of channels) {
        for (let i = start; i < start + windowSize; i++) energy += data[i] * data[i];
      }
      energy /= windowSize * channels.length;
      if (energy > SILENCE_GATE) {
        sum += energy;
        count++;
      }
    }
    if (!count) return 1;
    return Math.min(MAX_BOOST, TARGET_LOUDNESS / Math.sqrt(sum / count));
  }

  async function prepare(id, data) {
    if (prepared.has(id)) return prepared.get(id);
    if (!data) return null;
    const buffer = await ctx.decodeAudioData(data);
    const sound = { buffer, gain: await loudnessGain(buffer) };
    prepared.set(id, sound);
    trace('normalized', id, '×' + sound.gain.toFixed(2));
    return sound;
  }

  async function play({ id, data, volume }) {
    ensureContext();
    // resume() never settles while Chrome blocks audio, so give up instead of queuing the sound.
    await Promise.race([ctx.resume(), new Promise((resolve) => setTimeout(resolve, 300))]);
    if (ctx.state !== 'running') {
      console.warn('[Meet Soundboard] audio blocked by Chrome: click once inside the Meet page');
      report();
      return;
    }

    const sound = await prepare(id, data);
    if (!sound) return;

    const gain = ctx.createGain();
    gain.gain.value = volume * sound.gain;
    gain.connect(bus);
    const voice = { gain };
    voices.add(voice);
    const src = ctx.createBufferSource();
    src.buffer = sound.buffer;
    src.connect(gain);
    src.onended = () => {
      gain.disconnect();
      voices.delete(voice);
    };
    src.start(ctx.currentTime + 0.02);
  }

  function stopAll() {
    for (const voice of voices) voice.gain.disconnect();
    voices.clear();
  }

  // Only bridge.js, which runs in this same window, may drive the soundboard. Without these checks
  // any frame or opener that holds a reference to this window (a third-party Meet add-on, the page
  // that opened the Meet tab) could push its own audio into the user's microphone.
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    if (event.data?.source !== TAG_IN) return;
    const msg = event.data;
    if (msg.type === 'play') {
      if (typeof msg.id !== 'string') return;
      if (msg.data !== undefined && !(msg.data instanceof ArrayBuffer)) return;
      const volume = Math.min(MAX_VOLUME, Math.max(0, Number(msg.volume) || 0));
      trace('play', msg.id, '- audio context', ctx ? ctx.state : 'none', '- output', sinkId || 'default');
      play({ id: msg.id, data: msg.data, volume })
        .catch((error) => console.warn('[Meet Soundboard] play failed', error));
    } else if (msg.type === 'stop') {
      stopAll();
    } else if (msg.type === 'forget') {
      prepared.delete(msg.id);
    } else if (msg.type === 'debug') {
      debug = msg.on === true;
    } else if (msg.type === 'monitor') {
      monitorOn = msg.on === true;
      if (monitor) monitor.gain.value = monitorOn ? 1 : 0;
    } else if (msg.type === 'ping') {
      report();
    }
  });
})();
