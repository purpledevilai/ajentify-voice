import { uuidv4 } from './uid';

interface JSONRPCResponse {
  id: string;
  result: Record<string, any>;
}

export type JSONRPCHandler = (params: Record<string, any>) => any | Promise<any>;

/**
 * Tiny JSON-RPC layer that runs on top of an arbitrary string-based
 * transport. Used over the WebRTC data channel for agent <-> client
 * notifications and calls.
 *
 * Differences vs. the rooms package version:
 * - Multiple subscribers per method (broadcast); handler return values
 *   are ignored — the package treats every incoming method as a
 *   notification. If the message arrives with an `id` (server expected
 *   an ack), we auto-reply with `{}` after all subscribers ran so the
 *   protocol never hangs.
 * - No `uuid` package dependency; uses {@link uuidv4} internally.
 * - `await_response` calls poll with `setTimeout` and tear down cleanly
 *   on timeout.
 */
export class JSONRPCPeer {
  sender: (message: string) => void;
  responseQueue: Record<string, JSONRPCResponse | null> = {};
  handlerRegistry: Record<string, Set<JSONRPCHandler>> = {};

  constructor(sender: (message: string) => void) {
    this.sender = sender;
  }

  /**
   * Subscribe a handler to an incoming method. Multiple subscribers are
   * supported; all of them run for each delivery. Returns an unsubscribe
   * function for convenience.
   */
  on = (method: string, handler: JSONRPCHandler): (() => void) => {
    let set = this.handlerRegistry[method];
    if (!set) {
      set = new Set();
      this.handlerRegistry[method] = set;
    }
    set.add(handler);
    return () => this.off(method, handler);
  };

  off = (method: string, handler: JSONRPCHandler): void => {
    const set = this.handlerRegistry[method];
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) delete this.handlerRegistry[method];
  };

  /**
   * Send a JSON-RPC call over the wire.
   *
   * @param method        Method name.
   * @param params        Method params.
   * @param awaitResponse If true, generate an id and resolve when the
   *                      matching response arrives.
   * @param timeoutMs     Response timeout (only used when awaiting).
   */
  call = async (
    method: string,
    params: Record<string, any>,
    awaitResponse: boolean = false,
    timeoutMs: number = 5000
  ): Promise<Record<string, any> | void> => {
    const id = awaitResponse ? uuidv4() : null;

    const message = JSON.stringify({ method, params, id });
    this.sender(message);

    if (!awaitResponse || id === null) {
      return;
    }

    this.responseQueue[id] = null;

    const waitInterval = 50;
    let elapsed = 0;
    let response: JSONRPCResponse | null = null;
    while (elapsed < timeoutMs) {
      const current = this.responseQueue[id] as JSONRPCResponse | null | undefined;
      if (current) {
        response = current;
        break;
      }
      elapsed += waitInterval;
      await new Promise((resolve) => setTimeout(resolve, waitInterval));
    }

    delete this.responseQueue[id];

    if (!response) {
      throw new Error(`Timeout waiting for response to ${method}`);
    }

    if (response.result && (response.result as any).error) {
      throw new Error(
        `Error in response to ${method}: ${(response.result as any).error}`
      );
    }

    return response.result;
  };

  /**
   * Handle a raw inbound transport message. Routes JSON-RPC requests to
   * subscribers and JSON-RPC responses to any awaiting `call(...)`.
   */
  handleMessage = async (message: string): Promise<void> => {
    let parsed: any;
    try {
      parsed = JSON.parse(message);
    } catch (e) {
      console.error('[JSONRPCPeer] Error parsing message', e, message);
      return;
    }

    // Requests / notifications
    if (parsed && typeof parsed.method === 'string') {
      const handlers = this.handlerRegistry[parsed.method];
      const params = parsed.params ?? {};

      if (handlers && handlers.size > 0) {
        const results = await Promise.allSettled(
          Array.from(handlers).map((h) => Promise.resolve().then(() => h(params)))
        );
        for (const r of results) {
          if (r.status === 'rejected') {
            console.error(`[JSONRPCPeer] Subscriber threw for '${parsed.method}':`, r.reason);
          }
        }
      } else {
        // Silent: this is a transport — unknown methods aren't fatal.
        // The consuming app can log if it cares.
      }

      // If the caller expected a response (id set), reply with `{}` so
      // we never block their `await call(...)`. Handler return values
      // are intentionally ignored — see package docs.
      if (parsed.id) {
        try {
          this.sender(JSON.stringify({ id: parsed.id, result: {} }));
        } catch (e) {
          console.error('[JSONRPCPeer] Failed to auto-ack request', e);
        }
      }
      return;
    }

    // Responses
    if (parsed && parsed.id && parsed.id in this.responseQueue) {
      this.responseQueue[parsed.id] = parsed as JSONRPCResponse;
      return;
    }

    // Otherwise: untracked id (timed out, foreign, etc.) — ignore.
  };
}
