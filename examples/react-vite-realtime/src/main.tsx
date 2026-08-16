import React from 'react';
import ReactDOM from 'react-dom/client';
import { AjentifyVoiceProvider } from '@ajentify/voice';
import { App } from './App';
import './index.css';

const tssUrl = localStorage.getItem('aj-realtime.tssUrl') || undefined;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AjentifyVoiceProvider
      config={{
        tokenStreamingServerUrl: tssUrl,
      }}
    >
      <App />
    </AjentifyVoiceProvider>
  </React.StrictMode>,
);
