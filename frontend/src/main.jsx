import React from 'react';
import ReactDOM from 'react-dom/client';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import App from './App.jsx';
import de from './locales/de.json';
import en from './locales/en.json';
import './index.css';

const savedTheme = 'dark';
document.body.classList.add('theme-dark', 'dark');
document.documentElement.classList.add('theme-dark', 'dark');
localStorage.setItem('theme', 'dark');

const setViewportHeight = () => {
  const vh = Math.round(window.innerHeight || 0);
  document.documentElement.style.setProperty('--app-vh', `${vh}px`);
};
setViewportHeight();
window.addEventListener('resize', setViewportHeight);

i18n.use(initReactI18next).init({
  resources: { de: { translation: de }, en: { translation: en } },
  lng: localStorage.getItem('locale') || 'de',
  fallbackLng: 'de',
  interpolation: { escapeValue: false }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const basePath = import.meta.env.BASE_URL || '/';
    const swUrl = `${basePath.endsWith('/') ? basePath : basePath + '/'}sw.js`;
    navigator.serviceWorker.register(swUrl)
      .catch(() => {
        // Keep startup quiet when the app is served without the PWA worker.
      });
  });
}
