'use client';

import { useContext } from 'react';
import { AjentifyVoiceContext, type AjentifyVoiceContextValue } from '../provider/context';
import type { AjentifyVoiceConfig } from '../provider/AjentifyVoiceProvider';
import type { AjentifyVoiceStores } from '../stores/types';

function useAjentifyVoiceInternal(): AjentifyVoiceContextValue {
  const value = useContext(AjentifyVoiceContext);
  if (!value) {
    throw new Error(
      '@ajentify/voice hooks must be used inside an <AjentifyVoiceProvider>.'
    );
  }
  return value;
}

/** Returns the raw stores bundle. */
export function useAjentifyVoiceStores(): AjentifyVoiceStores {
  return useAjentifyVoiceInternal().stores;
}

/** Returns the raw provider config (URLs). */
export function useAjentifyVoiceConfig(): AjentifyVoiceConfig {
  return useAjentifyVoiceInternal().config;
}
