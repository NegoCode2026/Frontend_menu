import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay, timeout } from 'rxjs/operators';
import { TENANT_BACKENDS, TENANT_BACKENDS_URL, DEFAULT_BACKEND } from '../data/tenant-backends.data';

const STORAGE_KEY = 'tavita_backend_url';

/**
 * Resuelve a qué docker hablar según el slug.
 * - Pública (/menu/:slug, pedidos): pin al backend del slug.
 * - Admin/login: usa el backend pineado o el default (/api proxy Vercel).
 * Persiste en localStorage para que la sesión (cookies del docker que
 * autenticó) siga yendo al mismo docker tras recargar.
 *
 * Registry remoto (TENANT_BACKENDS_URL): se carga una vez en background;
 * agregar un cliente = editar ese JSON, sin redeploy. El horneado queda
 * como fallback si el remoto falla.
 */
@Injectable({ providedIn: 'root' })
export class TenantBackendService {
  private readonly backendSignal = signal<string>(this.restore());
  private remoteCache: Record<string, string> = {};
  private remote$: Observable<Record<string, string>> | null = null;

  readonly backend = this.backendSignal.asReadonly();

  constructor(private http: HttpClient) {}

  /** Base actual para ApiService (puede ser '/api' o 'https://docker-cliente') */
  apiBase(): string {
    return this.backendSignal() || DEFAULT_BACKEND;
  }

  /** Backend registrado para un slug (horneado + remoto cacheado), o null */
  backendFor(slug: string): string | null {
    if (!slug) return null;
    const key = slug.trim().toLowerCase();
    return this.remoteCache[key] ?? TENANT_BACKENDS[key] ?? null;
  }

  /**
   * Carga el registry remoto UNA vez (cacheado + compartido).
   * Nunca falla: timeout 4s, error => mapa vacío (sigue el horneado).
   */
  ensureLoaded(): Observable<void> {
    if (!TENANT_BACKENDS_URL || this.remote$) {
      if (!TENANT_BACKENDS_URL) return of(undefined);
      return (this.remote$ as Observable<Record<string, string>>).pipe(map(() => undefined));
    }
    this.remote$ = this.http.get<Record<string, string>>(TENANT_BACKENDS_URL).pipe(
      timeout(4000),
      map((json) => this.sanitize(json)),
      catchError(() => of({})),
      shareReplay(1),
    );
    // Calienta la caché en background para el próximo pinFor síncrono
    this.remote$.subscribe((map) => (this.remoteCache = map));
    return this.remote$.pipe(map(() => undefined));
  }

  /** Fija el backend del slug (llamar al entrar a /menu/:slug o crear pedido) */
  pinFor(slug: string): string {
    const url = this.backendFor(slug);
    if (url) this.set(url);
    return this.apiBase();
  }

  set(url: string): void {
    this.backendSignal.set(url);
    try {
      if (url && url !== DEFAULT_BACKEND) localStorage.setItem(STORAGE_KEY, url);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  reset(): void {
    this.set(DEFAULT_BACKEND);
  }

  private sanitize(json: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (json && typeof json === 'object') {
      for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
        if (typeof v === 'string' && /^https?:\/\//.test(v.trim())) {
          out[k.trim().toLowerCase()] = v.trim().replace(/\/$/, '');
        }
      }
    }
    return out;
  }

  private restore(): string {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && /^https?:\/\//.test(saved)) return saved;
    } catch {}
    // Si la URL ya trae /menu/:slug (deep link o QR), resuelve directo (horneado)
    try {
      const m = window.location.pathname.match(/\/menu\/([^\/?#]+)/);
      if (m) {
        const url = TENANT_BACKENDS[decodeURIComponent(m[1]).trim().toLowerCase()];
        if (url) return url;
      }
    } catch {}
    return DEFAULT_BACKEND;
  }
}
