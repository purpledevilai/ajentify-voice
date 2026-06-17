/**
 * Default URLs for the signaling server and agent server. These can be
 * overridden via the `AjentifyVoiceConfig` passed to the provider.
 */
export const DEFAULT_SIGNALING_SERVER_URL =
  'wss://room-signaling-server.prod.rooms.ajentify.com';
export const DEFAULT_AGENT_SERVER_URL = 'https://agent.ajentify.com';

/**
 * One client-side tool call as delivered by the agent server inside an
 * `on_client_side_tool_calls` notification.
 */
export interface ClientSideToolCall {
  tool_call_id: string;
  tool_name: string;
  tool_input: Record<string, any>;
}

/**
 * One client-side tool response — what the consumer sends back via
 * `agentRoom.send('client_side_tool_responses', { tool_responses })`.
 */
export interface ClientSideToolResponse {
  tool_call_id: string;
  response: string;
}

/**
 * Strongly-typed payload shape for every data-channel event emitted by
 * the agent server. Names are lifted directly from the calls in
 * `ConversationOrchestrator.py`.
 *
 * All entries are notifications (no JSON-RPC `id`, no response expected
 * on the same id). For methods that involve a response, see the
 * "Methods you can send" section in the package README.
 */
export interface AgentDataChannelEvents {
  data_channel_connection_status: { status: 'connected' | 'disconnected' | string };
  calibration_status: { status: 'started' | 'complete' | string };
  agent_status: {
    status: 'waking_up' | 'calibrating' | 'ready' | 'error' | string;
    message?: string;
  };

  is_speaking_status: { is_speaking: boolean };
  speech_detected: { text: string };
  no_speech_detected: {};

  ai_sentence: { sentence: string; sentence_id: number };
  is_speaking_sentence: { sentence_id: number };
  stoped_speaking: {};
  agent_finished_speaking: {};

  interruption: { ai_said: string | null; human_said: string };

  /** Server-side tool observability — fire-and-forget. */
  tool_call: { tool_id: string; tool_name: string; tool_input: any };
  tool_response: { tool_id: string; tool_name: string; tool_output: any };

  /**
   * Client-side tool round-trip: server emits this as a notification.
   * Consumers run their handlers and respond via
   * `agentRoom.send('client_side_tool_responses', { tool_responses })`.
   */
  on_client_side_tool_calls: {
    tool_calls: ClientSideToolCall[];
    response_id: string;
  };

  on_events: { events: any[]; response_id: string };

  room_connection_status: { status: string };
  token_streaming_service_connection_status: { status: string };
  connection_status: { status: string };
}

export type AgentDataChannelEventName = keyof AgentDataChannelEvents;
