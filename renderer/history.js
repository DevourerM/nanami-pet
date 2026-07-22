/* global historyHost */
(() => {
  const list = document.querySelector('#history-list');
  const close = document.querySelector('#history-close');

  function render(history) {
    list.replaceChildren();
    [...history].reverse().forEach((entry) => {
      const row = document.createElement('article');
      row.className = 'history-entry';
      const time = document.createElement('time');
      time.textContent = new Date(entry.createdAt).toLocaleString();
      const output = document.createElement('p');
      output.textContent = entry.output;
      const input = document.createElement('p');
      input.textContent = entry.input;
      row.append(time, output, input);
      list.append(row);
    });
  }

  close.addEventListener('click', () => historyHost.hide());
  historyHost.get().then(render);
  historyHost.onChanged(render);
})();
