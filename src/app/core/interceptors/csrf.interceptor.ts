import { HttpInterceptorFn } from '@angular/common/http';

/**
 * CSRF con doble envío (cookie XSRF-TOKEN + header X-XSRF-TOKEN) para
 * peticiones mutantes.
 *
 * El token se toma de la respuesta de GET /auth/csrf (almacenado en memoria
 * tras el bootstrap, ver setCsrfToken) o, como fallback, de la cookie
 * XSRF-TOKEN. Guardar el token en memoria es más robusto que depender
 * exclusivamente de document.cookie (que puede no estar disponible si el
 * bootstrap CSRF aún no se completó en esa pestaña).
 */
let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export const csrfInterceptor: HttpInterceptorFn = (req, next) => {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next(req);
  }
  const token = csrfToken ?? readCookie('XSRF-TOKEN');
  if (!token) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { 'X-XSRF-TOKEN': token } }));
};

function readCookie(name: string): string | null {
  const match = document.cookie.match(`(?:^|;\\s*)${name}=([^;]*)`);
  return match ? decodeURIComponent(match[1]) : null;
}