'use client';

import { useStore } from 'zustand';
import { useAjentifyVoiceStores } from './useAjentifyVoice';
import type { MediaDevicesState, MediaDevicesStore } from '../stores/mediaDevicesStore';

/** The raw Zustand store API for `mediaDevices`. */
export function useMediaDevicesStore(): MediaDevicesStore {
  return useAjentifyVoiceStores().mediaDevices;
}

/** Subscribe to a slice of the media-devices store with React reactivity. */
export function useMediaDevices<T>(selector: (s: MediaDevicesState) => T): T {
  return useStore(useAjentifyVoiceStores().mediaDevices, selector);
}
