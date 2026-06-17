import { createStore, type StoreApi } from 'zustand/vanilla';
import { JSONRPCPeer, type JSONRPCHandler } from '../lib/JSONRPCPeer';
import { PeerConnection } from '../lib/PeerConnection';
import { RoomConnection } from '../lib/RoomConnection';
import {
  DEFAULT_AGENT_SERVER_URL,
  DEFAULT_SIGNALING_SERVER_URL,
  type AgentDataChannelEventName,
  type AgentDataChannelEvents,
} from '../types';
import type { MediaDevicesStore } from './mediaDevicesStore';

export interface AgentRoomState {
  // Connection lifecycle
  isConnecting: boolean;
  /** True once the data channel between us and the Agent peer is open. */
  isConnected: boolean;

  // Media references for the consumer
  /** The local microphone stream we're sending to the agent. */
  mediaStream: MediaStream | undefined;
  /** The agent's inbound audio stream — set once `ontrack` fires. */
  agentMediaStream: MediaStream | undefined;
  selectedAudioDevice: MediaDeviceInfo | undefined;
  audioMuted: boolean;

  // Internal handles
  _roomConnection?: RoomConnection;
  _rpc?: JSONRPCPeer;
  _agentPeerId?: string;
  /** Hidden <audio> element the package uses to actually play agent audio. */
  _agentAudioElement?: HTMLAudioElement;

  // ---- Lifecycle actions

  /**
   * Acquire mic permission + enumerate, build the room connection,
   * join the signaling server, and invite the agent if one isn't
   * already in the room.
   */
  initialize: (contextId: string, accessToken: string) => Promise<void>;
  /** Tear everything down and reset state. */
  disconnect: () => void;

  // ---- Media actions
  toggleMute: () => void;
  setAudioDevice: (deviceId: string) => Promise<void>;

  // ---- Raw data-channel event API

  /**
   * Subscribe to an incoming data-channel event. Returns an unsubscribe
   * function. Multiple subscribers are supported. Handler return values
   * are ignored.
   */
  on: <E extends AgentDataChannelEventName>(
    event: E,
    handler: (params: AgentDataChannelEvents[E]) => void | Promise<void>
  ) => () => void;

  /** Unsubscribe a previously-registered handler. */
  off: <E extends AgentDataChannelEventName>(
    event: E,
    handler: (params: AgentDataChannelEvents[E]) => void | Promise<void>
  ) => void;

  /**
   * Send a JSON-RPC call to the agent over the data channel. Defaults
   * to fire-and-forget. Pass `awaitResponse: true` to wait for an ack.
   */
  send: <P = any, R = any>(
    method: string,
    params: P,
    awaitResponse?: boolean,
    timeoutMs?: number
  ) => Promise<R | void>;
}

export type AgentRoomStore = StoreApi<AgentRoomState>;

export interface CreateAgentRoomStoreOptions {
  signalingServerUrl?: string;
  agentServerUrl?: string;
  mediaDevicesStore: MediaDevicesStore;
}

const AGENT_SELF_DESCRIPTION = 'Agent';
const USER_SELF_DESCRIPTION = 'User';

/**
 * Build a vanilla Zustand store that owns the agent voice-room
 * lifecycle. The store is intentionally a thin transport — it does
 * **not** track AI sentences, user transcripts, or any derived chat
 * state. Subscribe to data-channel events via `on(...)` to build your
 * own UI state.
 */
