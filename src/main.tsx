import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './ui/theme.css';
window.addEventListener('error', (e) => { document.title = 'ERR: ' + String((e.error && (e.error.stack || e.error.message)) || e.message).slice(0, 500); });
window.addEventListener('unhandledrejection', (e) => { document.title = 'REJ: ' + String((e.reason && (e.reason.stack || e.reason.message)) || e.reason).slice(0, 500); });


createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
