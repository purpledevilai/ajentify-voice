import { JSONRPCPeer } from './JSONRPCPeer';
import { PeerConnection } from './PeerConnection';

export interface ExistingPeer {
  peer_id: string;
  self_description: string;
}

export interface JoinRoomResponse {
  existing_peers: ExistingPeer[];
  [key: string]: unknown;
}

export interface RoomConnectionOptions {
  id: string;
  signalingServerUrl: string;
  selfDescription?: string;
  onPeerAdded?: (peerId: string, selfDescription: string) => Promise<PeerConnection | null>;
  onConnectionRequest?: (
    peerId: string,
    selfDescription: string
  ) => Promise<PeerConnection | null>;
  onPeerConnectionStateChanged?: (peerId: string, connected: boolean) => void;
  defaultMediaStream?: MediaStream | null;
}

/**
 * Wraps a WebSocket connection to the room signaling server, exchanges
 * SDP + ICE candidates, and produces `PeerConnection` instances for
 * each peer that joins the room.
 *
 * Behaviourally identical to the ajentify-rooms class, with the
 * MobX/observable bits removed and the signaling URL injected via the
 * constructor instead of being read from `import.meta.env`.
 */
export class RoomConnection {
  id: string;
  selfDescription: string;
  signalingServerUrl: string;
  peerConnections: Record<string, PeerConnection> = {};
  roomServer: JSONRPCPeer | null = null;
  websocket: WebSocket | null = null;
  onPeerAdded?: (peerId: string, selfDescription: string) => Promise<PeerConnection | null>;
  onConnectionRequest?: (
    peerId: string,
    selfDescription: string
  ) => Promise<PeerConnection | null>;
  onPeerConnectionStateChanged?: (peerId: string, connected: boolean) => void;
  defaultMediaStream: MediaStream | null;

  constructor(options: RoomConnectionOptions) {
    this.id = options.id;
    this.signalingServerUrl = options.signalingServerUrl;
    this.selfDescription = options.selfDescription ?? 'Peer';
    this.onPeerAdded = options.onPeerAdded ?? this.defaultCreatePeer;
    this.onConnectionRequest = options.onConnectionRequest ?? this.defaultCreatePeer;
    this.onPeerConnectionStateChanged = options.onPeerConnectionStateChanged;
    this.defaultMediaStream = options.defaultMediaStream ?? null;

    if ((!options.onPeerAdded || !options.onConnectionRequest) && !this.defaultMediaStream) {
      throw new Error(
        'RoomConnection requires a defaultMediaStream when no onPeerAdded/onConnectionRequest is provided'
      );
    }
  }

  async joinRoom(): Promise<JoinRoomResponse> {
    return new Promise((resolve, reject) => {
      const url = `${this.signalingServerUrl.replace(/\/$/, '')}/ws`;
      this.websocket = new WebSocket(url);

      const sender = (message: string) => {
        if (!this.websocket) throw new Error('WebSocket is not initialized');
        this.websocket.send(message);
      };

      this.roomServer = new JSONRPCPeer(sender);
      this.roomServer.on('peer_added', this._peer_added as any);
      this.roomServer.on('connection_request', this._connection_request as any);
      this.roomServer.on('add_ice_candidate', this._add_ice_candidate as any);

      this.websocket.onmessage = (event) => {
        if (!this.roomServer) throw new Error('WebSocket is not initialized');
        this.roomServer.handleMessage(event.data);
      };

      this.websocket.onerror = (err) => {
        console.error('[RoomConnection] WebSocket error', err);
        reject(err);
      };

      this.websocket.onclose = () => {
        for (const key in this.peerConnections) {
          this.peerConnections[key]?.pc?.close();
          delete this.peerConnections[key];
        }
      };

      this.websocket.onopen = async () => {
        try {
          if (!this.roomServer) throw new Error('WebSocket is not initialized');
          const result = (await this.roomServer.call(
            'join',
            { room_id: this.id, self_description: this.selfDescription },
            true
          )) as JoinRoomResponse | undefined;
          resolve(result ?? { existing_peers: [] });
        } catch (err) {
          reject(err);
        }
      };
    });
  }

