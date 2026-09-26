import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { AdminCreateRestaurant, AdminRestaurant, AdminStats, AdminUser, Page } from '../models/models';

/**
 * Servicio SuperAdmin: SIN datos mock.
 * Antes cada método hacía catchError(of(datos falsos)) y ocultaba 401/403
 * de cookies en producción. Ahora los errores se propagan y los componentes
 * muestran loadError + botón Reintentar.
 *
 * listRestaurants/listUsers soportan paginación + búsqueda server-side.
 * Si el backend antiguo responde con array plano, se adapta a Page.
 */
@Injectable({ providedIn: 'root' })
export class AdminService {
  constructor(private api: ApiService) {}

  getStats(): Observable<AdminStats> {
    return this.api.get<AdminStats>('/admin/stats');
  }

  listRestaurants(params?: { page?: number; size?: number; search?: string; active?: boolean }): Observable<Page<AdminRestaurant>> {
    let httpParams = new HttpParams();
    if (params?.page != null) httpParams = httpParams.set('page', String(params.page));
    if (params?.size != null) httpParams = httpParams.set('size', String(params.size));
    if (params?.search) httpParams = httpParams.set('search', params.search);
    if (params?.active != null) httpParams = httpParams.set('active', String(params.active));
    return this.api.getPaged<AdminRestaurant>('/admin/restaurants', httpParams);
  }

  createRestaurant(payload: AdminCreateRestaurant): Observable<AdminRestaurant> {
    return this.api.post<AdminRestaurant>('/admin/restaurants', payload);
  }

  toggleRestaurantActive(id: number, active: boolean): Observable<void> {
    return this.api.patch<void>(`/admin/restaurants/${id}/active?active=${active}`, {});
  }

  listUsers(params?: { page?: number; size?: number; search?: string; role?: string; active?: boolean }): Observable<Page<AdminUser>> {
    let httpParams = new HttpParams();
    if (params?.page != null) httpParams = httpParams.set('page', String(params.page));
    if (params?.size != null) httpParams = httpParams.set('size', String(params.size));
    if (params?.search) httpParams = httpParams.set('search', params.search);
    if (params?.role) httpParams = httpParams.set('role', params.role);
    if (params?.active != null) httpParams = httpParams.set('active', String(params.active));
    return this.api.getPaged<AdminUser>('/admin/users', httpParams);
  }

  toggleUserActive(id: number, active: boolean): Observable<void> {
    return this.api.patch<void>(`/admin/users/${id}/active?active=${active}`, {});
  }
}
