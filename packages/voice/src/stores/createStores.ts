import { createAgentRoomStore } from './agentRoomStore';
import { createMediaDevicesStore } from './mediaDevicesStore';
import type { AjentifyVoiceStores } from './types';

export interface CreateStoresOptions {
  signalingServerUrl?: string;
  agentServerUrl?: string;
}

/**
 * Build the pair of stores for a single provider instance. They share
 * the media-devices store via direct reference so that initialize()
 * can drive permission + enumeration.
 */
export function createStores(options: CreateStoresOptions = {}): AjentifyVoiceStores {
  const mediaDevices = createMediaDevicesStore();
  const agentRoom = createAgentRoomStore({
    signalingServerUrl: options.signalingServerUrl,
    agentServerUrl: options.agentServerUrl,
    mediaDevicesStore: mediaDevices,
  });
  return { mediaDevices, agentRoom };
}
