import type { AgentRoomStore } from './agentRoomStore';
import type { MediaDevicesStore } from './mediaDevicesStore';

/**
 * The bundle of vanilla Zustand stores owned by a single
 * `AjentifyVoiceProvider`. Wired together via `createStores()`.
 */
export interface AjentifyVoiceStores {
  agentRoom: AgentRoomStore;
  mediaDevices: MediaDevicesStore;
}
