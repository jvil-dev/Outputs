/**
 * UI orchestration — file loading, transport, stream routing, video sync, playlist.
 */
(() => {
  // ---- DOM refs ----
  const dropZone = document.getElementById('drop-zone');
  const videoContainer = document.getElementById('video-container');
  const videoPlayer = document.getElementById('video-player');
  const btnPlay = document.getElementById('btn-play');
  const btnRestart = document.getElementById('btn-restart');
  const btnEnd = document.getElementById('btn-end');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const seekBar = document.getElementById('seek-bar');
  const timeDisplay = document.getElementById('time-display');
  const outputA = document.getElementById('output-a');
  const outputB = document.getElementById('output-b');
  const channelList = document.getElementById('channel-list');
  const statusBar = document.getElementById('status-bar');
  const delaySliderA = document.getElementById('delay-a');
  const delayValueA = document.getElementById('delay-a-value');
  const delaySliderB = document.getElementById('delay-b');
  const delayValueB = document.getElementById('delay-b-value');
  const playlistItems = document.getElementById('playlist-items');
  const btnClearPlaylist = document.getElementById('btn-clear-playlist');

  const latencyValA = document.getElementById('latency-val-a');
  const latencyValB = document.getElementById('latency-val-b');
  const latencyDelta = document.getElementById('latency-delta');

  const btnFullscreen = document.getElementById('btn-fullscreen');

  const PLAY_SYMBOL = '\u25B6';
  const PAUSE_SYMBOL = '\u23F8';

  let fileMetadata = null;
  let currentFilePath = null;
  let animFrameId = null;
  let isSeeking = false;

  // ---- Playlist state ----
  let playlist = [];       // [{ path, name }]
  let playlistIndex = -1;  // currently playing index

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

  function basename(filePath) {
    return filePath.split('/').pop().split('\\').pop();
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

  // ---- Playlist management ----
  function addToPlaylist(filePaths) {
    for (const p of filePaths) {
      // Avoid duplicates
      if (!playlist.some(item => item.path === p)) {
        playlist.push({ path: p, name: basename(p) });
      }
    }
    renderPlaylist();
    // If nothing is playing, load the first new item
    if (playlistIndex === -1 && playlist.length > 0) {
      playlistIndex = 0;
      loadCurrentTrack();
    }
  }

  function removeFromPlaylist(index) {
    const wasActive = index === playlistIndex;
    playlist.splice(index, 1);

    if (playlist.length === 0) {
      playlistIndex = -1;
      AudioEngine.pause();
      AudioEngine.clearStreams();
      channelList.textContent = '';
      videoContainer.classList.add('hidden');
      btnPlay.textContent = PLAY_SYMBOL;
      seekBar.value = 0;
      updateTimeDisplay();
      setStatus('Ready');
    } else if (wasActive) {
      // Load the item now at this index (or last item if we removed the tail)
      playlistIndex = Math.min(index, playlist.length - 1);
      loadCurrentTrack();
    } else if (index < playlistIndex) {
      playlistIndex--;
    }
    renderPlaylist();
  }

  function clearPlaylist() {
    playlist = [];
    playlistIndex = -1;
    AudioEngine.pause();
    AudioEngine.clearStreams();
    channelList.textContent = '';
    videoContainer.classList.add('hidden');
    btnPlay.textContent = PLAY_SYMBOL;
    seekBar.value = 0;
    updateTimeDisplay();
    renderPlaylist();
    setStatus('Ready');
  }

  function renderPlaylist() {
    playlistItems.textContent = '';
    playlist.forEach((item, i) => {
      const row = document.createElement('div');
      row.className = 'playlist-item' + (i === playlistIndex ? ' active' : '');

      const idx = document.createElement('span');
      idx.className = 'pl-index';
      idx.textContent = String(i + 1);

      const name = document.createElement('span');
      name.className = 'pl-name';
      name.textContent = item.name;
      name.title = item.path;

      const remove = document.createElement('button');
      remove.className = 'pl-remove';
      remove.textContent = '\u00D7';
      remove.title = 'Remove';
      remove.addEventListener('click', (e) => {
        e.stopPropagation();
        removeFromPlaylist(i);
      });

      row.appendChild(idx);
      row.appendChild(name);
      row.appendChild(remove);

      row.addEventListener('click', () => {
        if (i !== playlistIndex) {
          playlistIndex = i;
          loadCurrentTrack();
          renderPlaylist();
        }
      });

      playlistItems.appendChild(row);
    });
  }

  async function loadCurrentTrack() {
    if (playlistIndex < 0 || playlistIndex >= playlist.length) return;
    await loadFile(playlist[playlistIndex].path);
    renderPlaylist();
  }

  function playNext() {
    if (playlistIndex < playlist.length - 1) {
      playlistIndex++;
      loadCurrentTrack().then(() => {
        AudioEngine.play();
        btnPlay.textContent = PAUSE_SYMBOL;
        startAnimLoop();
      });
    }
  }

  function playPrev() {
    // If more than 3s into the track, restart it; otherwise go to previous
    if (AudioEngine.getCurrentTime() > 3 && AudioEngine.hasStreams()) {
      AudioEngine.seek(0);
      seekBar.value = 0;
      updateTimeDisplay();
      syncVideoToAudio();
      return;
    }
    if (playlistIndex > 0) {
      playlistIndex--;
      loadCurrentTrack().then(() => {
        AudioEngine.play();
        btnPlay.textContent = PAUSE_SYMBOL;
        startAnimLoop();
      });
    }
  }

  // ---- File loading ----
  async function loadFile(filePath) {
    try {
      AudioEngine.pause();
      btnPlay.textContent = PLAY_SYMBOL;

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

      // Extract and decode all audio streams
      AudioEngine.clearStreams();
      const streams = fileMetadata.audioStreams;
      const streamInfos = [];

      for (let i = 0; i < streams.length; i++) {
        const s = streams[i];
        setStatus(`Extracting stream ${i + 1}/${streams.length}: ${s.codec} ${s.channels}ch...`);
        const arrayBuffer = await window.electronAPI.extractAudioStream(filePath, s.index);
        const info = await AudioEngine.addStream(s.index, arrayBuffer);
        streamInfos.push(info);
      }

      // Build stream routing UI
      buildStreamUI(streams, streamInfos);

      // Reset transport
      seekBar.value = 0;
      updateTimeDisplay();

      const summary = streams.map((s, i) =>
        `${s.codec.toUpperCase()} ${streamInfos[i].channels}ch`
      ).join(', ');
      setStatus(`${fileMetadata.filename} \u2022 ${summary}`);
    } catch (err) {
      setStatus(`Error: ${err.message}`, true);
      console.error(err);
    }
  }

  function buildStreamLabel(stream, idx) {
    const parts = [`Track ${idx + 1}`];
    parts.push(`${stream.codec.toUpperCase()} ${stream.channels}ch`);
    if (stream.channelLayout) parts.push(`(${stream.channelLayout})`);
    if (stream.language) parts.push(`[${stream.language}]`);
    if (stream.title) parts.push(`\u2014 ${stream.title}`);
    return parts.join(' ');
  }

  function buildStreamUI(streams, streamInfos) {
    channelList.textContent = '';
    const routing = AudioEngine.getRouting();

    for (let i = 0; i < streams.length; i++) {
      const s = streams[i];
      const route = routing[s.index] || { a: true, b: false };

      const row = document.createElement('div');
      row.className = 'channel-row';
      row.dataset.streamIndex = String(s.index);

      const label = document.createElement('span');
      label.className = 'ch-label';
      label.textContent = buildStreamLabel(s, i);

      const buttons = document.createElement('div');
      buttons.className = 'ch-buttons';

      const labelA = document.createElement('label');
      const cbA = document.createElement('input');
      cbA.type = 'checkbox';
      cbA.checked = route.a;
      labelA.appendChild(cbA);
      labelA.appendChild(document.createTextNode('A'));
      if (route.a) labelA.classList.add('selected-a');

      const labelB = document.createElement('label');
      const cbB = document.createElement('input');
      cbB.type = 'checkbox';
      cbB.checked = route.b;
      labelB.appendChild(cbB);
      labelB.appendChild(document.createTextNode('B'));
      if (route.b) labelB.classList.add('selected-b');

      cbA.addEventListener('change', () => {
        labelA.classList.toggle('selected-a', cbA.checked);
        updateRouting();
      });

      cbB.addEventListener('change', () => {
        labelB.classList.toggle('selected-b', cbB.checked);
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
    const routing = {};
    rows.forEach(row => {
      const idx = parseInt(row.dataset.streamIndex, 10);
      const cbs = row.querySelectorAll('input[type="checkbox"]');
      routing[idx] = { a: cbs[0].checked, b: cbs[1].checked };
    });
    AudioEngine.setRouting(routing);
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

  // Drop zone — now adds to playlist
  dropZone.addEventListener('click', async () => {
    const filePaths = await window.electronAPI.openFileDialog();
    if (filePaths && filePaths.length > 0) addToPlaylist(filePaths);
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
    const files = [...e.dataTransfer.files];
    if (files.length > 0) {
      addToPlaylist(files.map(f => f.path));
    }
  });

  document.body.addEventListener('dragover', (e) => e.preventDefault());
  document.body.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = [...e.dataTransfer.files];
    if (files.length > 0) {
      addToPlaylist(files.map(f => f.path));
    }
  });

  // Playlist clear
  btnClearPlaylist.addEventListener('click', clearPlaylist);

  // Transport controls
  btnPlay.addEventListener('click', async () => {
    if (!AudioEngine.hasStreams()) return;
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

  btnPrev.addEventListener('click', () => playPrev());
  btnNext.addEventListener('click', () => playNext());

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

  // Fullscreen toggle
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      videoContainer.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  }

  btnFullscreen.addEventListener('click', toggleFullscreen);

  // Double-click video to toggle fullscreen
  videoPlayer.addEventListener('dblclick', toggleFullscreen);

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
    } else if (e.code === 'KeyF' && !videoContainer.classList.contains('hidden')) {
      toggleFullscreen();
    }
  });

  // Auto-advance to next track when current ends
  AudioEngine.onEnded(() => {
    btnPlay.textContent = PLAY_SYMBOL;
    seekBar.value = 0;
    updateTimeDisplay();
    cancelAnimationFrame(animFrameId);

    // Auto-advance if there's a next track
    if (playlistIndex < playlist.length - 1) {
      playNext();
    }
  });

  // Delay sliders
  const savedDelayA = localStorage.getItem('delayA');
  const savedDelayB = localStorage.getItem('delayB');
  if (savedDelayA) {
    delaySliderA.value = savedDelayA;
    delayValueA.textContent = `${savedDelayA} ms`;
    AudioEngine.setDelayA(parseInt(savedDelayA, 10) / 1000);
  }
  if (savedDelayB) {
    delaySliderB.value = savedDelayB;
    delayValueB.textContent = `${savedDelayB} ms`;
    AudioEngine.setDelayB(parseInt(savedDelayB, 10) / 1000);
  }

  delaySliderA.addEventListener('input', () => {
    const ms = parseInt(delaySliderA.value, 10);
    delayValueA.textContent = `${ms} ms`;
    AudioEngine.setDelayA(ms / 1000);
    localStorage.setItem('delayA', String(ms));
  });

  delaySliderB.addEventListener('input', () => {
    const ms = parseInt(delaySliderB.value, 10);
    delayValueB.textContent = `${ms} ms`;
    AudioEngine.setDelayB(ms / 1000);
    localStorage.setItem('delayB', String(ms));
  });

  // Latency monitor — shows user-set delay offsets only
  function updateLatencyMonitor() {
    const delayA = AudioEngine.getDelayA() * 1000;
    const delayB = AudioEngine.getDelayB() * 1000;
    const delta = Math.abs(delayA - delayB);

    latencyValA.textContent = `${delayA.toFixed(0)}ms`;
    latencyValB.textContent = `${delayB.toFixed(0)}ms`;
    latencyDelta.textContent = `${delta.toFixed(0)}ms`;
    latencyDelta.className = delta < 1
      ? 'latency-delta-value synced'
      : 'latency-delta-value offset';
  }

  delaySliderA.addEventListener('input', updateLatencyMonitor);
  delaySliderB.addEventListener('input', updateLatencyMonitor);

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
