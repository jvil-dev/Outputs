/**
 * Device enumeration and management.
 */
const DeviceManager = (() => {
  let _devices = [];
  let _onChangeCallback = null;

  async function requestPermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch {
      // Permission denied — device labels may be blank
    }
  }

  async function enumerate() {
    const all = await navigator.mediaDevices.enumerateDevices();
    _devices = all.filter(d => d.kind === 'audiooutput');
    return _devices;
  }

  function getDevices() {
    return _devices;
  }

  function onChange(cb) {
    _onChangeCallback = cb;
    navigator.mediaDevices.addEventListener('devicechange', async () => {
      await enumerate();
      if (_onChangeCallback) _onChangeCallback(_devices);
    });
  }

  return { requestPermission, enumerate, getDevices, onChange };
})();
