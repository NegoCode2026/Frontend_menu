import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Solo usuarios autenticados. Revalida la sesión contra el backend
 * (cookies HttpOnly): si la cookie murió, expulsa a /login aunque
 * quede caché local. Sin red, se mantiene la sesión local.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.validateSession().pipe(
    map((ok) => (ok ? true : router.createUrlTree(['/login']))),
    catchError(() => of(true)),
  );
};