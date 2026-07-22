/* global outputHost */
(() => {
  const root = document.querySelector('#output');
  const text = document.querySelector('#output-text');
  let fadeTimer;

  function show(value) {
    window.clearTimeout(fadeTimer);
    text.textContent = value;
    outputHost.setMouseEvents(true);
    root.classList.remove('is-fading');
    root.classList.add('has-text');
  }

  function fadeAfterPlayback() {
    window.clearTimeout(fadeTimer);
    fadeTimer = window.setTimeout(() => {
      root.classList.add('is-fading');
      window.setTimeout(() => {
        root.classList.remove('has-text', 'is-fading');
        text.textContent = '';
        outputHost.setMouseEvents(false);
      }, 220);
    }, 5000);
  }

  outputHost.onShow(show);
  outputHost.onPlaybackEnded(fadeAfterPlayback);
})();
