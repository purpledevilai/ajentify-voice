import { createStore, type StoreApi } from 'zustand/vanilla';

export interface MediaDevicesState {
  /** Audio input devices. Populated after `requestPermission()` or `refresh()`. */
  audioDevices: MediaDeviceInfo[];
  /** Whichever device the consumer has selected. Defaults to `audioDevices[0]`. */
  selectedAudioDevice: MediaDeviceInfo | undefined;
  /** True once we've successfully asked for mic permission once. */
  hasPermission: boolean;

  /**
   * Ask the browser for mic permission, enumerate audio inputs, and set
   * a default selected device if none was previously chosen. Safe to
   * call multiple times — subsequent calls just refresh the list.
   */
  requestPermission: () => Promise<void>;

  /** Re-enumerate devices without re-prompting for permission. */
  refresh: () => Promise<void>;

  /** Pick a device by id; no-op if it's not in `audioDevices`. */
  setSelectedAudioDevice: (deviceId: string) => void;

  /** Tear down the `devicechange` listener. Called on provider unmount. */
  _teardown: () => void;
}

export type MediaDevicesStore = StoreApi<MediaDevicesState>;

export function createMediaDevicesStore(): MediaDevicesStore {
  const onDeviceChange = async () => {
    await refresh();
  };

  let store: MediaDevicesStore;
  let listenerAttached = false;

  const attachListener = () => {
    if (listenerAttached) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return;
    if (typeof navigator.mediaDevices.addEventListener !== 'function') return;
    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
    listenerAttached = true;
  };

  const detachListener = () => {
    if (!listenerAttached) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return;
    if (typeof navigator.mediaDevices.removeEventListener !== 'function') return;
    navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange);
    listenerAttached = false;
  };

  const refresh = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioDevices = devices.filter((d) => d.kind === 'audioinput');

    const current = store.getState().selectedAudioDevice;
    const stillThere =
      current && audioDevices.some((d) => d.deviceId === current.deviceId);
    const nextSelected = stillThere ? current : audioDevices[0];

    store.setState({ audioDevices, selectedAudioDevice: nextSelected });
  };

  store = createStore<MediaDevicesState>((set, get) => ({
    audioDevices: [],
    selectedAudioDevice: undefined,
    hasPermission: false,

    requestPermission: async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
        throw new Error('navigator.mediaDevices is not available in this environment');
      }
      // Ask for mic permission, then immediately stop the temp stream.
      // We only need permission so `enumerateDevices()` returns labels.
      const temp = await navigator.mediaDevices.getUserMedia({ audio: true });
      temp.getTracks().forEach((t) => t.stop());

      set({ hasPermission: true });
      attachListener();
      await refresh();
    },

    refresh,

    setSelectedAudioDevice: (deviceId) => {
      const device = get().audioDevices.find((d) => d.deviceId === deviceId);
      if (device) set({ selectedAudioDevice: device });
    },

    _teardown: detachListener,
  }));

  return store;
}
