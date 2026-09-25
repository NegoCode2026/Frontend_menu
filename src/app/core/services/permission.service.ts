import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export const PERMISSION_LABELS: Record<string, string> = {
  MENU_EDIT: 'Editar menú',
  ORDERS_EDIT: 'Editar pedidos',
  ORDER_SERVE: 'Confirmar y servir',
  ORDER_KITCHEN: 'Cocina (preparar y alistar)',
  ORDER_CANCEL: 'Cancelar pedidos',
  CASH_CHARGE: 'Cobrar',
  CASH_CLOSE: 'Cierre de caja',
  INVENTORY_MANAGE: 'Inventario',
  REPORTS_VIEW: 'Ver ventas',
  USERS_MANAGE: 'Gestionar equipo',
  SETTINGS_EDIT: 'Configuración',
};

/** Permisos efectivos de una persona: personalización propia o los del rol. */
export interface UserPermissions {
  userId: number;
  role: string;
  inherited: boolean;
  permissions: string[];
}

@Injectable({ providedIn: 'root' })
export class PermissionService {
  constructor(private api: ApiService) {}

  catalog(): Observable<string[]> {
    return this.api.get<string[]>('/permissions/catalog');
  }

  matrix(): Observable<Record<string, string[]>> {
    return this.api.get<Record<string, string[]>>('/permissions/matrix');
  }

  setRole(role: string, permissions: string[]): Observable<string[]> {
    return this.api.put<string[]>('/permissions', { role, permissions });
  }

  /** Permisos de una persona concreta (si hereda del rol lo indica `inherited`). */
  user(userId: number): Observable<UserPermissions> {
    return this.api.get<UserPermissions>(`/permissions/user/${userId}`);
  }

  /** Guarda los permisos de una persona (reemplaza el set completo). */
  setUser(userId: number, permissions: string[]): Observable<UserPermissions> {
    return this.api.put<UserPermissions>(`/permissions/user/${userId}`, { permissions });
  }

  /** Quita la personalización: la persona vuelve a los permisos de su rol. */
  clearUser(userId: number): Observable<UserPermissions> {
    return this.api.delete<UserPermissions>(`/permissions/user/${userId}`);
  }
}
