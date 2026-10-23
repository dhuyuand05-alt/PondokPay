import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { PwaInstallProvider } from './ui.jsx';
import './styles.css';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((error) => {
    console.error('PWA service worker registration failed:', error);
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <PwaInstallProvider>
        <App />
      </PwaInstallProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
