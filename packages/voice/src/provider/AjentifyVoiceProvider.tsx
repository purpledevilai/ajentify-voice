'use client';

import { useEffect, useMemo, type ReactNode } from 'react';
import { createStores } from '../stores/createStores';
import type { AjentifyVoiceStores } from '../stores/types';
import { AjentifyVoiceContext } from './context';

/**
 * URL-only configuration. No callbacks, no observability hooks — those
 * are exposed via the agent-room store's `on(...)` API.
 */
export interface AjentifyVoiceConfig {
  /** Override the signaling server WebSocket URL. */
  signalingServerUrl?: string;
  /** Override the agent server HTTP URL (used for `/invite-agent`). */
  agentServerUrl?: string;
}

export interface AjentifyVoiceProviderProps {
  config?: AjentifyVoiceConfig;
  children: ReactNode;
}

/**
 * The single React entry point developers wrap their app in. Owns one
 * instance of the voice stores and supplies them via React context.
 *
 * The provider is created **once** per mount and never re-built when
 * `config` changes (you should not change URLs at runtime). To swap
 * configs, unmount and remount.
 */
export function AjentifyVoiceProvider({
  config,
  children,
}: AjentifyVoiceProviderProps): JSX.Element {
  const resolvedConfig: AjentifyVoiceConfig = config ?? {};

  const stores: AjentifyVoiceStores = useMemo(() => {
    return createStores({
      signalingServerUrl: resolvedConfig.signalingServerUrl,
      agentServerUrl: resolvedConfig.agentServerUrl,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tear everything down on unmount.
  useEffect(() => {
    return () => {
      try {
        stores.agentRoom.getState().disconnect();
      } catch (e) {
        console.warn('[AjentifyVoiceProvider] disconnect on unmount failed', e);
      }
      try {
        stores.mediaDevices.getState()._teardown();
      } catch (e) {
        console.warn('[AjentifyVoiceProvider] mediaDevices teardown failed', e);
      }
    };
  }, [stores]);

  const value = useMemo(() => ({ stores, config: resolvedConfig }), [stores, resolvedConfig]);

  return (
    <AjentifyVoiceContext.Provider value={value}>{children}</AjentifyVoiceContext.Provider>
  );
}
