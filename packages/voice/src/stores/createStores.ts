import { createAgentRoomStore } from './agentRoomStore';
import { createMediaDevicesStore } from './mediaDevicesStore';
import { createRealtimeStore } from './realtimeStore';
import type { AjentifyVoiceStores } from './types';

/**
 * Which transport(s) to wire up for a provider instance:
 * - `realtime` (default): OpenAI realtime voice — WebRTC negotiated through
 *   the Ajentify connect server.
 * - `agentRoom` (legacy): the multi-peer signaling + agent-server room flow.
 *   Requires self-hosted signaling and agent servers; opt in explicitly.
 *
 * Only the store for the selected mode is created, so the other transport's
 * connections are never established.
 */
export type AjentifyVoiceMode = 'agentRoom' | 'realtime';

export const DEFAULT_VOICE_MODE: AjentifyVoiceMode = 'realtime';

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
 * The set of stores created depends on `mode`: `realtime` (default) skips
 * the agent-room store entirely; `agentRoom` skips the realtime store.
 */
export function createStores(options: CreateStoresOptions = {}): AjentifyVoiceStores {
  const mode: AjentifyVoiceMode = options.mode ?? DEFAULT_VOICE_MODE;
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
