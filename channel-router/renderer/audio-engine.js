/**
 * Multi-stream dual-context audio engine.
 *
 * Routing model: each audio stream can be assigned to Output A, Output B, or both.
 * Multiple streams mix together on the same output.
 */
const AudioEngine = (() => {
  let _ctxA = null;
  let _ctxB = null;

  // Per-stream decoded buffers: [{ streamIndex, audioBuffer }]
  let _streams = [];
  // Routing: { [streamIndex]: { a: bool, b: bool } }
  let _routing = {};

  // Active source nodes per context: [{ source, gain }]
  let _activeA = [];
  let _activeB = [];

  let _playing = false;
  let _startTime = 0;
  let _offset = 0;
  let _duration = 0;
  let _onEndedCallback = null;

  async function setDeviceA(deviceId) {
    if (_ctxA) {
      const wasPlaying = _playing;
      const pos = getCurrentTime();
      if (wasPlaying) _stopAll();
      await _ctxA.close();
      _ctxA = null;
      _ctxA = new AudioContext({ sinkId: deviceId || undefined });
      if (_streams.length > 0 && wasPlaying) {
        _offset = pos;
        await _rebuildAndPlay();
      } else if (_streams.length > 0) {
        _offset = pos;
      }
    } else {
      _ctxA = new AudioContext({ sinkId: deviceId || undefined });
    }
  }

  async function setDeviceB(deviceId) {
    if (_ctxB) {
      const wasPlaying = _playing;
      const pos = getCurrentTime();
      if (wasPlaying) _stopAll();
      await _ctxB.close();
      _ctxB = null;
      _ctxB = new AudioContext({ sinkId: deviceId || undefined });
      if (_streams.length > 0 && wasPlaying) {
        _offset = pos;
        await _rebuildAndPlay();
      } else if (_streams.length > 0) {
        _offset = pos;
      }
    } else {
      _ctxB = new AudioContext({ sinkId: deviceId || undefined });
    }
  }

  /**
   * Load a single decoded stream. Call once per audio stream in the file.
   * Returns { channels, duration, sampleRate }.
   */
  async function addStream(streamIndex, arrayBuffer) {
    if (!_ctxA) _ctxA = new AudioContext();
    const audioBuffer = await _ctxA.decodeAudioData(arrayBuffer);

    _streams.push({ streamIndex, audioBuffer });
    // Default: route to A
    _routing[streamIndex] = { a: true, b: false };

    // Duration = longest stream
    if (audioBuffer.duration > _duration) {
      _duration = audioBuffer.duration;
    }

    return {
      channels: audioBuffer.numberOfChannels,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
    };
  }

  function clearStreams() {
    _stopAll();
    _streams = [];
    _routing = {};
    _duration = 0;
    _offset = 0;
  }

  function setRouting(newRouting) {
    _routing = newRouting;
    if (_playing) {
      const pos = getCurrentTime();
      _stopAll();
      _offset = pos;
      _rebuildAndPlay();
    }
  }

  function getRouting() {
    // Return a deep copy
    const copy = {};
    for (const key of Object.keys(_routing)) {
      copy[key] = { a: _routing[key].a, b: _routing[key].b };
    }
    return copy;
  }

  function _buildSourcesForContext(ctx, outputKey) {
    if (!ctx) return [];
    const nodes = [];

    for (const { streamIndex, audioBuffer } of _streams) {
      const route = _routing[streamIndex];
      if (!route || !route[outputKey]) continue;

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      // Connect through a gain node for mixing
      const gain = ctx.createGain();
      gain.gain.value = 1;
      source.connect(gain);
      gain.connect(ctx.destination);

      nodes.push({ source, gain });
    }

    return nodes;
  }

  async function _rebuildAndPlay() {
    _activeA = _buildSourcesForContext(_ctxA, 'a');
    _activeB = _buildSourcesForContext(_ctxB, 'b');

    if (_ctxA && _ctxA.state === 'suspended') await _ctxA.resume();
    if (_ctxB && _ctxB.state === 'suspended') await _ctxB.resume();

    const startDelay = 0.05;

    // Start all sources on context A
    let endedAttached = false;
    for (const node of _activeA) {
      if (!endedAttached) {
        node.source.onended = () => _handleEnded();
        endedAttached = true;
      }
      node.source.start(_ctxA.currentTime + startDelay, _offset);
    }

    // Start all sources on context B
    for (const node of _activeB) {
      if (!endedAttached) {
        node.source.onended = () => _handleEnded();
        endedAttached = true;
      }
      node.source.start(_ctxB.currentTime + startDelay, _offset);
    }

    _startTime = (_ctxA ? _ctxA.currentTime : _ctxB.currentTime) + startDelay;
    _playing = true;
  }

  function _handleEnded() {
    if (!_playing) return;
    _playing = false;
    _offset = 0;
    if (_onEndedCallback) _onEndedCallback();
  }

  async function play() {
    if (_streams.length === 0) return;
    if (_playing) return;
    await _rebuildAndPlay();
  }

  function _stopAll() {
    for (const node of _activeA) {
      try { node.source.onended = null; node.source.stop(); } catch {}
      node.source.disconnect();
      node.gain.disconnect();
    }
    for (const node of _activeB) {
      try { node.source.onended = null; node.source.stop(); } catch {}
      node.source.disconnect();
      node.gain.disconnect();
    }
    _activeA = [];
    _activeB = [];
    _playing = false;
  }

  function pause() {
    if (!_playing) return;
    _offset = getCurrentTime();
    _stopAll();
  }

  function seek(time) {
    const wasPlaying = _playing;
    if (wasPlaying) _stopAll();
    _offset = Math.max(0, Math.min(time, _duration));
    if (wasPlaying) _rebuildAndPlay();
  }

  function getCurrentTime() {
    if (!_playing) return _offset;
    const ctx = _ctxA || _ctxB;
    if (!ctx) return _offset;
    const elapsed = ctx.currentTime - _startTime;
    return Math.min(_offset + elapsed, _duration);
  }

  function getDuration() {
    return _duration;
  }

  function isPlaying() {
    return _playing;
  }

  function hasStreams() {
    return _streams.length > 0;
  }

  function onEnded(cb) {
    _onEndedCallback = cb;
  }

  return {
    setDeviceA,
    setDeviceB,
    addStream,
    clearStreams,
    setRouting,
    getRouting,
    play,
    pause,
    seek,
    getCurrentTime,
    getDuration,
    isPlaying,
    hasStreams,
    onEnded,
  };
})();