  private defaultCreatePeer = async (peerId: string, selfDescription: string) => {
    if (!this.defaultMediaStream) return null;
    return new PeerConnection(peerId, selfDescription, this.defaultMediaStream);
  };

  private configurePeer = (peerConnection: PeerConnection) => {
    const peer_id = peerConnection.id;
    peerConnection.initialize();

    if (!peerConnection.pc) throw new Error('PeerConnection is not initialized');

    peerConnection.pc.onicecandidate = (event) => {
      if (event.candidate && this.roomServer) {
        this.roomServer.call('relay_ice_candidate', {
          peer_id,
          candidate: event.candidate,
        });
      }
    };

    peerConnection.pc.onconnectionstatechange = () => {
      if (!peerConnection.pc) return;
      const state = peerConnection.pc.connectionState;
      this.onPeerConnectionStateChanged?.(peer_id, state === 'connected');

      if (state === 'disconnected' || state === 'closed' || state === 'failed') {
        peerConnection.pc.close();
        peerConnection.outboundMediaStream?.getTracks().forEach((t) => t.stop());
        delete this.peerConnections[peer_id];
      }
    };
  };

  private _peer_added = async (params: { peer_id: string; self_description: string }) => {
    const { peer_id, self_description } = params;
    const peerConnection = await this.onPeerAdded?.(peer_id, self_description);
    if (!peerConnection) return;

    this.configurePeer(peerConnection);
    if (!peerConnection.pc) throw new Error('PeerConnection is not initialized');

    const offer = await peerConnection.pc.createOffer();
    await peerConnection.pc.setLocalDescription(offer);

    if (!this.roomServer) throw new Error('WebSocket is not initialized');
    const answerResponse = (await this.roomServer.call(
      'request_connection',
      { peer_id, self_description: this.selfDescription, offer },
      true,
      10000
    )) as { answer?: RTCSessionDescriptionInit } | undefined;

    if (!answerResponse || !answerResponse.answer) {
      return;
    }

    await peerConnection.pc.setRemoteDescription(answerResponse.answer);
    this.peerConnections[peer_id] = peerConnection;
  };

  private _connection_request = async (params: {
    peer_id: string;
    self_description: string;
    offer: RTCSessionDescriptionInit;
  }) => {
    const { peer_id, self_description, offer } = params;
    const peerConnection = await this.onConnectionRequest?.(peer_id, self_description);
    if (!peerConnection) return null;

    this.configurePeer(peerConnection);
    if (!peerConnection.pc) throw new Error('PeerConnection is not initialized');

    await peerConnection.pc.setRemoteDescription(offer);
    const answer = await peerConnection.pc.createAnswer();
    await peerConnection.pc.setLocalDescription(answer);

    this.peerConnections[peer_id] = peerConnection;
    return answer;
  };

  private _add_ice_candidate = async (params: {
    peer_id: string;
    candidate: RTCIceCandidateInit;
  }) => {
    const { peer_id, candidate } = params;

    let elapsed = 0;
    const timeout = 10000;
    const waitInterval = 100;
    while (!this.peerConnections[peer_id] && elapsed < timeout) {
      elapsed += waitInterval;
      await new Promise((resolve) => setTimeout(resolve, waitInterval));
    }

    const peer = this.peerConnections[peer_id];
    if (peer && peer.pc) {
      await peer.pc.addIceCandidate(candidate);
    }
  };

  leaveRoom() {
    Object.keys(this.peerConnections).forEach((key) => {
      const peerConnection = this.peerConnections[key];
      peerConnection?.pc?.close();
      peerConnection?.outboundMediaStream?.getTracks().forEach((t) => t.stop());
      delete this.peerConnections[key];
    });
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
    this.peerConnections = {};
  }
}
