import { useCallback, useState } from 'react';
import {
  useRealtimeSession,
  useRealtimeStore,
  useRealtimeEvent,
  DEFAULT_TOKEN_STREAMING_SERVER_URL,
  type ClientSideToolCall,
} from '@ajentify/voice';

const API_BASE = 'https://api.ajentify.com';

interface ToolLogEntry {
  ts: number;
  kind: 'tool_call' | 'tool_response' | 'client_side_tool_call' | 'client_side_tool_response';
  tool_name: string;
  payload: any;
}

/**
 * Demo client-side tools. If the agent calls one of these, we execute
 * it automatically and send the response back.
 */
const CLIENT_SIDE_TOOLS: Record<string, (input: Record<string, any>) => Promise<string> | string> = {
  get_local_time: () => {
    return JSON.stringify({
      iso: new Date().toISOString(),
      local: new Date().toLocaleString(),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  },
  show_alert: (input) => {
    const message = (input?.message as string | undefined) ?? 'Agent says hello!';
    window.alert(`[Agent] ${message}`);
    return JSON.stringify({ ok: true });
  },
};

export function App() {
  const [contextId, setContextId] = useState(() => localStorage.getItem('aj-realtime.contextId') ?? '');
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem('aj-realtime.accessToken') ?? '');

  const isConnecting = useRealtimeSession((s) => s.isConnecting);
  const isConnected = useRealtimeSession((s) => s.isConnected);
  const isMuted = useRealtimeSession((s) => s.isMuted);
  const transcript = useRealtimeSession((s) => s.transcript);

  const initialize = useRealtimeSession((s) => s.initialize);
  const disconnect = useRealtimeSession((s) => s.disconnect);
  const toggleMute = useRealtimeSession((s) => s.toggleMute);

  const [toolLog, setToolLog] = useState<ToolLogEntry[]>([]);

  const realtimeStore = useRealtimeStore();

  // Listen for tool call observability events
  useRealtimeEvent('on_tool_call', ({ tool_name, tool_input }) => {
    setToolLog((prev) => [...prev, { ts: Date.now(), kind: 'tool_call', tool_name, payload: tool_input }].slice(-30));
  });

  useRealtimeEvent('on_tool_response', ({ tool_name, tool_output }) => {
    setToolLog((prev) => [...prev, { ts: Date.now(), kind: 'tool_response', tool_name, payload: tool_output }].slice(-30));
  });

  // Handle client-side tool calls
  useRealtimeEvent('on_client_side_tool_calls', async ({ tool_calls }) => {
    const responses: { tool_call_id: string; response: string }[] = [];

    for (const call of tool_calls) {
      setToolLog((prev) => [...prev, {
        ts: Date.now(),
        kind: 'client_side_tool_call',
        tool_name: call.tool_name,
        payload: call.tool_input,
      }].slice(-30));

      const handler = CLIENT_SIDE_TOOLS[call.tool_name];
      let response: string;
      if (handler) {
        try {
          response = await handler(call.tool_input ?? {});
        } catch (err) {
          response = JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
        }
      } else {
        response = JSON.stringify({ error: `No handler for tool: ${call.tool_name}` });
      }

      responses.push({ tool_call_id: call.tool_call_id, response });

      setToolLog((prev) => [...prev, {
        ts: Date.now(),
        kind: 'client_side_tool_response',
        tool_name: call.tool_name,
        payload: response,
      }].slice(-30));
    }

    try {
      await realtimeStore.getState().send('client_side_tool_responses', { tool_responses: responses }, true, 10000);
    } catch (err) {
      console.error('[example] Failed to send client_side_tool_responses', err);
    }
  });

  const onStart = useCallback(async () => {
    if (!contextId.trim() || !accessToken.trim()) {
      window.alert('Please provide both a context ID and an access token.');
      return;
    }
    localStorage.setItem('aj-realtime.contextId', contextId.trim());
    localStorage.setItem('aj-realtime.accessToken', accessToken.trim());
    setToolLog([]);
    try {
      await initialize(contextId.trim(), accessToken.trim());
    } catch (err) {
      console.error('[example] initialize failed', err);
      window.alert(`Failed to connect: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [contextId, accessToken, initialize]);

  const onStop = useCallback(() => {
    disconnect();
  }, [disconnect]);

  return (
    <div className="container">
      <header>
        <h1>@ajentify/voice — Realtime Example</h1>
        <p className="sub">
          OpenAI Realtime API via TokenStreamingServer. Audio flows directly between
          browser and OpenAI via WebRTC. Tool calls are orchestrated by TSS.
        </p>
      </header>

      <QuickSetup
        disabled={isConnected || isConnecting}
        onCreated={(ctxId, token) => {
          setContextId(ctxId);
          setAccessToken(token);
          localStorage.setItem('aj-realtime.contextId', ctxId);
          localStorage.setItem('aj-realtime.accessToken', token);
        }}
      />

      <section className="card">
        <h2>Connection</h2>
        <div className="row">
          <label>
            Context ID
            <input
              value={contextId}
              onChange={(e) => setContextId(e.target.value)}
              placeholder="context id"
              disabled={isConnected || isConnecting}
            />
          </label>
          <label>
            Access token
            <input
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="Authorization token"
              type="password"
              disabled={isConnected || isConnecting}
            />
          </label>
        </div>
        <div className="row">
          <button onClick={onStart} disabled={isConnected || isConnecting}>
            {isConnecting ? 'Connecting…' : 'Start realtime call'}
          </button>
          <button onClick={onStop} disabled={!isConnected && !isConnecting}>
            End call
          </button>
          <button onClick={toggleMute} disabled={!isConnected}>
            {isMuted ? 'Unmute' : 'Mute'}
          </button>
        </div>
        <div className="badges">
          <span className={`badge ${isConnected ? 'on' : ''}`}>
            status: {isConnected ? 'connected' : isConnecting ? 'connecting' : 'disconnected'}
          </span>
          <span className={`badge ${isMuted ? '' : 'on'}`}>
            mic: {isMuted ? 'muted' : 'active'}
          </span>
        </div>
      </section>

      <section className="card">
        <h2>Agent transcript</h2>
        <p className="sub">Accumulated from <code>on_transcript_delta</code> events sent by TSS.</p>
        <div className="transcript-box">
          {transcript || <span className="empty">Waiting for agent to speak…</span>}
        </div>
      </section>

      <section className="card">
        <h2>Tool activity</h2>
        <p className="sub">Server-side and client-side tool calls routed through TSS.</p>
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
          Client-side tools: <code>get_local_time</code>, <code>show_alert</code>
        </p>
      </section>

      <EndpointsConfig />
    </div>
  );
}

function QuickSetup({
  disabled,
  onCreated,
}: {
  disabled: boolean;
  onCreated: (contextId: string, accessToken: string) => void;
}) {
  const [orgApiKey, setOrgApiKey] = useState(() => localStorage.getItem('aj-realtime.orgApiKey') ?? '');
  const [agentId, setAgentId] = useState(() => localStorage.getItem('aj-realtime.agentId') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCreate = useCallback(async () => {
    if (!orgApiKey.trim() || !agentId.trim()) {
      setError('Both API key and Agent ID are required.');
      return;
    }
    setBusy(true);
    setError(null);
    localStorage.setItem('aj-realtime.orgApiKey', orgApiKey.trim());
    localStorage.setItem('aj-realtime.agentId', agentId.trim());

    try {
      const ctxRes = await fetch(`${API_BASE}/context`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: orgApiKey.trim(),
        },
        body: JSON.stringify({ agent_id: agentId.trim() }),
      });
      if (!ctxRes.ok) throw new Error(`Create context failed (${ctxRes.status}): ${await ctxRes.text()}`);
      const ctxData = await ctxRes.json();
      const contextId: string = ctxData.context_id;

      const keyRes = await fetch(`${API_BASE}/generate-api-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: orgApiKey.trim(),
        },
        body: JSON.stringify({ type: 'client' }),
      });
      if (!keyRes.ok) throw new Error(`Generate API key failed (${keyRes.status}): ${await keyRes.text()}`);
      const keyData = await keyRes.json();
      const token: string = keyData.token;

      onCreated(contextId, token);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error('[QuickSetup]', err);
    } finally {
      setBusy(false);
    }
  }, [orgApiKey, agentId, onCreated]);

  return (
    <section className="card">
      <h2>Quick setup</h2>
      <p className="sub">Create a context and generate a client token for your realtime agent.</p>
      <div className="row">
        <label>
          Org API key
          <input
            value={orgApiKey}
            onChange={(e) => setOrgApiKey(e.target.value)}
            placeholder="Your Ajentify org API key"
            type="password"
            disabled={disabled || busy}
          />
        </label>
        <label>
          Agent ID (must use a realtime model)
          <input
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            placeholder="agent_abc123"
            disabled={disabled || busy}
          />
        </label>
      </div>
      <div className="row">
        <button onClick={onCreate} disabled={disabled || busy}>
          {busy ? 'Creating…' : 'Create context'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function EndpointsConfig() {
  const [tssUrl, setTssUrl] = useState(
    () => localStorage.getItem('aj-realtime.tssUrl') || DEFAULT_TOKEN_STREAMING_SERVER_URL,
  );

  return (
    <section className="card">
      <h2>Endpoints</h2>
      <p className="sub">Token streaming server URL. Changes require a reload.</p>
      <div className="row">
        <label>
          Token streaming server URL
          <input value={tssUrl} onChange={(e) => setTssUrl(e.target.value)} />
        </label>
      </div>
      <div className="row">
        <button
          onClick={() => {
            localStorage.setItem('aj-realtime.tssUrl', tssUrl);
            window.location.reload();
          }}
        >
          Save &amp; reload
        </button>
      </div>
    </section>
  );
}
