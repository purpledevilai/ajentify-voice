import { createAgentRoomStore } from './agentRoomStore';
import { createMediaDevicesStore } from './mediaDevicesStore';
import { createRealtimeStore } from './realtimeStore';
import type { AjentifyVoiceStores } from './types';

/**
 * Which transport(s) to wire up for a provider instance:
 * - `agentRoom` (default): the multi-peer signaling + agent-server room flow.
 * - `realtime`: the OpenAI realtime (WebRTC via TokenStreamingServer) flow only.
 *
 * In `realtime` mode the agent-room store is not created, so the signaling /
 * agent server connections are never established.
 */
export type AjentifyVoiceMode = 'agentRoom' | 'realtime';

export interface CreateStoresOptions {
  mode?: AjentifyVoiceMode;
  signalingServerUrl?: string;
  agentServerUrl?: string;
  tokenStreamingServerUrl?: string;
}

/**
 * Build the stores for a single provider instance. They share the
 * media-devices store via direct reference so that initialize() can drive
 * permission + enumeration.
 *
 * The set of stores created depends on `mode`: `realtime` skips the
 * agent-room store entirely.
 */
export function createStores(options: CreateStoresOptions = {}): AjentifyVoiceStores {
  const mode: AjentifyVoiceMode = options.mode ?? 'agentRoom';
  const mediaDevices = createMediaDevicesStore();

  if (mode === 'realtime') {
    const realtime = createRealtimeStore({
      tokenStreamingServerUrl: options.tokenStreamingServerUrl,
    });
    return { mediaDevices, realtime };
  }

  const agentRoom = createAgentRoomStore({
    signalingServerUrl: options.signalingServerUrl,
    agentServerUrl: options.agentServerUrl,
    mediaDevicesStore: mediaDevices,
  });

  return { mediaDevices, agentRoom };
}
