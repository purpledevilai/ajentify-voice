'use client';

import { useStore } from 'zustand';
import { useAjentifyVoiceStores } from './useAjentifyVoice';
import type { RealtimeSessionState, RealtimeStore } from '../stores/realtimeStore';

/** The raw Zustand store API for `realtime`. */
export function useRealtimeStore(): RealtimeStore {
  return useAjentifyVoiceStores().realtime;
}

/** Subscribe to a slice of the realtime store with React reactivity. */
export function useRealtimeSession<T>(selector: (s: RealtimeSessionState) => T): T {
  return useStore(useAjentifyVoiceStores().realtime, selector);
}
