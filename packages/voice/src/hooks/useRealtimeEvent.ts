'use client';

import { useEffect, useRef } from 'react';
import { useAjentifyVoiceStores } from './useAjentifyVoice';
import type { RealtimeEventName, RealtimeEvents } from '../stores/realtimeStore';

/**
 * Convenience hook around `realtime.on(event, handler)` that hooks into
 * the React lifecycle: subscribes on mount, unsubscribes on unmount.
 * The latest handler closure is captured in a ref so consumers don't
 * have to `useCallback` everything they pass in.
 */
export function useRealtimeEvent<E extends RealtimeEventName>(
  event: E,
  handler: (params: RealtimeEvents[E]) => void | Promise<void>,
): void {
  const stores = useAjentifyVoiceStores();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const stable = (params: RealtimeEvents[E]) => handlerRef.current(params);
    const off = stores.realtime.getState().on(event, stable);
    return off;
  }, [event, stores]);
}
