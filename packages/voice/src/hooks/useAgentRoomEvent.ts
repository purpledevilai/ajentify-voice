'use client';

import { useEffect, useRef } from 'react';
import { useAjentifyVoiceStores } from './useAjentifyVoice';
import type { AgentDataChannelEventName, AgentDataChannelEvents } from '../types';

/**
 * Convenience hook around `agentRoom.on(event, handler)` that hooks into
 * the React lifecycle: subscribes on mount, unsubscribes on unmount.
 * The latest handler closure is captured in a ref so consumers don't
 * have to `useCallback` everything they pass in.
 */
export function useAgentRoomEvent<E extends AgentDataChannelEventName>(
  event: E,
  handler: (params: AgentDataChannelEvents[E]) => void | Promise<void>
): void {
  const stores = useAjentifyVoiceStores();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const stable = (params: AgentDataChannelEvents[E]) => handlerRef.current(params);
    const off = stores.agentRoom.getState().on(event, stable);
    return off;
  }, [event, stores]);
}
