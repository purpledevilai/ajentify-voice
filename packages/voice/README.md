# @ajentify/voice

Thin React + WebRTC transport for talking to an Ajentify agent over a voice room.

`@ajentify/voice` owns the signaling WebSocket, the WebRTC peer connection, the microphone media stream, and the JSON-RPC data channel between the browser and the agent. It deliberately does **not** store derived chat state (AI sentences, transcribed user speech, etc.). Consumers subscribe to raw data-channel events and shape their own UI/state.

## Install

```bash
pnpm add @ajentify/voice
```

`react` and `react-dom` are peer dependencies.

## Usage

```tsx
import { AjentifyVoiceProvider, useAgentRoom, useMediaDevices, useAgentRoomEvent } from '@ajentify/voice';

function App() {
  return (
    <AjentifyVoiceProvider config={{}}>
      <Call />
    </AjentifyVoiceProvider>
  );
}

function Call() {
  const initialize = useAgentRoom((s) => s.initialize);
  const disconnect = useAgentRoom((s) => s.disconnect);
  const toggleMute = useAgentRoom((s) => s.toggleMute);
  const isConnected = useAgentRoom((s) => s.isConnected);
  const audioDevices = useMediaDevices((s) => s.audioDevices);

  // Subscribe to whatever data-channel events you care about.
  useAgentRoomEvent('ai_sentence', ({ sentence }) => {
    console.log('agent says:', sentence);
  });

  return (
    <>
      <button onClick={() => initialize('my-context-id', 'my-access-token')}>Start</button>
      <button onClick={() => disconnect()}>Stop</button>
      <button onClick={() => toggleMute()}>Mute</button>
      <select>{audioDevices.map((d) => <option key={d.deviceId}>{d.label}</option>)}</select>
      <p>{isConnected ? 'connected' : 'not connected'}</p>
    </>
  );
}
```

## Provider config

```ts
interface AjentifyVoiceConfig {
  signalingServerUrl?: string; // default: wss://room-signaling-server.prod.rooms.ajentify.com
  agentServerUrl?: string;     // default: https://agent.ajentify.com
}
```

URLs only — no callbacks. The provider builds the stores once on mount and tears them down on unmount.

## Public API

- `AjentifyVoiceProvider`, `AjentifyVoiceContext`
- `useAjentifyVoiceStores()`, `useAjentifyVoiceConfig()`
- `useAgentRoom(selector)`, `useAgentRoomStore()`
- `useMediaDevices(selector)`, `useMediaDevicesStore()`
- `useAgentRoomEvent(eventName, handler)` — convenience wrapper around `agentRoom.on(...)`
- `monitorMicStream`, `monitorInboundMediaStream` — Web Audio helpers for level animation
- `AgentDataChannelEvents`, `AgentDataChannelEventName` — typed event payload map

## Client-side tools

`on_client_side_tool_calls` is a fire-and-forget notification from the agent server. Subscribe, run your tool handlers, and emit the response back as a separate call:

```ts
useAgentRoomEvent('on_client_side_tool_calls', async ({ tool_calls }) => {
  const tool_responses = await Promise.all(
    tool_calls.map(async (c) => ({ tool_call_id: c.tool_call_id, response: await myTools[c.tool_name](c.tool_input) })),
  );
  agentRoom.send('client_side_tool_responses', { tool_responses });
});
```
