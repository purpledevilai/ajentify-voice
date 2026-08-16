import { createStore, type StoreApi } from 'zustand/vanilla';
import { JSONRPCPeer, type JSONRPCHandler } from '../lib/JSONRPCPeer';
import type { ClientSideToolCall } from '../types';

export const DEFAULT_TOKEN_STREAMING_SERVER_URL = 'wss://token-streaming-server.prod.token-streaming.ajentify.com';

export interface RealtimeSessionState {
  isConnecting: boolean;
  isConnected: boolean;
  isMuted: boolean;

  /** Transcript of what the AI is saying, accumulated from deltas. */
  transcript: string;

  // Internal handles
  _ws?: WebSocket;
  _rpc?: JSONRPCPeer;
  _pc?: RTCPeerConnection;
  _localStream?: MediaStream;
  _audioElement?: HTMLAudioElement;

  // ---- Lifecycle actions

  /**
   * Connect to the TokenStreamingServer via WebSocket, authenticate,
   * then proxy the SDP offer through TSS to OpenAI and establish the
   * WebRTC connection for audio.
   */
  initialize: (contextId: string, accessToken: string) => Promise<void>;

  /** Tear everything down. */
  disconnect: () => void;

  /** Mute/unmute local microphone. */
  toggleMute: () => void;

  // ---- Event API (same pattern as agentRoomStore)

  on: <E extends RealtimeEventName>(
    event: E,
    handler: (params: RealtimeEvents[E]) => void | Promise<void>,
  ) => () => void;

  off: <E extends RealtimeEventName>(
    event: E,
    handler: (params: RealtimeEvents[E]) => void | Promise<void>,
  ) => void;

  /**
   * Send a JSON-RPC call to TSS over the WebSocket.
   */
  send: <P = any, R = any>(
    method: string,
    params: P,
    awaitResponse?: boolean,
    timeoutMs?: number,
  ) => Promise<R | void>;
}

/**
 * Events the TSS sends over the WebSocket for the realtime session.
 */
export interface RealtimeEvents {
  on_transcript_delta: { delta: string };
  on_tool_call: { tool_call_id: string; tool_name: string; tool_input: any };
  on_tool_response: { tool_call_id: string; tool_name: string; tool_output: any };
  on_client_side_tool_calls: { tool_calls: ClientSideToolCall[] };
}

export type RealtimeEventName = keyof RealtimeEvents;

export type RealtimeStore = StoreApi<RealtimeSessionState>;

export interface CreateRealtimeStoreOptions {
  tokenStreamingServerUrl?: string;
}

