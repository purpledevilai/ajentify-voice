# @ajentify/voice

Thin React + WebRTC transport for talking to an Ajentify agent by voice.

The default (and recommended) transport is **realtime**: the SDK opens a WebSocket to the Ajentify connect server, negotiates a WebRTC session with the OpenAI realtime API through it, and streams your microphone in / the agent's voice out. It keeps only a minimal transcript (`messages`) and exposes the raw JSON-RPC events so you can shape your own UI.

## Install

```bash
pnpm add @ajentify/voice
```

`react` and `react-dom` are peer dependencies.

## Usage

```tsx
import {
  AjentifyVoiceProvider,
  useRealtimeSession,
  useRealtimeEvent,
} from '@ajentify/voice';

function App() {
  return (
    <AjentifyVoiceProvider>
      <Call />
    </AjentifyVoiceProvider>
  );
}

function Call() {
  const initialize = useRealtimeSession((s) => s.initialize);
  const disconnect = useRealtimeSession((s) => s.disconnect);
  const toggleMute = useRealtimeSession((s) => s.toggleMute);
  const isConnected = useRealtimeSession((s) => s.isConnected);
  const messages = useRealtimeSession((s) => s.messages);

  useRealtimeEvent('on_agent_transcript', ({ transcript }) => {
    console.log('agent said:', transcript);
  });

  return (
    <>
      <button onClick={() => initialize('my-context-id', 'my-access-token')}>Start</button>
      <button onClick={() => disconnect()}>Stop</button>
      <button onClick={() => toggleMute()}>Mute</button>
      <p>{isConnected ? 'connected' : 'not connected'}</p>
      <ul>
        {messages.map((m) => (
          <li key={m.ts}>{m.role}: {m.text}</li>
        ))}
      </ul>
    </>
  );
}
```

`contextId` and `accessToken` come from the Ajentify API: create a context for your agent, then mint a client-scoped API key for it.

## Provider config

```ts
interface AjentifyVoiceConfig {
  mode?: 'realtime' | 'agentRoom'; // default: 'realtime'
  tokenStreamingServerUrl?: string; // default: wss://connect.ajentify.com  (SDK appends /ws-realtime)

  // Legacy `agentRoom` mode only:
  signalingServerUrl?: string;      // default: wss://room-signaling-server.prod.rooms.ajentify.com
  agentServerUrl?: string;          // default: https://agent.ajentify.com
}
```

URLs only — no callbacks. The provider builds the stores once on mount and tears them down on unmount. Only the store for the selected `mode` is created, so the other transport is never contacted.

## Realtime events

Subscribe with `useRealtimeEvent(name, handler)` or `realtimeStore.getState().on(name, handler)`.

| Event | Payload |
|---|---|
| `on_user_transcript` | `{ transcript }` — a completed user utterance |
| `on_agent_transcript` | `{ transcript }` — a completed agent response |
| `on_tool_call` | `{ tool_call_id, tool_name, tool_input }` |
| `on_tool_response` | `{ tool_call_id, tool_name, tool_output }` |
| `on_client_side_tool_calls` | `{ tool_calls: ClientSideToolCall[] }` |

## Client-side tools

`on_client_side_tool_calls` is a notification. Run your handlers and send the results back over the same connection:

```ts
const realtime = useRealtimeStore();

useRealtimeEvent('on_client_side_tool_calls', async ({ tool_calls }) => {
  const tool_responses = await Promise.all(
    tool_calls.map(async (c) => ({
      tool_call_id: c.tool_call_id,
      response: await myTools[c.tool_name](c.tool_input),
    })),
  );
  await realtime.getState().send('client_side_tool_responses', { tool_responses }, true);
});
```

## Public API

- `AjentifyVoiceProvider`, `AjentifyVoiceContext`
- `useAjentifyVoiceStores()`, `useAjentifyVoiceConfig()`
- `useRealtimeSession(selector)`, `useRealtimeStore()`, `useRealtimeEvent(eventName, handler)`
- `useMediaDevices(selector)`, `useMediaDevicesStore()`
- `monitorMicStream`, `monitorInboundMediaStream` — Web Audio helpers for level animation
- `RealtimeEvents`, `RealtimeEventName`, `RealtimeMessage`, `ClientSideToolCall`, `ClientSideToolResponse`
- `DEFAULT_TOKEN_STREAMING_SERVER_URL`, `DEFAULT_VOICE_MODE`

## Legacy: room transport (`mode: 'agentRoom'`)

The original multi-peer flow — a signaling WebSocket, a WebRTC room, and an agent invited via the agent server's `/invite-agent`. It is kept in the package but is **not** the default and requires you to host the signaling and agent servers yourself.

```tsx
<AjentifyVoiceProvider config={{ mode: 'agentRoom', signalingServerUrl, agentServerUrl }}>
```

Hooks: `useAgentRoom(selector)`, `useAgentRoomStore()`, `useAgentRoomEvent(eventName, handler)`; typed events in `AgentDataChannelEvents`. Client-side tool responses go via `agentRoom.send('client_side_tool_responses', { tool_responses })`. See `examples/react-vite` for a working client.
