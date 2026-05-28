import React from 'react';
import ReactDOM from 'react-dom/client';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import App from './App.jsx';
import de from './locales/de.json';
import en from './locales/en.json';
import './index.css';

document.body.classList.add('theme-dark');
document.documentElement.classList.add('theme-dark');
localStorage.setItem('theme', 'dark');

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
      .then((reg) => console.log('Service Worker registered successfully:', reg.scope))
      .catch((err) => console.error('Service Worker registration failed:', err));
  });
}
