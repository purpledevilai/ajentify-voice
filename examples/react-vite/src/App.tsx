import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useAgentRoom,
  useAgentRoomEvent,
  useAgentRoomStore,
  useAjentifyVoiceConfig,
  useMediaDevices,
  DEFAULT_AGENT_SERVER_URL,
  DEFAULT_SIGNALING_SERVER_URL,
  type ClientSideToolCall,
  type ClientSideToolResponse,
} from '@ajentify/voice';
import { loadEndpointConfig, saveEndpointConfig } from './endpoints';

/**
 * One AI sentence as displayed in the timeline. Note that the package
 * does NOT store these — the example owns this state and builds it
 * from raw data-channel events.
 */
interface AiMessage {
  sentence_id: number;
  sentence: string;
}

interface UserMessage {
  id: string;
  text: string;
}

interface ToolLogEntry {
  ts: number;
  kind: 'tool_call' | 'tool_response' | 'client_side_tool_call' | 'client_side_tool_response';
  tool_name: string;
  payload: any;
}

/**
 * Tiny set of demo client-side tools the agent can call. The function
 * receives the tool's input args and returns the response string.
 */
const CLIENT_SIDE_TOOLS: Record<string, (input: Record<string, any>) => Promise<string> | string> = {
  get_local_time: () => {
    const now = new Date();
    return JSON.stringify({
      iso: now.toISOString(),
      local: now.toLocaleString(),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  },
  show_alert: (input) => {
    const message = (input?.message as string | undefined) ?? 'Agent has nothing to say';
    window.alert(`[Agent] ${message}`);
    return JSON.stringify({ ok: true });
  },
};

export function App() {
  const [contextId, setContextId] = useState(() => localStorage.getItem('aj.contextId') ?? '');
  const [accessToken, setAccessToken] = useState(
    () => localStorage.getItem('aj.accessToken') ?? '',
  );

  // ---- Connection state from the package
  const isConnecting = useAgentRoom((s) => s.isConnecting);
  const isConnected = useAgentRoom((s) => s.isConnected);
  const audioMuted = useAgentRoom((s) => s.audioMuted);
  const selectedAudioDevice = useAgentRoom((s) => s.selectedAudioDevice);

  // ---- Media devices
  const audioDevices = useMediaDevices((s) => s.audioDevices);
  const requestPermission = useMediaDevices((s) => s.requestPermission);

  // ---- Store actions
  const initialize = useAgentRoom((s) => s.initialize);
  const disconnect = useAgentRoom((s) => s.disconnect);
  const toggleMute = useAgentRoom((s) => s.toggleMute);
  const setAudioDevice = useAgentRoom((s) => s.setAudioDevice);

  // ---- Consumer-owned derived state from data-channel events
  const [agentStatus, setAgentStatus] = useState<string>('idle');
  const [calibrationStatus, setCalibrationStatus] = useState<string>('');
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [currentDetectedSpeech, setCurrentDetectedSpeech] = useState<string>('');
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [currentlySpeakingSentenceId, setCurrentlySpeakingSentenceId] = useState<number | null>(
    null,
  );
  const [userMessages, setUserMessages] = useState<UserMessage[]>([]);
  const currentUserMessageId = useRef<string | null>(null);
  const userMsgCounter = useRef(0);
  const [toolLog, setToolLog] = useState<ToolLogEntry[]>([]);

  // ---- Try to enumerate devices early so the dropdown shows up before we connect.
  useEffect(() => {
    if (audioDevices.length === 0) {
      requestPermission().catch(() => {
        // Permission may be denied or unavailable in this context; the user
        // can still connect — initialize() will request again.
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Subscribe to data-channel events to build local UI state.
  useAgentRoomEvent('agent_status', ({ status, message }) => {
    setAgentStatus(message ? `${status}: ${message}` : status);
  });

  useAgentRoomEvent('calibration_status', ({ status }) => {
    setCalibrationStatus(status);
  });

  useAgentRoomEvent('is_speaking_status', ({ is_speaking }) => {
    setIsUserSpeaking(is_speaking);
    if (is_speaking) {
      if (!currentUserMessageId.current) {
        userMsgCounter.current += 1;
        const id = `user-msg-${userMsgCounter.current}`;
        currentUserMessageId.current = id;
        setUserMessages((prev) => [...prev, { id, text: '' }]);
      }
    } else {
      setCurrentDetectedSpeech('');
      currentUserMessageId.current = null;
    }
  });

  useAgentRoomEvent('speech_detected', ({ text }) => {
    setCurrentDetectedSpeech(text);
    if (!currentUserMessageId.current) {
      userMsgCounter.current += 1;
      const id = `user-msg-${userMsgCounter.current}`;
      currentUserMessageId.current = id;
      setUserMessages((prev) => [...prev, { id, text }]);
    } else {
      const id = currentUserMessageId.current;
      setUserMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text } : m)));
    }
  });

  useAgentRoomEvent('ai_sentence', ({ sentence, sentence_id }) => {
    setAiMessages((prev) => [...prev, { sentence, sentence_id }]);
  });

  useAgentRoomEvent('is_speaking_sentence', ({ sentence_id }) => {
    setCurrentlySpeakingSentenceId(sentence_id);
  });

  useAgentRoomEvent('stoped_speaking', () => {
    setCurrentlySpeakingSentenceId(null);
  });

  useAgentRoomEvent('tool_call', ({ tool_name, tool_input }) => {
    const entry: ToolLogEntry = {
      ts: Date.now(),
      kind: 'tool_call',
      tool_name,
      payload: tool_input,
    };
    setToolLog((prev) => [...prev, entry].slice(-30));
  });

  useAgentRoomEvent('tool_response', ({ tool_name, tool_output }) => {
    const entry: ToolLogEntry = {
      ts: Date.now(),
      kind: 'tool_response',
      tool_name,
      payload: tool_output,
    };
    setToolLog((prev) => [...prev, entry].slice(-30));
  });

  // ---- Client-side tool round-trip.
  // The agent server fires `on_client_side_tool_calls` as a notification.
  // We run our handlers and emit `client_side_tool_responses` as a fresh
  // call — there's no JSON-RPC response on the same id.
  const agentRoomStore = useAgentRoomStore();
  useAgentRoomEvent('on_client_side_tool_calls', async ({ tool_calls }) => {
    const tool_responses: ClientSideToolResponse[] = [];
    for (const call of tool_calls) {
      const callEntry: ToolLogEntry = {
        ts: Date.now(),
        kind: 'client_side_tool_call',
        tool_name: call.tool_name,
        payload: call.tool_input,
      };
      setToolLog((prev) => [...prev, callEntry].slice(-30));
      try {
        const handler = CLIENT_SIDE_TOOLS[call.tool_name];
        const response = handler
          ? await handler(call.tool_input ?? {})
          : JSON.stringify({ error: `No handler for '${call.tool_name}'` });
        tool_responses.push({ tool_call_id: call.tool_call_id, response });
        const responseEntry: ToolLogEntry = {
          ts: Date.now(),
          kind: 'client_side_tool_response',
          tool_name: call.tool_name,
          payload: response,
        };
        setToolLog((prev) => [...prev, responseEntry].slice(-30));
      } catch (err) {
        const response = JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        });
        tool_responses.push({ tool_call_id: call.tool_call_id, response });
      }
    }

    try {
      await agentRoomStore.getState().send('client_side_tool_responses', { tool_responses });
    } catch (err) {
      console.error('[example] Failed to send client_side_tool_responses', err);
    }
  });

  // ---- Start / stop
  const onStart = useCallback(async () => {
    if (!contextId.trim() || !accessToken.trim()) {
      window.alert('Please provide both a contextId and an accessToken.');
      return;
    }
    localStorage.setItem('aj.contextId', contextId.trim());
    localStorage.setItem('aj.accessToken', accessToken.trim());
    setAiMessages([]);
    setUserMessages([]);
    setCurrentDetectedSpeech('');
    setCurrentlySpeakingSentenceId(null);
    setAgentStatus('connecting');
    setCalibrationStatus('');
    setToolLog([]);
    currentUserMessageId.current = null;
    userMsgCounter.current = 0;
    try {
      await initialize(contextId.trim(), accessToken.trim());
    } catch (err) {
      console.error('[example] initialize failed', err);
      window.alert(`Failed to connect: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [contextId, accessToken, initialize]);

  const onStop = useCallback(() => {
    disconnect();
    setAgentStatus('idle');
    setCalibrationStatus('');
    setCurrentlySpeakingSentenceId(null);
  }, [disconnect]);

  const onDeviceChange = useCallback(
    async (deviceId: string) => {
      try {
        await setAudioDevice(deviceId);
      } catch (err) {
        console.error('[example] setAudioDevice failed', err);
      }
    },
    [setAudioDevice],
  );

  return (
    <div className="container">
      <header>
        <h1>@ajentify/voice — example</h1>
        <p className="sub">Pure WebRTC transport. All UI state below is built in the example app from raw data-channel events.</p>
      </header>

      <section className="card">
        <h2>Connection</h2>
        <div className="row">
          <label>
            Context ID
            <input
              value={contextId}
              onChange={(e) => setContextId(e.target.value)}
              placeholder="room / context id"
              disabled={isConnected || isConnecting}
            />
          </label>
          <label>
            Access token
            <input
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="Authorization header value"
              type="password"
              disabled={isConnected || isConnecting}
            />
          </label>
        </div>
        <div className="row">
          <button onClick={onStart} disabled={isConnected || isConnecting}>
            {isConnecting ? 'Connecting…' : 'Start call'}
          </button>
          <button onClick={onStop} disabled={!isConnected && !isConnecting}>
            End call
          </button>
          <button onClick={toggleMute} disabled={!isConnected}>
            {audioMuted ? 'Unmute' : 'Mute'}
          </button>
        </div>

        <div className="row">
          <label>
            Audio input
            <select
              value={selectedAudioDevice?.deviceId ?? ''}
              onChange={(e) => onDeviceChange(e.target.value)}
              disabled={audioDevices.length === 0}
            >
              {audioDevices.length === 0 && <option value="">No devices yet</option>}
              {audioDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || d.deviceId}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="badges">
          <span className={`badge ${isConnected ? 'on' : ''}`}>data channel: {isConnected ? 'open' : 'closed'}</span>
          <span className="badge">agent: {agentStatus}</span>
          {calibrationStatus && <span className="badge">calibration: {calibrationStatus}</span>}
          <span className={`badge ${isUserSpeaking ? 'on' : ''}`}>user speaking: {isUserSpeaking ? 'yes' : 'no'}</span>
        </div>
      </section>

      <section className="card">
        <h2>You said</h2>
        {currentDetectedSpeech && (
          <p className="active-detection">…{currentDetectedSpeech}</p>
        )}
        <ul className="message-list">
          {userMessages.map((m) => (
            <li key={m.id}>{m.text || '…'}</li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Agent said</h2>
        <ul className="message-list">
          {aiMessages.map((m) => (
            <li
              key={m.sentence_id}
              className={currentlySpeakingSentenceId === m.sentence_id ? 'active' : ''}
            >
              {m.sentence}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Tool activity</h2>
        <p className="sub">Server-side `tool_call` / `tool_response` events plus the client-side tool round-trip.</p>
        <ul className="tool-log">
          {toolLog.map((e, i) => (
            <li key={i} className={`tool-${e.kind}`}>
              <code>{e.kind}</code> <strong>{e.tool_name}</strong>
              <pre>{typeof e.payload === 'string' ? e.payload : JSON.stringify(e.payload, null, 2)}</pre>
            </li>
          ))}
          {toolLog.length === 0 && <li className="empty">no tool activity yet</li>}
        </ul>
        <p className="sub">
          Client-side tools registered in this example: <code>get_local_time</code>,{' '}
          <code>show_alert</code>.
        </p>
      </section>

      <ClientSideToolDemoSender />
      <EndpointsConfig />
    </div>
  );
}

/**
 * Endpoint config panel — lets the dev override the signaling / agent
 * server URLs without an env file. Changes are persisted in
 * localStorage and require a page reload to take effect (the provider
 * is built once on mount).
 */
function EndpointsConfig() {
  const config = useAjentifyVoiceConfig();
  const [stored, setStored] = useState(() => loadEndpointConfig());
  const [signaling, setSignaling] = useState(
    stored.signalingServerUrl ?? config.signalingServerUrl ?? DEFAULT_SIGNALING_SERVER_URL,
  );
  const [agent, setAgent] = useState(
    stored.agentServerUrl ?? config.agentServerUrl ?? DEFAULT_AGENT_SERVER_URL,
  );

  return (
    <section className="card">
      <h2>Endpoints</h2>
      <p className="sub">URLs the provider was built with. Changes require a reload.</p>
      <div className="row">
        <label>
          Signaling server URL
          <input value={signaling} onChange={(e) => setSignaling(e.target.value)} />
        </label>
        <label>
          Agent server URL
          <input value={agent} onChange={(e) => setAgent(e.target.value)} />
        </label>
      </div>
      <div className="row">
        <button
          onClick={() => {
            saveEndpointConfig({ signalingServerUrl: signaling, agentServerUrl: agent });
            setStored({ signalingServerUrl: signaling, agentServerUrl: agent });
            window.location.reload();
          }}
        >
          Save &amp; reload
        </button>
      </div>
    </section>
  );
}

/**
 * Optional helper that lets you manually fire a `client_side_tool_responses`
 * message (useful for testing without round-tripping through the agent).
 */
function ClientSideToolDemoSender() {
  const isConnected = useAgentRoom((s) => s.isConnected);
  const agentRoomStore = useAgentRoomStore();
  const [busy, setBusy] = useState(false);
  return (
    <section className="card">
      <h2>Send raw RPC</h2>
      <p className="sub">Useful while debugging — emit a synthetic client_side_tool_responses payload.</p>
      <button
        disabled={!isConnected || busy}
        onClick={async () => {
          setBusy(true);
          try {
            const tool_responses: ClientSideToolResponse[] = [
              { tool_call_id: 'manual-test', response: JSON.stringify({ ok: true, debug: true }) },
            ];
            await agentRoomStore.getState().send('client_side_tool_responses', { tool_responses });
          } catch (err) {
            console.error(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        Emit test client_side_tool_responses
      </button>
    </section>
  );
}

export type { ClientSideToolCall };
