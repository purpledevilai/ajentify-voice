'use client';

import { useStore } from 'zustand';
import { useAjentifyVoiceStores } from './useAjentifyVoice';
import type { AgentRoomState, AgentRoomStore } from '../stores/agentRoomStore';

/** The raw Zustand store API for `agentRoom`. */
export function useAgentRoomStore(): AgentRoomStore {
  const store = useAjentifyVoiceStores().agentRoom;
  if (!store) {
    throw new Error(
      "[@ajentify/voice] agentRoom store is unavailable. The provider was created in 'realtime' mode; use the realtime hooks instead.",
    );
  }
  return store;
}

/** Subscribe to a slice of the agent-room store with React reactivity. */
export function useAgentRoom<T>(selector: (s: AgentRoomState) => T): T {
  return useStore(useAgentRoomStore(), selector);
}
