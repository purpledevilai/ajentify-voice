# Ajentify Voice

Monorepo for [`@ajentify/voice`](packages/voice) — a thin React + WebRTC transport for realtime voice conversations with an Ajentify agent.

The package owns the signaling WebSocket, the WebRTC peer connection, the microphone media stream, and the JSON-RPC data channel. It does **not** store derived chat state (AI sentences, transcribed user speech, etc.). Consumers subscribe to raw data-channel events and shape their own state.

## Layout

- [`packages/voice`](packages/voice) — the publishable `@ajentify/voice` package
- [`examples/react-vite`](examples/react-vite) — a minimal React-Vite app that exercises the full lifecycle (mic permission, room join, agent invite, mute, device switch, client-side tool round-trip)

## Quickstart

```bash
pnpm install
pnpm --filter @ajentify/voice build
pnpm --filter ajentify-voice-example-vite dev
```

Then open <http://localhost:5173>, paste a `contextId` and `accessToken`, and start the call.
