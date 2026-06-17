'use client';

import { useStore } from 'zustand';
import { useAjentifyVoiceStores } from './useAjentifyVoice';
import type { AgentRoomState, AgentRoomStore } from '../stores/agentRoomStore';

/** The raw Zustand store API for `agentRoom`. */
export function useAgentRoomStore(): AgentRoomStore {
  return useAjentifyVoiceStores().agentRoom;
}

/** Subscribe to a slice of the agent-room store with React reactivity. */
export function useAgentRoom<T>(selector: (s: AgentRoomState) => T): T {
  return useStore(useAjentifyVoiceStores().agentRoom, selector);
}
