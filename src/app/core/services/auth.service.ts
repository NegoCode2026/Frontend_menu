import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthResponse, TokenUser } from '../models/models';
import { setCsrfToken } from '../interceptors/csrf.interceptor';

const LOGIN_AT_KEY = 'tavita_login_at';
/** Sesión máxima: al día siguiente se pide iniciar sesión de nuevo. */
const SESSION_MAX_AGE_MS = 24 * 3600 * 1000;

/**
 * Estado de autenticación basado en signals, SIN tokens en localStorage:
 * los JWT viven en cookies HttpOnly gestionadas por el backend y el
 * usuario autenticado se mantiene en memoria (recuperable con /auth/me).
 *
 * Roles canónicos SIN prefijo ROLE_: SUPER_ADMIN, RESTAURANT_ADMIN, RESTAURANT_USER.
 * normalizeRole() elimina un eventual prefijo ROLE_ heredado de cachés antiguas.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly userSignal = signal<TokenUser | null>(null);
  readonly user = this.userSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.userSignal() !== null);
  readonly isRestaurantUser = computed(() => this.userSignal()?.restaurantId != null);

  constructor(
    private api: ApiService,
    private router: Router,
  ) {}

  /**
   * Bootstrap al arrancar la app: establece la cookie CSRF y, si hay sesión
   * activa en cookies, restaura el usuario. Nunca falla el arranque.
   */
  initialize(): Observable<null> {
    if (this.isLoginExpired()) {
      this.clearSession();
      return of(null);
    }
    return this.bootstrapCsrf().pipe(
      switchMap(() => this.restoreSession()),
      catchError(() => of(null)),
      map(() => null),
    );
  }

  /** Guarda el momento del login para exigir re-login cada 24h. */
  private stampLogin(): void {
    try { localStorage.setItem(LOGIN_AT_KEY, String(Date.now())); } catch {}
  }

  /** true si pasaron más de 24h desde el login: toca iniciar sesión de nuevo. */
  private isLoginExpired(): boolean {
    try {
      const at = Number(localStorage.getItem(LOGIN_AT_KEY) ?? 0);
      return !(at > 0) || Date.now() - at >= SESSION_MAX_AGE_MS;
    } catch {
      return false;
    }
  }
  bootstrapCsrf(): Observable<string> {    return this.api.get<string>('/auth/csrf').pipe(
      tap((token) => setCsrfToken(token)),
      catchError(() => {
        setCsrfToken(null);
        return of('');
      }),
    );
  }

  login(email: string, password: string): Observable<TokenUser> {
    return this.bootstrapCsrf().pipe(
      switchMap(() => this.api.post<AuthResponse>('/auth/login', { email, password })),
      tap((r) => {
        const user = this.normalizeUser(r.user);
        this.userSignal.set(user);
        try { localStorage.setItem('tavita_user', JSON.stringify(user)); } catch {}
        this.stampLogin();
      }),
      map((r) => this.normalizeUser(r.user)),
    );
  }

  register(payload: {
    name: string;
    email: string;
    password: string;
    restaurantName: string;
    slug: string;
  }): Observable<TokenUser> {
    return this.bootstrapCsrf().pipe(
      switchMap(() => this.api.post<AuthResponse>('/auth/register', payload)),
      tap((r) => {
        const user = this.normalizeUser(r.user);
        this.userSignal.set(user);
        try { localStorage.setItem('tavita_user', JSON.stringify(user)); } catch {}
        this.stampLogin();
      }),
      map((r) => this.normalizeUser(r.user)),
    );
  }

  /** Renueva los tokens con la cookie refresh_token (rotación server-side). */
  refresh(): Observable<TokenUser | null> {
    return this.bootstrapCsrf().pipe(
      switchMap(() => this.api.post<AuthResponse>('/auth/refresh')),
      tap((r) => this.userSignal.set(this.normalizeUser(r.user))),
      map((r) => this.normalizeUser(r.user)),
      catchError(() => of(null)),
    );
  }

  logout(): Observable<void> {
    return this.authLogout().pipe(
      tap(() => this.clearSession()),
      catchError(() => {
        this.clearSession();
        return of(undefined);
      }),
    );
  }

  /** Cierra la sesión en TODOS los dispositivos (revoca refresh tokens). */
  logoutAll(): Observable<void> {
    return this.bootstrapCsrf().pipe(
      switchMap(() => this.api.post<void>('/auth/logout-all')),
      tap(() => this.clearSession()),
      catchError(() => {
        this.clearSession();
        return of(undefined);
      }),
    );
  }

  private authLogout(): Observable<void> {
    return this.bootstrapCsrf().pipe(
      switchMap(() => this.api.post<void>('/auth/logout')),
    );
  }

  /** Cierra sesión y redirige a /login (no requiere suscripción del llamante).
   *  Limpia el estado local ANTES de navegar para que guestGuard no lo devuelva
   *  al panel; el revoke de las cookies en el backend ocurre en segundo plano. */
  forceLogout(): void {
    this.clearSession();
    this.router.navigate(['/login']);
    this.logout().subscribe();
  }

  /** Restaura la sesión llamando a /auth/me (cookies HttpOnly).
   *  401/403 = sesión muerta (cookies borradas o expiradas): se limpia
   *  SIN rescatar la caché. Solo un fallo de red (status 0) permite
   *  seguir con la caché para tolerar caídas del backend. */
  restoreSession(): Observable<TokenUser | null> {
    return this.api.get<TokenUser>('/auth/me').pipe(
      tap((user) => {
        const normalized = this.normalizeUser(user);
        this.userSignal.set(normalized);
        try { localStorage.setItem('tavita_user', JSON.stringify(normalized)); } catch {}
      }),
      map((user) => this.normalizeUser(user)),
      catchError((err: HttpErrorResponse) => {
        if (err.status === 401 || err.status === 403) {
          this.clearSession();
          return of(null);
        }
        try {
          const cached = localStorage.getItem('tavita_user');
          if (cached) {
            const user = this.normalizeUser(JSON.parse(cached));
            this.userSignal.set(user);
            return of(user);
          }
        } catch {}
        this.clearSession();
        return of(null);
      }),
    );
  }

  private lastValidation = 0;

  /** Valida la sesión contra el backend (máximo 1 vez por minuto,
   *  salvo `force`). 401/403 = fuera; error de red = se mantiene la sesión local. */
  validateSession(force = false): Observable<boolean> {
    if (this.isLoginExpired()) {
      this.clearSession();
      return of(false);
    }
    if (!this.isAuthenticated()) {
      return this.restoreSession().pipe(map((user) => user != null));
    }
    if (!force && Date.now() - this.lastValidation < 60000) {
      return of(true);
    }
    return this.api.get<TokenUser>('/auth/me').pipe(
      tap((user) => {
        this.lastValidation = Date.now();
        const normalized = this.normalizeUser(user);
        this.userSignal.set(normalized);
        try { localStorage.setItem('tavita_user', JSON.stringify(normalized)); } catch {}
      }),
      map(() => true),
      catchError((err: HttpErrorResponse) => {
        if (err.status === 401 || err.status === 403) {
          this.clearSession();
          return of(false);
        }
        return of(true);
      }),
    );
  }

  updateUser(user: TokenUser): void {
    const normalized = this.normalizeUser(user);
    this.userSignal.set(normalized);
    try { localStorage.setItem('tavita_user', JSON.stringify(normalized)); } catch {}
  }

  clearSession(): void {
    this.userSignal.set(null);
    try { localStorage.removeItem('tavita_user'); } catch {}
    try { localStorage.removeItem(LOGIN_AT_KEY); } catch {}
  }

  /** Rol canónico sin prefijo ROLE_ (migra cachés antiguas). */
  normalizeRole(role: string | null | undefined): string {
    if (!role) return '';
    return role.startsWith('ROLE_') ? role.substring(5) : role;
  }

  private normalizeUser(user: TokenUser): TokenUser {
    if (!user) return user;
    return { ...user, role: this.normalizeRole(user.role) };
  }

  readonly isSuperAdmin = computed(() => this.normalizeRole(this.userSignal()?.role) === 'SUPER_ADMIN');

  redirectToLogin(): void {
    this.clearSession();
    if (!this.router.url.startsWith('/login')) {
      this.router.navigate(['/login']);
    }
  }
}
