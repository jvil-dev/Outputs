/**
 * UI orchestration — file loading, transport, channel routing, video sync.
 */
(() => {
  // ---- DOM refs ----
  const dropZone = document.getElementById('drop-zone');
  const videoContainer = document.getElementById('video-container');
  const videoPlayer = document.getElementById('video-player');
  const btnPlay = document.getElementById('btn-play');
  const btnRestart = document.getElementById('btn-restart');
  const btnEnd = document.getElementById('btn-end');
  const seekBar = document.getElementById('seek-bar');
  const timeDisplay = document.getElementById('time-display');
  const outputA = document.getElementById('output-a');
  const outputB = document.getElementById('output-b');
  const channelList = document.getElementById('channel-list');
  const statusBar = document.getElementById('status-bar');
  const streamPicker = document.getElementById('stream-picker');
  const audioStreamSelect = document.getElementById('audio-stream');

  const PLAY_SYMBOL = '\u25B6';
  const PAUSE_SYMBOL = '\u23F8';

  let fileMetadata = null;
  let currentFilePath = null;
  let animFrameId = null;
  let isSeeking = false;

  // ---- Helpers ----
  function setStatus(msg, isError = false) {
    statusBar.textContent = msg;
    statusBar.className = isError ? 'error' : '';
  }

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ---- Channel layout labels ----
  const CHANNEL_LABELS = {
    'mono': ['Mono'],
    'stereo': ['L', 'R'],
    '2.1': ['L', 'R', 'LFE'],
    '3.0': ['L', 'R', 'C'],
    '4.0': ['L', 'R', 'SL', 'SR'],
    'quad': ['FL', 'FR', 'BL', 'BR'],
    '5.0': ['L', 'R', 'C', 'SL', 'SR'],
    '5.1': ['L', 'R', 'C', 'LFE', 'SL', 'SR'],
    '5.1(side)': ['L', 'R', 'C', 'LFE', 'SL', 'SR'],
    '7.1': ['L', 'R', 'C', 'LFE', 'BL', 'BR', 'SL', 'SR'],
  };

  function getChannelLabel(index, layout, total) {
    if (layout && CHANNEL_LABELS[layout]) {
      return CHANNEL_LABELS[layout][index] || `Ch ${index + 1}`;
    }
    if (total === 1) return 'Mono';
    if (total === 2) return index === 0 ? 'L' : 'R';
    if (total === 6) return (['L', 'R', 'C', 'LFE', 'SL', 'SR'])[index] || `Ch ${index + 1}`;
    return `Ch ${index + 1}`;
  }

  // ---- Device dropdown helpers ----
  function populateDeviceDropdowns(devs) {
    const savedA = localStorage.getItem('outputA');
    const savedB = localStorage.getItem('outputB');

    outputA.textContent = '';
    outputB.textContent = '';

    devs.forEach(d => {
      const optA = new Option(d.label || `Device (${d.deviceId.slice(0, 8)})`, d.deviceId);
      const optB = new Option(d.label || `Device (${d.deviceId.slice(0, 8)})`, d.deviceId);
      outputA.appendChild(optA);
      outputB.appendChild(optB);
    });

    if (savedA && [...outputA.options].some(o => o.value === savedA)) {
      outputA.value = savedA;
    }
    if (savedB && [...outputB.options].some(o => o.value === savedB)) {
      outputB.value = savedB;
    } else if (devs.length > 1) {
      outputB.selectedIndex = 1;
    }
  }

  // ---- File loading ----
  async function loadFile(filePath) {
    try {
      setStatus('Probing file...');
      fileMetadata = await window.electronAPI.probeFile(filePath);
      currentFilePath = filePath;

      // Video
      if (fileMetadata.hasVideo) {
        videoContainer.classList.remove('hidden');
        videoPlayer.src = `file://${filePath}`;
        videoPlayer.load();
      } else {
        videoContainer.classList.add('hidden');
        videoPlayer.removeAttribute('src');
      }

      // Populate audio stream picker
      const streams = fileMetadata.audioStreams;
      audioStreamSelect.textContent = '';
      streams.forEach((s, i) => {
        const label = buildStreamLabel(s, i);
        const opt = new Option(label, String(s.index));
        audioStreamSelect.appendChild(opt);
      });

      if (streams.length > 1) {
        streamPicker.classList.remove('hidden');
      } else {
        streamPicker.classList.add('hidden');
      }

      // Load the first audio stream
      await loadAudioStream(streams[0]);
    } catch (err) {
      setStatus(`Error: ${err.message}`, true);
      console.error(err);
    }
  }

  function buildStreamLabel(stream, idx) {
    const parts = [`Stream ${idx + 1}: ${stream.codec.toUpperCase()}`];
    parts.push(`${stream.channels}ch`);
    if (stream.channelLayout) parts.push(`(${stream.channelLayout})`);
    if (stream.language) parts.push(`[${stream.language}]`);
    if (stream.title) parts.push(`\u2014 ${stream.title}`);
    return parts.join(' ');
  }

  async function loadAudioStream(stream) {
    try {
      setStatus(`Extracting stream: ${stream.codec} ${stream.channels}ch...`);
      const arrayBuffer = await window.electronAPI.extractAudioStream(currentFilePath, stream.index);

      setStatus('Decoding audio...');
      const info = await AudioEngine.loadFile(arrayBuffer);

      // Build channel routing UI
      buildChannelUI(info.channels, stream.channelLayout);

      // Reset transport
      seekBar.value = 0;
      updateTimeDisplay();
      btnPlay.textContent = PLAY_SYMBOL;

      setStatus(`Ready \u2014 ${fileMetadata.filename} \u2022 ${stream.codec.toUpperCase()} ${info.channels}ch (${Math.round(info.sampleRate / 1000)}kHz)`);
    } catch (err) {
      setStatus(`Error: ${err.message}`, true);
      console.error(err);
    }
  }

  function buildChannelUI(numChannels, layout) {
    channelList.textContent = '';
    const routing = AudioEngine.getChannelRouting();

    for (let i = 0; i < numChannels; i++) {
      const row = document.createElement('div');
      row.className = 'channel-row';

      const label = document.createElement('span');
      label.className = 'ch-label';
      label.textContent = `Ch ${i + 1} (${getChannelLabel(i, layout, numChannels)})`;

      const buttons = document.createElement('div');
      buttons.className = 'ch-buttons';

      const name = `ch-${i}`;

      const labelA = document.createElement('label');
      const radioA = document.createElement('input');
      radioA.type = 'radio';
      radioA.name = name;
      radioA.value = 'a';
      radioA.checked = routing[i] === 'a';
      labelA.appendChild(radioA);
      labelA.appendChild(document.createTextNode('A'));
      if (routing[i] === 'a') labelA.classList.add('selected-a');

      const labelB = document.createElement('label');
      const radioB = document.createElement('input');
      radioB.type = 'radio';
      radioB.name = name;
      radioB.value = 'b';
      radioB.checked = routing[i] === 'b';
      labelB.appendChild(radioB);
      labelB.appendChild(document.createTextNode('B'));
      if (routing[i] === 'b') labelB.classList.add('selected-b');

      radioA.addEventListener('change', () => {
        labelA.classList.add('selected-a');
        labelB.classList.remove('selected-b');
        updateRouting();
      });

      radioB.addEventListener('change', () => {
        labelB.classList.add('selected-b');
        labelA.classList.remove('selected-a');
        updateRouting();
      });

      buttons.appendChild(labelA);
      buttons.appendChild(labelB);
      row.appendChild(label);
      row.appendChild(buttons);
      channelList.appendChild(row);
    }
  }

  function updateRouting() {
    const rows = channelList.querySelectorAll('.channel-row');
    const routing = [];
    rows.forEach((row) => {
      const radios = row.querySelectorAll('input[type="radio"]');
      routing.push(radios[0].checked ? 'a' : 'b');
    });
    AudioEngine.setChannelRouting(routing);
  }

  // ---- Animation loop ----
  function startAnimLoop() {
    function tick() {
      if (!AudioEngine.isPlaying()) return;
      if (!isSeeking) {
        const cur = AudioEngine.getCurrentTime();
        const dur = AudioEngine.getDuration();
        seekBar.value = dur > 0 ? (cur / dur) * 1000 : 0;
        updateTimeDisplay();
        syncVideoToAudio();
      }
      animFrameId = requestAnimationFrame(tick);
    }
    tick();
  }

  function updateTimeDisplay(overrideTime) {
    const cur = overrideTime !== undefined ? overrideTime : AudioEngine.getCurrentTime();
    const dur = AudioEngine.getDuration();
    timeDisplay.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
  }

  function syncVideoToAudio() {
    if (videoContainer.classList.contains('hidden')) return;
    const audioCur = AudioEngine.getCurrentTime();
    const drift = Math.abs(videoPlayer.currentTime - audioCur);

    if (drift > 0.05) {
      videoPlayer.currentTime = audioCur;
    }

    if (AudioEngine.isPlaying() && videoPlayer.paused) {
      videoPlayer.play().catch(() => {});
    } else if (!AudioEngine.isPlaying() && !videoPlayer.paused) {
      videoPlayer.pause();
    }
  }

  // ======== EVENT LISTENERS (registered synchronously) ========

  // Drop zone
  dropZone.addEventListener('click', async () => {
    const filePath = await window.electronAPI.openFileDialog();
    if (filePath) loadFile(filePath);
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file.path);
  });

  document.body.addEventListener('dragover', (e) => e.preventDefault());
  document.body.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file.path);
  });

  // Transport controls
  btnPlay.addEventListener('click', async () => {
    if (!AudioEngine.getAudioBuffer()) return;
    if (AudioEngine.isPlaying()) {
      AudioEngine.pause();
      btnPlay.textContent = PLAY_SYMBOL;
      syncVideoToAudio();
    } else {
      await AudioEngine.play();
      btnPlay.textContent = PAUSE_SYMBOL;
      startAnimLoop();
    }
  });

  btnRestart.addEventListener('click', () => {
    AudioEngine.seek(0);
    seekBar.value = 0;
    updateTimeDisplay();
    syncVideoToAudio();
  });

  btnEnd.addEventListener('click', () => {
    const dur = AudioEngine.getDuration();
    AudioEngine.seek(dur);
    updateTimeDisplay();
    syncVideoToAudio();
  });

  seekBar.addEventListener('input', () => {
    isSeeking = true;
    const dur = AudioEngine.getDuration();
    const time = (seekBar.value / 1000) * dur;
    updateTimeDisplay(time);
  });

  seekBar.addEventListener('change', () => {
    const dur = AudioEngine.getDuration();
    const time = (seekBar.value / 1000) * dur;
    AudioEngine.seek(time);
    syncVideoToAudio();
    isSeeking = false;
  });

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      btnPlay.click();
    } else if (e.code === 'ArrowLeft') {
      const cur = AudioEngine.getCurrentTime();
      AudioEngine.seek(cur - 5);
      syncVideoToAudio();
    } else if (e.code === 'ArrowRight') {
      const cur = AudioEngine.getCurrentTime();
      AudioEngine.seek(cur + 5);
      syncVideoToAudio();
    }
  });

  AudioEngine.onEnded(() => {
    btnPlay.textContent = PLAY_SYMBOL;
    seekBar.value = 0;
    updateTimeDisplay();
    cancelAnimationFrame(animFrameId);
  });

  // Audio stream picker
  audioStreamSelect.addEventListener('change', async () => {
    if (!fileMetadata) return;
    const selectedIndex = parseInt(audioStreamSelect.value, 10);
    const stream = fileMetadata.audioStreams.find(s => s.index === selectedIndex);
    if (stream) {
      AudioEngine.pause();
      btnPlay.textContent = PLAY_SYMBOL;
      await loadAudioStream(stream);
    }
  });

  // Output device change
  outputA.addEventListener('change', async () => {
    localStorage.setItem('outputA', outputA.value);
    await AudioEngine.setDeviceA(outputA.value);
    setStatus(`Output A \u2192 ${outputA.options[outputA.selectedIndex].text}`);
  });

  outputB.addEventListener('change', async () => {
    localStorage.setItem('outputB', outputB.value);
    await AudioEngine.setDeviceB(outputB.value);
    setStatus(`Output B \u2192 ${outputB.options[outputB.selectedIndex].text}`);
  });

  // ======== ASYNC INIT (non-blocking) ========
  async function init() {
    try {
      await DeviceManager.requestPermission();
      const devices = await DeviceManager.enumerate();
      populateDeviceDropdowns(devices);

      await AudioEngine.setDeviceA(outputA.value);
      await AudioEngine.setDeviceB(outputB.value);

      DeviceManager.onChange((devs) => {
        populateDeviceDropdowns(devs);
        setStatus('Audio devices changed');
      });

      setStatus('Ready');
    } catch (err) {
      setStatus(`Init error: ${err.message}`, true);
      console.error('Init error:', err);
    }
  }

  init();
})();
