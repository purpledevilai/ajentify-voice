import type { AgentRoomStore } from './agentRoomStore';
import type { MediaDevicesStore } from './mediaDevicesStore';
import type { RealtimeStore } from './realtimeStore';

/**
 * The bundle of vanilla Zustand stores owned by a single
 * `AjentifyVoiceProvider`. Wired together via `createStores()`.
 *
 * The provider is either/or by `mode`: `agentRoom` mode creates only the
 * `agentRoom` store, `realtime` mode creates only the `realtime` store.
 * `mediaDevices` is always present; the mode-specific store is optional.
 */
export interface AjentifyVoiceStores {
  mediaDevices: MediaDevicesStore;
  agentRoom?: AgentRoomStore;
  realtime?: RealtimeStore;
}
