/* global textOutputHost */
(() => {
  const content = document.querySelector('#text-content');
  const copy = document.querySelector('#copy');
  document.querySelector('#close').onclick = () => textOutputHost.hide();
  copy.onclick = async () => {
    await textOutputHost.copy(content.textContent);
    copy.classList.add('is-copied');
    setTimeout(() => copy.classList.remove('is-copied'), 800);
  };
  textOutputHost.onShow((text) => {
    content.textContent = text;
    content.scrollTop = 0;
  });
})();
