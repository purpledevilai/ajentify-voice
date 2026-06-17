import React from 'react';
import ReactDOM from 'react-dom/client';
import { AjentifyVoiceProvider } from '@ajentify/voice';
import { App } from './App';
import { loadEndpointConfig } from './endpoints';
import './index.css';

const stored = loadEndpointConfig();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AjentifyVoiceProvider
      config={{
        signalingServerUrl: stored.signalingServerUrl,
        agentServerUrl: stored.agentServerUrl,
      }}
    >
      <App />
    </AjentifyVoiceProvider>
  </React.StrictMode>,
);
