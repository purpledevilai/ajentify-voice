const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.relay.metered.ca:80' },
  {
    urls: 'turn:global.relay.metered.ca:80',
    username: '854bc4758e20cfe78cf64c95',
    credential: '+KBw1GxPiZBSkrmt',
  },
  {
    urls: 'turn:global.relay.metered.ca:80?transport=tcp',
    username: '854bc4758e20cfe78cf64c95',
    credential: '+KBw1GxPiZBSkrmt',
  },
  {
    urls: 'turn:global.relay.metered.ca:443',
    username: '854bc4758e20cfe78cf64c95',
    credential: '+KBw1GxPiZBSkrmt',
  },
  {
    urls: 'turns:global.relay.metered.ca:443?transport=tcp',
    username: '854bc4758e20cfe78cf64c95',
    credential: '+KBw1GxPiZBSkrmt',
  },
];

/**
 * One peer's slice of the WebRTC connection: the `RTCPeerConnection`,
 * the outbound media stream (the local mic), the optional data channel,
 * and the inbound media stream once `ontrack` fires.
 *
 * Mirrors the ajentify-rooms class but without MobX. Consumers don't
 * usually construct this directly — `RoomConnection` does it for them.
 */
export class PeerConnection {
  id: string;
  selfDescription: string;
  outboundMediaStream: MediaStream | undefined;
  pc: RTCPeerConnection | undefined;
  inboundMediaStream: MediaStream | undefined;
  createDataChannel: boolean = false;
  dataChannel: RTCDataChannel | undefined;
  onMessageCallback: ((message: string) => void) | undefined;
  onInboundStreamReceived: ((stream: MediaStream) => void) | undefined;
  onDataChannelOpen: (() => void) | undefined;

  constructor(
    id: string,
    selfDescription: string,
    outboundMediaStream: MediaStream,
    createDataChannel: boolean = false
  ) {
    this.id = id;
    this.selfDescription = selfDescription;
    this.outboundMediaStream = outboundMediaStream;
    this.createDataChannel = createDataChannel;
  }

  setOnDataChannelMessage(callback: (message: string) => void) {
    this.onMessageCallback = callback;
  }

  setOnInboundStreamReceived(callback: (stream: MediaStream) => void) {
    this.onInboundStreamReceived = callback;
  }

  setOnDataChannelOpen(callback: () => void) {
    this.onDataChannelOpen = callback;
  }

  initialize() {
    this.pc = new RTCPeerConnection({ iceServers: DEFAULT_ICE_SERVERS });

    if (this.createDataChannel) {
      this.dataChannel = this.pc.createDataChannel('chat');
      this._wireDataChannel(this.dataChannel);
    }

    this.pc.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this._wireDataChannel(this.dataChannel);
    };

    this.pc.ontrack = (event) => {
      const [newStream] = event.streams;
      if (!newStream) return;
      this.inboundMediaStream = newStream;
      this.onInboundStreamReceived?.(newStream);
    };

    this.outboundMediaStream?.getTracks().forEach((track) => {
      this.pc?.addTrack(track, this.outboundMediaStream!);
    });
  }

  private _wireDataChannel(channel: RTCDataChannel) {
    channel.onopen = () => {
      this.onDataChannelOpen?.();
    };
    channel.onmessage = (event) => {
      this.onMessageCallback?.(event.data);
    };
  }

  sendMessage = (message: string) => {
    if (this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(message);
    } else {
      console.warn(`[PeerConnection ${this.id}] Data channel not ready`);
    }
  };
}
