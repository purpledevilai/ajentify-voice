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

// Text edits (the platform-wide `edits` contract; byte-identical with @ajentify/sdk + @ajentify/chat)
export {
  applyEdits,
  validateEdit,
  TextEditError,
  EDIT_OPERATIONS,
  EDITS_SCHEMA,
  EDITS_FIELD_DESCRIPTION,
  EDITS_TYPE_MARKER,
  EDIT_CONTEXT_CHARS,
  MAX_AMBIGUOUS_CONTEXTS,
  type EditOperation,
  type EditOperationName,
  type EditSummary,
  type TextEditErrorCode,
} from './lib/textEdits';

// Types
export * from './types';