export function createRealtimeStore(
  options: CreateRealtimeStoreOptions = {},
): RealtimeStore {
  const tssUrl = options.tokenStreamingServerUrl ?? DEFAULT_TOKEN_STREAMING_SERVER_URL;

  type HandlerEntry = { method: string; handler: JSONRPCHandler };
  const registered: HandlerEntry[] = [];
  let store: RealtimeStore;

  const applyHandlers = (rpc: JSONRPCPeer) => {
    for (const entry of registered) {
      rpc.on(entry.method, entry.handler);
    }
  };

  const attachAudioElement = (stream: MediaStream) => {
    if (typeof document === 'undefined') return;
    let el = store.getState()._audioElement;
    if (!el) {
      el = document.createElement('audio');
      el.autoplay = true;
      el.setAttribute('playsinline', 'true');
      el.style.display = 'none';
      el.setAttribute('data-ajentify-realtime', 'agent-audio');
      document.body.appendChild(el);
      store.setState({ _audioElement: el });
    }
    el.srcObject = stream;
    void el.play().catch((err) => {
      console.warn('[realtimeStore] agent audio play() rejected:', err);
    });
  };

  const detachAudioElement = () => {
    const el = store.getState()._audioElement;
    if (!el) return;
    try {
      el.pause();
      el.srcObject = null;
      el.remove();
    } catch (e) {
      console.warn('[realtimeStore] error tearing down audio element', e);
    }
    store.setState({ _audioElement: undefined });
  };

  store = createStore<RealtimeSessionState>((set, get) => ({
    isConnecting: false,
    isConnected: false,
    isMuted: false,
    transcript: '',

    initialize: async (contextId, accessToken) => {
      if (get().isConnecting || get().isConnected) {
        console.warn('[realtimeStore] Already initialized');
        return;
      }
      set({ isConnecting: true, isConnected: false, transcript: '' });

      try {
        // 1. Open WebSocket to TSS
        const wsUrl = `${tssUrl.replace(/\/$/, '').replace(/^http/, 'ws')}/ws-realtime`;
        const ws = new WebSocket(wsUrl);
        await waitForOpen(ws);

        const rpc = new JSONRPCPeer((msg) => ws.send(msg));
        applyHandlers(rpc);

        // Wire incoming messages
        ws.addEventListener('message', (ev) => {
          rpc.handleMessage(ev.data as string);
        });

        // Handle transcript accumulation
        rpc.on('on_transcript_delta', (params: any) => {
          set((s) => ({ transcript: s.transcript + (params.delta || '') }));
        });

        set({ _ws: ws, _rpc: rpc });

        // 2. Authenticate and connect to context
        const connectResult = await rpc.call(
          'connect_to_realtime_context',
          { context_id: contextId, access_token: accessToken },
          true,
          15000,
        );
        if (!connectResult || (connectResult as any).error) {
          throw new Error((connectResult as any)?.error || 'Failed to connect to realtime context');
        }

        // 3. Get local microphone
        const localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        set({ _localStream: localStream });

        // 4. Create WebRTC peer connection
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });
        set({ _pc: pc });

        // Add local audio track
        for (const track of localStream.getAudioTracks()) {
          pc.addTrack(track, localStream);
        }

        // Add a transceiver for receiving audio from OpenAI
        pc.addTransceiver('audio', { direction: 'recvonly' });

        // Handle incoming audio from OpenAI
        pc.ontrack = (ev) => {
          const remoteStream = ev.streams[0] || new MediaStream([ev.track]);
          attachAudioElement(remoteStream);
        };

        // 5. Create SDP offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // Wait for ICE gathering to complete
        await waitForIceGathering(pc);

        const finalOffer = pc.localDescription!.sdp;

        // 6. Send SDP offer to TSS (which proxies to OpenAI)
        const sessionResult = await rpc.call(
          'start_realtime_session',
          { sdp_offer: finalOffer },
          true,
          30000,
        );
        if (!sessionResult || (sessionResult as any).error) {
          throw new Error((sessionResult as any)?.error || 'Failed to start realtime session');
        }

        const sdpAnswer = (sessionResult as any).sdp_answer;
        if (!sdpAnswer) {
          throw new Error('No SDP answer received from server');
        }

        // 7. Set remote description
        await pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer });

        set({ isConnecting: false, isConnected: true });

        // Handle disconnect
        ws.addEventListener('close', () => {
          if (!get().isConnected && !get().isConnecting) return;
          get().disconnect();
        });
      } catch (err) {
        console.error('[realtimeStore] initialize failed', err);
        set({ isConnecting: false });
        get().disconnect();
        throw err;
      }
    },

    disconnect: () => {
      const state = get();
      try { state._pc?.close(); } catch {}
      try { state._ws?.close(); } catch {}
      state._localStream?.getTracks().forEach((t) => t.stop());
      detachAudioElement();
      set({
        isConnecting: false,
        isConnected: false,
        isMuted: false,
        transcript: '',
        _ws: undefined,
        _rpc: undefined,
        _pc: undefined,
        _localStream: undefined,
      });
    },

    toggleMute: () => {
      const { _localStream, isMuted } = get();
      if (!_localStream) return;
      const tracks = _localStream.getAudioTracks();
      const newEnabled = isMuted;
      tracks.forEach((t) => (t.enabled = newEnabled));
      set({ isMuted: !newEnabled });
    },

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
        (e) => e.method === (event as string) && e.handler === (handler as JSONRPCHandler),
      );
      if (idx !== -1) registered.splice(idx, 1);
      const rpc = get()._rpc;
      if (rpc) rpc.off(event as string, handler as JSONRPCHandler);
    },

    send: async (method, params, awaitResponse = false, timeoutMs = 5000) => {
      const rpc = get()._rpc;
      if (!rpc) {
        throw new Error(`[realtimeStore] Cannot send '${method}': not connected.`);
      }
      return rpc.call(method, params as Record<string, any>, awaitResponse, timeoutMs) as any;
    },
  }));

  return store;
}

// ---- Helpers

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', (e) => reject(new Error('WebSocket connection failed')), { once: true });
  });
}

function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
      return;
    }
    const timeout = setTimeout(() => resolve(), 3000);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
}
