// Turns Meet's "Studio sound" off while sounds play: it runs on Google's servers and filters out
// anything that is not speech, applause included. Meet exposes no API for it, so this drives the
// settings dialog itself (More options → Settings → Audio), hidden from the user while it works.
const studio = (() => {
  // Icon ligatures and jsname are the same in every language, labels are not.
  const MORE_OPTIONS = 'button[jsname="NakZHc"]';
  const STUDIO_LABEL = /st[uú]dio|noise|bruit/i;
  const RESTORE_DELAY = 800;

  let queue = Promise.resolve();
  let switchedOff = false;
  let restoreTimer = null;

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const icon = (el) => el.querySelector('i')?.textContent.trim();

  async function waitFor(find, timeout = 3000) {
    for (const end = Date.now() + timeout; Date.now() < end; await wait(50)) {
      const found = find();
      if (found) return found;
    }
    return null;
  }

  // Meet renders its menus and dialogs in children of <body> next to the app: hide all of those.
  function hideOverlays() {
    const style = document.createElement('style');
    style.textContent = `body > :not(:has(${MORE_OPTIONS})) { opacity: 0 !important; }`;
    document.head.append(style);
    // Let the closing animation finish unseen before showing them again.
    return () => setTimeout(() => style.remove(), 400);
  }

  // Calls `change(switchEl)` with the Studio sound switch, then closes the dialog.
  async function withSwitch(change) {
    if (document.querySelector('[role=dialog][aria-modal=true]')) return false; // the user is in a dialog
    const more = document.querySelector(MORE_OPTIONS);
    if (!more) return false;
    const show = hideOverlays();
    try {
      more.click();
      const item = await waitFor(() => [...document.querySelectorAll('[role=menuitem]')].find((li) => icon(li) === 'settings'));
      if (!item) {
        more.click();
        return false;
      }
      item.click();
      const dialog = await waitFor(() => document.querySelector('[role=dialog][aria-modal=true]'));
      if (!dialog) return false;
      const audioTab = [...dialog.querySelectorAll('[role=tab]')].find((tab) => icon(tab) === 'speaker');
      if (audioTab?.getAttribute('aria-selected') === 'false') audioTab.click();
      const toggle = await waitFor(() => [...dialog.querySelectorAll('[role=tabpanel] [role=switch]')]
        .find((s) => STUDIO_LABEL.test(s.getAttribute('aria-label'))));
      const changed = toggle ? change(toggle) : false;
      dialog.querySelector('[data-mdc-dialog-action="close"]')?.click();
      return changed;
    } finally {
      show();
    }
  }

  function run(task) {
    queue = queue.then(task).catch((error) => console.warn('[Meet Soundboard] Studio sound', error));
    return queue;
  }

  // Resolves once Studio sound is off, so the sound that follows is not filtered.
  function suspend() {
    clearTimeout(restoreTimer);
    return run(async () => {
      if (switchedOff) return;
      switchedOff = await withSwitch((toggle) => {
        if (toggle.getAttribute('aria-checked') !== 'true') return false;
        toggle.click();
        return true;
      });
    });
  }

  // Waits a little so back-to-back sounds do not flip the switch each time.
  function release() {
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(() => run(async () => {
      if (!switchedOff) return;
      await withSwitch((toggle) => {
        if (toggle.getAttribute('aria-checked') === 'false') toggle.click();
        return true;
      });
      switchedOff = false;
    }), RESTORE_DELAY);
  }

  return { suspend, release };
})();
