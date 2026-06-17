/**
 * Tiny helper for the example app: lets us flip signaling / agent
 * server URLs at runtime without an env file. Persisted in localStorage
 * so the page reloads pick the same endpoints up.
 */
const STORAGE_KEY = 'ajentify-voice-example.endpoints';

export interface EndpointConfig {
  signalingServerUrl?: string;
  agentServerUrl?: string;
}

export function loadEndpointConfig(): EndpointConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as EndpointConfig) : {};
  } catch {
    return {};
  }
}

export function saveEndpointConfig(cfg: EndpointConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function clearEndpointConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}
