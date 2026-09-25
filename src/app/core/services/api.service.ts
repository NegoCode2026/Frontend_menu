import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse, Page } from '../models/models';
import { TenantBackendService } from './tenant-backend.service';

/**
 * Cliente HTTP de la API. Con withCredentials las cookies HttpOnly
 * (access_token/refresh_token/XSRF-TOKEN) se envían en cada petición,
 * como hace el navegador con el dominio del backend.
 *
 * Multi-docker: la base se resuelve vía TenantBackendService (pin por slug
 * o backend persistido del login). '/api' = proxy Vercel (default).
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(
    private http: HttpClient,
    private tenants: TenantBackendService,
  ) {}

  /** Base dinámica: '/api' o 'https://docker-cliente' según pin */
  get baseUrl(): string {
    return this.tenants.apiBase();
  }

  get<T>(path: string): Observable<T> {
    return this.http.get<ApiResponse<T>>(this.url(path), this.options()).pipe(map((r) => r.data));
  }

  post<T>(path: string, body?: unknown): Observable<T> {
    return this.http.post<ApiResponse<T>>(this.url(path), body, this.options()).pipe(map((r) => r.data));
  }

  put<T>(path: string, body?: unknown): Observable<T> {
    return this.http.put<ApiResponse<T>>(this.url(path), body, this.options()).pipe(map((r) => r.data));
  }

  patch<T>(path: string, body?: unknown): Observable<T> {
    return this.http.patch<ApiResponse<T>>(this.url(path), body, this.options()).pipe(map((r) => r.data));
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<ApiResponse<T>>(this.url(path), this.options()).pipe(map((r) => r.data));
  }

  raw<T>(path: string): Observable<T> {
    return this.http.get<T>(this.url(path), this.options());
  }

  /**
   * GET paginado: acepta Page<T> del backend nuevo o array plano del backend
   * antiguo y lo adapta a Page para no romper componentes durante el despliegue.
   */
  getPaged<T>(path: string, params?: HttpParams): Observable<Page<T>> {
    return this.http
      .get<ApiResponse<Page<T> | T[]>>(this.url(path), { ...this.options(), params })
      .pipe(
        map((r) => {
          const data = r.data;
          if (Array.isArray(data)) {
            return { content: data, totalElements: data.length, totalPages: 1, number: 0, size: data.length };
          }
          return data as Page<T>;
        })
      );
  }

  private url(path: string): string {
    return `${this.baseUrl}${path.startsWith('/') ? path : '/' + path}`;
  }

  private options(): { withCredentials: boolean } {
    return { withCredentials: true };
  }
}