export function createAgentRoomStore(
  options: CreateAgentRoomStoreOptions
): AgentRoomStore {
  const signalingServerUrl = options.signalingServerUrl ?? DEFAULT_SIGNALING_SERVER_URL;
  const agentServerUrl = options.agentServerUrl ?? DEFAULT_AGENT_SERVER_URL;
  const mediaDevicesStore = options.mediaDevicesStore;

  // We keep the JSONRPCPeer instance as the source of truth for
  // subscribers. Until a peer exists, `on/off/send` operate on this
  // detached peer so consumers can register handlers before joining.
  // When a real peer arrives, we replay the registered handlers onto
  // its rpc layer.
  type HandlerEntry = { method: string; handler: JSONRPCHandler };
  const registered: HandlerEntry[] = [];

  let store: AgentRoomStore;

  const applyHandlers = (rpc: JSONRPCPeer) => {
    for (const entry of registered) {
      rpc.on(entry.method, entry.handler);
    }
  };

  const onIncomingMessage = (rpc: JSONRPCPeer, message: string) => {
    rpc.handleMessage(message);
  };

  const inviteAgent = async (contextId: string, accessToken: string) => {
    const response = await fetch(`${agentServerUrl.replace(/\/$/, '')}/invite-agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: accessToken,
      },
      body: JSON.stringify({ context_id: contextId }),
    });
    if (!response.ok) {
      throw new Error(`Failed to invite agent: ${response.status} ${response.statusText}`);
    }
  };

  /**
   * Mount the agent's inbound MediaStream onto a hidden `<audio>` element
   * appended to `document.body` so the user actually hears the agent.
   * Idempotent: if an element already exists we just re-point `srcObject`.
   */
  const attachAgentAudioElement = (stream: MediaStream) => {
    if (typeof document === 'undefined') return;
    let el = store.getState()._agentAudioElement;
    if (!el) {
      el = document.createElement('audio');
      el.autoplay = true;
      el.setAttribute('playsinline', 'true');
      el.style.display = 'none';
      el.setAttribute('data-ajentify-voice', 'agent-audio');
      document.body.appendChild(el);
      store.setState({ _agentAudioElement: el });
    }
    el.srcObject = stream;
    void el.play().catch((err) => {
      // Browser autoplay policy can reject this if the call wasn't
      // started in response to a user gesture. The exposed
      // `agentMediaStream` lets consumers retry from their own gesture.
      console.warn('[agentRoomStore] agent audio play() rejected:', err);
    });
  };

  const detachAgentAudioElement = () => {
    const el = store.getState()._agentAudioElement;
    if (!el) return;
    try {
      el.pause();
      el.srcObject = null;
      el.remove();
    } catch (e) {
      console.warn('[agentRoomStore] error tearing down agent audio element', e);
    }
    store.setState({ _agentAudioElement: undefined });
  };

  store = createStore<AgentRoomState>((set, get) => ({
    isConnecting: false,
    isConnected: false,
    mediaStream: undefined,
    agentMediaStream: undefined,
    selectedAudioDevice: undefined,
    audioMuted: false,

    initialize: async (contextId, accessToken) => {
      if (get().isConnecting || get().isConnected) {
        console.warn('[agentRoomStore] initialize() called while already initialized; ignoring.');
        return;
      }
      set({ isConnecting: true, isConnected: false });

      try {
        // 1. Mic permission + device enumeration.
        await mediaDevicesStore.getState().requestPermission();

        // 2. Default selected device to the first one if not yet chosen.
        let selected = mediaDevicesStore.getState().selectedAudioDevice;
        if (!selected) {
          selected = mediaDevicesStore.getState().audioDevices[0];
          if (selected) {
            mediaDevicesStore.getState().setSelectedAudioDevice(selected.deviceId);
          }
        }
        set({ selectedAudioDevice: selected });

        // 3. Acquire the long-lived local mic stream.
        const constraints: MediaStreamConstraints = {
          audio: selected ? { deviceId: { exact: selected.deviceId } } : true,
          video: false,
        };
        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        set({ mediaStream });

        // 4. Build the room connection.
        const roomConnection = new RoomConnection({
          id: contextId,
          signalingServerUrl,
          selfDescription: USER_SELF_DESCRIPTION,
          onPeerAdded: (peerId, selfDescription) =>
            handlePeerAddedOrConnectionRequest(peerId, selfDescription, true),
          onConnectionRequest: (peerId, selfDescription) =>
            handlePeerAddedOrConnectionRequest(peerId, selfDescription, false),
          onPeerConnectionStateChanged: (peerId, connected) => {
            if (peerId !== get()._agentPeerId) return;
            if (!connected) {
              set({ isConnected: false });
            }
          },
        });
        set({ _roomConnection: roomConnection });

        // 5. Join the room.
        const joinResult = await roomConnection.joinRoom();
        const hasAgent = (joinResult.existing_peers ?? []).some(
          (p) => p.self_description === AGENT_SELF_DESCRIPTION
        );

        // 6. Invite the agent if not already there.
        if (!hasAgent) {
          await inviteAgent(contextId, accessToken);
        }

        // Note: `isConnected` is flipped to `true` from the
        // `data_channel_connection_status` event the agent sends.
      } catch (err) {
        console.error('[agentRoomStore] initialize failed', err);
        set({ isConnecting: false });
        // Clean up any partial state.
        get().disconnect();
        throw err;
      }

      /**
       * Called both when the room tells us a new peer was added
       * (initiator side — we open the data channel) and when the room
       * relays a connection request from another peer (answerer side).
       *
       * We only build a PeerConnection for the agent; other peers in
       * the room are ignored at this layer.
       */
      async function handlePeerAddedOrConnectionRequest(
        peerId: string,
        selfDescription: string,
        isInitiator: boolean
      ): Promise<PeerConnection | null> {
        if (selfDescription !== AGENT_SELF_DESCRIPTION) {
          return null;
        }

        // Build an outbound audio-only stream for this peer.
        const outbound = await navigator.mediaDevices.getUserMedia({
          audio: get().selectedAudioDevice
            ? { deviceId: { exact: get().selectedAudioDevice!.deviceId } }
            : true,
          video: false,
        });

        // Make sure the new outbound stream respects the current mute state.
        if (get().audioMuted) {
          outbound.getAudioTracks().forEach((t) => (t.enabled = false));
        }

        const peer = new PeerConnection(peerId, selfDescription, outbound, isInitiator);

        // When agent audio arrives, expose it on the store AND wire it
        // into a hidden <audio> element so the user actually hears the
        // agent. WebRTC inbound audio isn't automatically routed to the
        // speakers — it needs an HTMLMediaElement with srcObject set.
        peer.setOnInboundStreamReceived((stream) => {
          set({ agentMediaStream: stream });
          attachAgentAudioElement(stream);
        });

        const rpc = new JSONRPCPeer((msg) => peer.sendMessage(msg));
        applyHandlers(rpc);

        peer.setOnDataChannelMessage((msg) => onIncomingMessage(rpc, msg));
        peer.setOnDataChannelOpen(() => {
          set({ isConnected: true, isConnecting: false });
        });

        set({ _rpc: rpc, _agentPeerId: peerId });
        return peer;
      }
    },

    disconnect: () => {
      const state = get();
      try {
        state._roomConnection?.leaveRoom();
      } catch (e) {
        console.warn('[agentRoomStore] error leaving room', e);
      }
      state.mediaStream?.getTracks().forEach((t) => t.stop());
      detachAgentAudioElement();

      set({
        isConnecting: false,
        isConnected: false,
        mediaStream: undefined,
        agentMediaStream: undefined,
        audioMuted: false,
        _roomConnection: undefined,
        _rpc: undefined,
        _agentPeerId: undefined,
      });
    },

    toggleMute: () => {
      const { mediaStream, _roomConnection } = get();
      if (!mediaStream) return;
      const tracks = mediaStream.getAudioTracks();
      if (tracks.length === 0) return;

      const newEnabled = !tracks[0]!.enabled;
      tracks.forEach((t) => (t.enabled = newEnabled));

      // Also flip the outbound tracks on every active peer so the agent
      // actually stops receiving audio while muted.
      if (_roomConnection) {
        Object.values(_roomConnection.peerConnections).forEach((pc) => {
          pc.outboundMediaStream?.getAudioTracks().forEach((t) => {
            t.enabled = newEnabled;
          });
        });
      }

      set({ audioMuted: !newEnabled });
    },

    setAudioDevice: async (deviceId) => {
      const device = mediaDevicesStore
        .getState()
        .audioDevices.find((d) => d.deviceId === deviceId);
      const { mediaStream, _roomConnection } = get();
      if (!device || !mediaStream) return;

      // Pull a fresh stream from the requested device.
      const temp = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } },
        video: false,
      });
      const newTrack = temp.getAudioTracks()[0];
      if (!newTrack) {
        temp.getTracks().forEach((t) => t.stop());
        return;
      }

      // Preserve current mute state on the new track.
      newTrack.enabled = !get().audioMuted;

      // Replace the local mediaStream's audio track.
      const oldTrack = mediaStream.getAudioTracks()[0];
      if (oldTrack) {
        mediaStream.removeTrack(oldTrack);
        oldTrack.stop();
      }
      mediaStream.addTrack(newTrack);

      // Replace the track on every active sender.
      if (_roomConnection) {
        for (const peerConn of Object.values(_roomConnection.peerConnections)) {
          const sender = peerConn.pc?.getSenders().find((s) => s.track?.kind === 'audio');
          if (sender) {
            await sender.replaceTrack(newTrack);
          }
          if (peerConn.outboundMediaStream) {
            peerConn.outboundMediaStream
              .getAudioTracks()
              .forEach((t) => peerConn.outboundMediaStream!.removeTrack(t));
            peerConn.outboundMediaStream.addTrack(newTrack);
          }
        }
      }

      // Drop any stray tracks from the temp stream.
      temp.getTracks().forEach((t) => {
        if (t !== newTrack) t.stop();
      });

      mediaDevicesStore.getState().setSelectedAudioDevice(deviceId);
      set({ selectedAudioDevice: device });
    },

    // ---- Raw event API

    on: (event, handler) => {
      const entry: HandlerEntry = { method: event as string, handler: handler as JSONRPCHandler };
      registered.push(entry);
      const rpc = get()._rpc;
      if (rpc) rpc.on(entry.method, entry.handler);
      return () => {
        const idx = registered.indexOf(entry);
        if (idx !== -1) registered.splice(idx, 1);
        const currentRpc = get()._rpc;
        if (currentRpc) currentRpc.off(entry.method, entry.handler);
      };
    },

    off: (event, handler) => {
      const idx = registered.findIndex(
        (e) => e.method === (event as string) && e.handler === (handler as JSONRPCHandler)
      );
      if (idx !== -1) registered.splice(idx, 1);
      const rpc = get()._rpc;
      if (rpc) rpc.off(event as string, handler as JSONRPCHandler);
    },

    send: async (method, params, awaitResponse = false, timeoutMs = 5000) => {
      const rpc = get()._rpc;
      if (!rpc) {
        throw new Error(
          `[agentRoomStore] Cannot send '${method}': not connected to an agent peer yet.`
        );
      }
      return rpc.call(method, params as Record<string, any>, awaitResponse, timeoutMs) as any;
    },
  }));

  return store;
}
