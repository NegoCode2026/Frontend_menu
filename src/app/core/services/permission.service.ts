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
}
