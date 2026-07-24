/* global petHost */
(async () => {
  const canvas = document.querySelector('#stage');
  const pet = document.querySelector('#pet');
  const notice = document.querySelector('#notice');
  const voiceToggle = document.querySelector('#voice-toggle');
  const settingsToggle = document.querySelector('#settings-toggle');
  const memoryToggle = document.querySelector('#memory-toggle');

  let controlsHover = false;
  function updateControlHitTest(event) {
    const margin = 10;
    const interactive = [voiceToggle, settingsToggle, memoryToggle].some((control) => {
      const bounds = control.getBoundingClientRect();
      return event.clientX >= bounds.left - margin && event.clientX <= bounds.right + margin
        && event.clientY >= bounds.top - margin && event.clientY <= bounds.bottom + margin;
    });
    if (interactive === controlsHover) return;
    controlsHover = interactive;
    petHost.setControlsHover(interactive);
  }
  window.addEventListener('mousemove', updateControlHitTest);
  window.addEventListener('mouseleave', () => {
    if (!controlsHover) return;
    controlsHover = false;
    petHost.setControlsHover(false);
  });

  function showNotice(message) {
    notice.hidden = false;
    notice.textContent = message;
  }

  function addScript(source) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = source;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`无法加载运行时：${source}`));
      document.head.append(script);
    });
  }

  voiceToggle.addEventListener('click', async () => {
    const visible = await petHost.toggleComposer();
    voiceToggle.classList.toggle('is-active', visible);
  });
  settingsToggle.addEventListener('click', async () => {
    const visible = await petHost.toggleSettings();
    settingsToggle.classList.toggle('is-active', visible);
  });
  function renderMemoryToggle(enabled) {
    memoryToggle.classList.toggle('is-active', Boolean(enabled));
    const label = enabled ? '停止日常记录' : '开启日常记录';
    memoryToggle.setAttribute('aria-label', label);
    memoryToggle.title = label;
  }
  memoryToggle.addEventListener('click', async () => {
    const nextSettings = await petHost.toggleMemory();
    renderMemoryToggle(nextSettings?.memoryEnabled);
  });
  [voiceToggle, settingsToggle, memoryToggle].forEach((control) => {
    control.addEventListener('mouseenter', () => petHost.setControlsHover(true));
    control.addEventListener('mouseleave', () => petHost.setControlsHover(false));
  });

  let touchAudio;
  let audioContext;
  let volume = 1;
  let focusMode = false;
  let eventSpeechBusy = false;
  function base64ToBlob(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: 'audio/wav' });
  }

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

  async function speakEventInput(eventText, playMotion, beforePlayback) {
    if (eventSpeechBusy) return false;
    eventSpeechBusy = true;
    try {
      const result = await petHost.synthesizeEvent(eventText);
      if (!result) return false;
      if (!result.audioBase64) {
        beforePlayback?.();
        playMotion?.();
        return true;
      }
      if (touchAudio) {
        touchAudio.pause();
        URL.revokeObjectURL(touchAudio.src);
      }
      const source = URL.createObjectURL(base64ToBlob(result.audioBase64));
      touchAudio = new Audio(source);
      touchAudio.volume = Math.min(volume, 1);
      beforePlayback?.();
      playMotion?.();
      await new Promise((resolve, reject) => {
        touchAudio.addEventListener('ended', () => {
          URL.revokeObjectURL(source);
          petHost.completePlayback();
          resolve();
        }, { once: true });
        touchAudio.addEventListener('error', () => reject(new Error('Touch speech playback failed.')), { once: true });
        playWithGain(touchAudio, volume).catch(reject);
      });
      return true;
    } catch (error) {
      console.error('Touch speech failed:', error);
      petHost.completePlayback();
      return false;
    } finally {
      eventSpeechBusy = false;
    }
  }

  const { modelUrl, coreUrl, expectedCorePath, petWidth, petModelHeight, settings } = await petHost.bootstrap();
  if (!coreUrl) {
    showNotice(`缺少 Cubism Core。请将官方 SDK 的 live2dcubismcore.min.js 放到：${expectedCorePath}`);
    return;
  }

  try {
    await addScript(coreUrl);
    await addScript('../node_modules/pixi.js/dist/browser/pixi.min.js');
    await addScript('../node_modules/pixi-live2d-display/dist/cubism4.js');
    const PIXI = window.PIXI;
    const { Live2DModel, config } = PIXI.live2d;
    PIXI.live2d.CubismModel.prototype.getDrawableRenderOrders = function getDrawableRenderOrders() {
      const drawables = this._model.drawables;
      return typeof this._model.getRenderOrders === 'function'
        ? this._model.getRenderOrders()
        : drawables.renderOrders;
    };
    // Live2D 自带动作与待机音频全部静音；语音只由 TTS 输出层负责。
    config.sound = false;
    config.motionSync = true;

    const app = new PIXI.Application({
      view: canvas,
      width: petWidth,
      height: window.innerHeight,
      transparent: true,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio,
    });
    // 由设置开关控制视线；避免 SDK 自己注册的鼠标监听绕过开关。
    const model = await Live2DModel.from(modelUrl, { autoInteract: false });
    const desiredHeight = petModelHeight - 32;
    model.scale.set(desiredHeight / model.height);
    model.anchor.set(0.5, 1);
    model.x = petWidth / 2;
    model.y = petModelHeight - 10;
    app.stage.addChild(model);
    // 保留点击命中，视线跟随则由下方的设置状态单独控制。
    model.interactive = true;
    model.on('pointertap', (event) => {
      if (eventSpeechBusy) return;
      model.tap(event.data.global.x, event.data.global.y);
    });

  let mouseFollow = settings?.mouseFollow !== false;
  volume = settings?.volume ?? 1;
  focusMode = Boolean(settings?.focusMode);
    renderMemoryToggle(Boolean(settings?.memoryEnabled));
    pet.classList.toggle('is-click-through', Boolean(settings?.clickThrough));
    window.addEventListener('pointermove', (event) => {
      if (mouseFollow) model.focus(event.clientX, event.clientY);
    });
    petHost.onSettingsChanged((nextSettings) => {
      mouseFollow = nextSettings?.mouseFollow !== false;
      volume = nextSettings?.volume ?? 1;
      const nextFocusMode = Boolean(nextSettings?.focusMode);
      if (nextFocusMode && !focusMode && touchAudio) {
        touchAudio.pause();
        URL.revokeObjectURL(touchAudio.src);
        touchAudio = undefined;
        petHost.completePlayback();
      }
      focusMode = nextFocusMode;
      renderMemoryToggle(Boolean(nextSettings?.memoryEnabled));
      pet.classList.toggle('is-click-through', Boolean(nextSettings?.clickThrough));
      if (!mouseFollow) {
        // FocusController 的 (0, 0) 就是模型默认的正前方，平滑回正。
        model.internalModel.focusController.focus(0, 0);
      }
    });

    const motionByHitArea = { tou: 'Taptou', xiong: 'Tapxiong', fu: 'Tapfu', tui: 'Taptui', ZT: 'TapZT' };
    const eventByHitArea = {
      tou: '（触碰头部）',
      xiong: '（触碰胸部）',
      fu: '（触碰腹部）',
      tui: '（触碰腿部）',
      ZT: '（触碰身体）',
    };
    model.on('hit', (areas) => {
      if (eventSpeechBusy) return;
      const motion = areas.map((area) => motionByHitArea[area]).find(Boolean);
      const eventText = areas.map((area) => eventByHitArea[area]).find(Boolean);
      if (eventText) {
        void speakEventInput(eventText, () => {
          if (motion) model.motion(motion);
        });
      } else if (motion) {
        model.motion(motion);
      }
    });

    let idleTimer;
    let idleGeneration = 0;
    function scheduleIdle(generation = idleGeneration) {
      window.clearTimeout(idleTimer);
      const delay = 5 * 60 * 1000 + Math.floor(Math.random() * 55 * 60 * 1000);
      idleTimer = window.setTimeout(() => {
        void speakEventInput('（长时间无交互）', () => {
          if (generation !== idleGeneration) return;
          model.motion(Math.random() < 0.72 ? 'Idle' : 'Leave30_20_30');
        }).finally(() => {
          if (generation === idleGeneration) scheduleIdle(generation);
        });
      }, delay);
    }
    function markInteraction() {
      idleGeneration += 1;
      scheduleIdle(idleGeneration);
    }
    window.addEventListener('pointerdown', markInteraction);
    petHost.onActivity(markInteraction);
    petHost.onWorkActivity(() => {
      if (eventSpeechBusy) return;
      markInteraction();
      void speakEventInput('（持续工作中）', () => {
        model.motion(Math.random() < 0.76 ? 'Idle' : 'Leave30_20_30');
      });
    });
    // Start 是模型自带的入场动作。与触碰相同，必须等 LLM 回复和 TTS 音频均准备完成后，才与语音同步启动。
    void speakEventInput(
      '（入场）',
      () => model.motion('Start'),
      () => pet.classList.add('is-ready'),
    ).then((played) => {
      if (!played) pet.classList.add('is-ready');
    });
    scheduleIdle();
  } catch (error) {
    console.error(error);
    pet.classList.add('is-ready');
    showNotice(`模型启动失败：${error.message}`);
  }

  let dragStart;
  window.addEventListener('pointerdown', (event) => {
    if (event.button === 0 && event.shiftKey) {
      dragStart = { cursorX: event.screenX, cursorY: event.screenY };
      petHost.move(true, 0, 0);
      canvas.setPointerCapture(event.pointerId);
    }
  });
  window.addEventListener('pointermove', (event) => {
    if (!dragStart) return;
    petHost.move(false, event.screenX - dragStart.cursorX, event.screenY - dragStart.cursorY);
  });
  window.addEventListener('pointerup', () => { dragStart = null; });
  window.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    petHost.menu(event.x, event.y);
  });
})();
