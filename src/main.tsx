import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './ui/theme.css';
window.addEventListener('error', (e) => { document.title = 'ERR: ' + String((e.error && (e.error.stack || e.error.message)) || e.message).slice(0, 500); });
window.addEventListener('unhandledrejection', (e) => { document.title = 'REJ: ' + String((e.reason && (e.reason.stack || e.reason.message)) || e.reason).slice(0, 500); });


// Image soft-appear: capture-phase load/error listener covers every <img>,
// including ones rendered before React attaches or without local handlers.
const markImg = (e: Event) => { const t = e.target; if (t instanceof HTMLImageElement) t.classList.add('img-in'); };
document.addEventListener('load', markImg, true);
document.addEventListener('error', markImg, true);

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
