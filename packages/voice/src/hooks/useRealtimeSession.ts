'use client';

import { useStore } from 'zustand';
import { useAjentifyVoiceStores } from './useAjentifyVoice';
import type { RealtimeSessionState, RealtimeStore } from '../stores/realtimeStore';

/** The raw Zustand store API for `realtime`. */
export function useRealtimeStore(): RealtimeStore {
  const store = useAjentifyVoiceStores().realtime;
  if (!store) {
    throw new Error(
      "[@ajentify/voice] realtime store is unavailable. The provider was created in legacy 'agentRoom' mode; remove `mode` (or pass mode: 'realtime') to use the realtime hooks.",
    );
  }
  return store;
}

/** Subscribe to a slice of the realtime store with React reactivity. */
export function useRealtimeSession<T>(selector: (s: RealtimeSessionState) => T): T {
  return useStore(useRealtimeStore(), selector);
}
