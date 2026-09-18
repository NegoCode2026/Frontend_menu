import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

/** Overlay de diagnóstico: solo con ?debug en la URL. Muestra en pantalla
 *  cualquier error no capturado para diagnosticar sin abrir la consola. */
if (typeof window !== 'undefined' && window.location.search.includes('debug')) {
  const showError = (message: string) => {
    let box = document.getElementById('tavita-debug-errors');
    if (!box) {
      box = document.createElement('div');
      box.id = 'tavita-debug-errors';
      box.style.cssText =
        'position:fixed;left:8px;right:8px;bottom:8px;z-index:99999;background:#7f1d1d;color:#fff;' +
        'font:12px/1.5 monospace;padding:10px 12px;border-radius:10px;white-space:pre-wrap;max-height:40vh;overflow:auto;';
      document.body.appendChild(box);
    }
    box.textContent += message + '\n---\n';
  };
  window.addEventListener('error', (event) => {
    showError('ERROR: ' + (event.message || event.error));
  });
  window.addEventListener('unhandledrejection', (event) => {
    showError('PROMISE: ' + (event.reason?.message ?? event.reason));
  });
}

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
