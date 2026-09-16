import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

const stripPrefix = (role: string): string => (role.startsWith('ROLE_') ? role.substring(5) : role);

/**
 * Restringe el acceso a rutas según los roles autorizados.
 * Ejemplo de uso en rutas: `canActivate: [roleGuard('SUPER_ADMIN')]`
 *
 * Las rutas tenant (dashboard, orders, restaurant, ...) solo admiten roles
 * de restaurante: el SUPER_ADMIN tiene restaurantId null y todos esos
 * endpoints responden 403. Si un superadmin cae aquí, va a su panel global.
 */
export const roleGuard = (...allowedRoles: string[]): CanActivateFn => {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (auth.isAuthenticated()) {
      const role = stripPrefix(auth.user()?.role ?? '');
      const allowed = allowedRoles.map(stripPrefix);
      if (role && allowed.includes(role)) {
        return true;
      }
      if (role === 'SUPER_ADMIN') {
        return router.createUrlTree(['/admin/super-admin/dashboard']);
      }
      return router.createUrlTree(['/admin/dashboard']);
    }

    return router.createUrlTree(['/login']);
  };
};
