/* global composerHost */
(() => {
  const input = document.querySelector('#tts-input');
  const submit = document.querySelector('#tts-submit');
  const picker = document.querySelector('#file-select');
  const list = document.querySelector('#attachments');
  const composer = document.querySelector('#composer');
  const processing = document.querySelector('#processing');
  const requestError = document.querySelector('#request-error');
  const maxAttachments = 8;
  let audio;
  let audioContext;
  let closing = false;
  let volume = 1;
  let focusMode = false;
  let attachments = [];
  let isProcessing = false;

  const blob = (base64) => {
    const source = atob(base64);
    const bytes = new Uint8Array(source.length);
    for (let index = 0; index < source.length; index += 1) bytes[index] = source.charCodeAt(index);
    return new Blob([bytes], { type: 'audio/wav' });
  };

  async function playWithGain(element, level) {
    if (level <= 1) {
      element.volume = level;
      return element.play();
    }
    audioContext ??= new AudioContext();
    const source = audioContext.createMediaElementSource(element);
    const gain = audioContext.createGain();
    gain.gain.value = level;
    source.connect(gain).connect(audioContext.destination);
    element.volume = 1;
    await audioContext.resume();
    return element.play();
  }

  function clearAttachments() {
    attachments.forEach((attachment) => attachment.previewUrl && URL.revokeObjectURL(attachment.previewUrl));
    attachments = [];
    render();
  }

  function removeAttachment(id) {
    const attachment = attachments.find((item) => item.id === id);
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    attachments = attachments.filter((item) => item.id !== id);
    render();
  }

  function render() {
    list.hidden = !attachments.length;
    list.replaceChildren(...attachments.map((attachment) => {
      const card = document.createElement('div');
      card.className = `attachment${attachment.previewUrl ? ' is-image' : ''}`;
      if (attachment.previewUrl) {
        const preview = document.createElement('img');
        preview.className = 'attachment-preview';
        preview.src = attachment.previewUrl;
        preview.alt = attachment.name;
        card.append(preview);
      } else {
        const name = document.createElement('span');
        name.textContent = attachment.name;
        card.append(name);
      }
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.ariaLabel = `移除 ${attachment.name}`;
      remove.textContent = '×';
      remove.onclick = () => removeAttachment(attachment.id);
      card.append(remove);
      return card;
    }));
  }

  function appendAttachments(nextAttachments) {
    const remaining = Math.max(0, maxAttachments - attachments.length);
    attachments.push(...nextAttachments.slice(0, remaining));
    render();
  }

  function showError(error) {
    const message = error?.message || '发送失败，请稍后重试。';
    requestError.textContent = message;
    requestError.hidden = false;
    composer.dataset.state = 'error';
  }

  function clearError() {
    requestError.hidden = true;
    requestError.textContent = '';
    composer.dataset.state = '';
  }

  function setProcessing(active) {
    isProcessing = active;
    composer.classList.toggle('is-processing', active);
    processing.hidden = !active;
    submit.disabled = active;
    picker.disabled = active;
    input.readOnly = active;
  }

  async function attachClipboardImage(file) {
    if (!file || file.size > 25 * 1024 * 1024 || attachments.length >= maxAttachments) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const registered = await composerHost.registerClipboardImage({ bytes, mimeType: file.type });
    if (!registered.length) return;
    const previewUrl = URL.createObjectURL(file);
    appendAttachments(registered.map((attachment) => ({ ...attachment, previewUrl })));
  }

  async function speak() {
    if (isProcessing) return;
    const text = input.value.trim();
    if (!text) return;
    composerHost.activity();
    clearError();
    setProcessing(true);
    try {
      const result = await composerHost.synthesize(text);
      if (!result.audioBase64) {
        input.value = '';
        clearAttachments();
        clearError();
        return;
      }
      audio?.pause();
      audio = new Audio(URL.createObjectURL(blob(result.audioBase64)));
      audio.volume = Math.min(volume, 1);
      audio.onended = () => composerHost.completePlayback();
      await playWithGain(audio, volume);
      input.value = '';
      clearAttachments();
      clearError();
    } catch (error) {
      console.error('Synthesis failed:', error);
      showError(error);
    } finally {
      setProcessing(false);
    }
  }

  picker.onclick = async () => {
    composerHost.activity();
    appendAttachments(await composerHost.pickFiles());
  };
  submit.onclick = speak;
  input.oninput = () => { composerHost.activity(); clearError(); };
  input.addEventListener('paste', (event) => {
    const imageItem = [...event.clipboardData.items].find((item) => item.type.startsWith('image/'));
    if (!imageItem) return;
    const image = imageItem.getAsFile();
    if (!image) return;
    event.preventDefault();
    composerHost.activity();
    void attachClipboardImage(image).catch((error) => console.error('Clipboard image attachment failed:', error));
  });
  input.onkeydown = (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void speak();
    }
    if (event.key === 'Escape' && !closing) {
      closing = true;
      setTimeout(() => composerHost.hide(), 145);
    }
  };
  composerHost.getSettings().then((settings) => {
    volume = settings.volume ?? 1;
    focusMode = Boolean(settings.focusMode);
  });
  composerHost.onFocus(() => input.focus());
  composerHost.onOpen(() => { closing = false; });
  composerHost.onSettingsChanged((settings) => {
    volume = settings.volume ?? 1;
    const nextFocusMode = Boolean(settings.focusMode);
    if (nextFocusMode && !focusMode && audio) {
      audio.pause();
      URL.revokeObjectURL(audio.src);
      audio = undefined;
      composerHost.completePlayback();
    }
    focusMode = nextFocusMode;
  });
  composerHost.onCloseRequest(() => {
    closing = true;
    setTimeout(() => composerHost.hide(), 145);
  });
})();
