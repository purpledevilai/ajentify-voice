// Provider
export {
  AjentifyVoiceProvider,
  type AjentifyVoiceConfig,
  type AjentifyVoiceProviderProps,
} from './provider/AjentifyVoiceProvider';
export { AjentifyVoiceContext, type AjentifyVoiceContextValue } from './provider/context';

// Hooks
export {
  useAjentifyVoiceStores,
  useAjentifyVoiceConfig,
  useAgentRoom,
  useAgentRoomStore,
  useMediaDevices,
  useMediaDevicesStore,
  useAgentRoomEvent,
  useRealtimeSession,
  useRealtimeStore,
  useRealtimeEvent,
} from './hooks';

// Stores (advanced users)
export * from './stores';

// WebRTC primitives (advanced users)
export { RoomConnection } from './lib/RoomConnection';
export type {
  RoomConnectionOptions,
  JoinRoomResponse,
  ExistingPeer,
} from './lib/RoomConnection';
export { PeerConnection } from './lib/PeerConnection';
export { JSONRPCPeer, type JSONRPCHandler } from './lib/JSONRPCPeer';

// Audio-level helpers
export { monitorMicStream, monitorInboundMediaStream } from './lib/monitorMediaStreams';

// Types
export * from './types';
