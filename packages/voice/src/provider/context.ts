import { createContext } from 'react';
import type { AjentifyVoiceStores } from '../stores/types';
import type { AjentifyVoiceConfig } from './AjentifyVoiceProvider';

export interface AjentifyVoiceContextValue {
  stores: AjentifyVoiceStores;
  config: AjentifyVoiceConfig;
}

export const AjentifyVoiceContext = createContext<AjentifyVoiceContextValue | null>(null);
