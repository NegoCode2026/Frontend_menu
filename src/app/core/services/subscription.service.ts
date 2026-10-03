import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Plan, SubscribeResult, Subscription } from '../models/models';

/**
 * Suscripciones del tenant.
 *
 * Sin fallbacks con datos inventados. Antes, si la API fallaba, cada método
 * devolvía una suscripción ficticia: un plan PRO "ACTIVE" que no existía en la
 * base y un proveedor "MERCADO_PAGO" que el sistema no usa. Un restaurante
 * recién registrado veía un plan activo y nunca se enteraba de que debía pagar.
 * Un error ahora se propaga y la interfaz lo muestra.
 */
@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  constructor(private api: ApiService) {}

  listPlans(): Observable<Plan[]> {
    return this.api.get<Plan[]>('/subscriptions/plans');
  }

  /** 404 = el tenant todavía no tiene suscripción; lo trata la pantalla. */
  getMine(): Observable<Subscription> {
    return this.api.get<Subscription>('/subscriptions/me');
  }

  subscribe(planCode: string): Observable<SubscribeResult> {
    return this.api.post<SubscribeResult>('/subscriptions/subscribe', { planCode });
  }

  cancel(): Observable<Subscription> {
    return this.api.post<Subscription>('/subscriptions/cancel');
  }
}