/* global settingsHost */
(() => {
  const toggleIds = ['mouse-follow', 'click-through', 'always-on-top', 'focus-mode'];
  const toggles = Object.fromEntries(toggleIds.map((id) => [id, document.querySelector(`#${id}`)]));
  const toCamelCase = (id) => id.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
  const url = document.querySelector('#url');
  const model = document.querySelector('#model');
  const key = document.querySelector('#key');
  const volume = document.querySelector('#volume-input');
  const volumeValue = document.querySelector('#volume-value');
  const state = document.querySelector('#api-state');

  function render(settings) {
    toggleIds.forEach((id) => toggles[id].setAttribute('aria-pressed', String(settings[toCamelCase(id)])));
    url.value = settings.llm?.baseUrl || '';
    model.value = settings.llm?.model || '';
    key.value = settings.llm?.apiKey || '';
    volume.value = Math.round((settings.volume ?? 1) * 100);
    volumeValue.value = `${volume.value}%`;
    state.textContent = url.value && model.value && key.value ? '已保存' : '未配置';
  }

  toggleIds.forEach((id) => {
    toggles[id].onclick = async () => {
      const settings = await settingsHost.get();
      render(await settingsHost.update({ [toCamelCase(id)]: !settings[toCamelCase(id)] }));
    };
  });
  volume.oninput = () => { volumeValue.value = `${volume.value}%`; };
  volume.onchange = async () => render(await settingsHost.update({ volume: Number(volume.value) / 100 }));
  document.querySelector('#settings-close').onclick = () => settingsHost.hide();
  document.querySelector('#save').onclick = async () => render(await settingsHost.update({
    llm: { baseUrl: url.value.trim(), model: model.value.trim(), apiKey: key.value.trim() },
  }));
  document.querySelector('#clear-context').onclick = () => settingsHost.clearContext();
  document.querySelector('#history').onclick = () => settingsHost.toggleHistory();
  document.querySelector('#clear-history').onclick = () => settingsHost.clearHistory();
  settingsHost.get().then(render);
  settingsHost.onChanged(render);
})();
