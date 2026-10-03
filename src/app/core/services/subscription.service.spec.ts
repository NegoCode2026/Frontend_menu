import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { beforeEach, describe, expect, it } from 'vitest';

import { SubscriptionService } from './subscription.service';

/**
 * Estos tests fijan un cambio de comportamiento deliberado: subscription.service
 * ya no devuelve datos ficticios cuando la API falla.
 *
 * Antes, los cuatro métodos tenían catchError(() => of(<suscripción inventada>)):
 * un plan PRO "ACTIVE" que no existía en la base y con proveedor MERCADO_PAGO,
 * que el sistema no usa. Un restaurante recién registrado veía un plan activo y
 * nunca se enteraba de que debía pagar, y un 403 o una caída de red eran
 * indistinguibles de "todo correcto".
 */
describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SubscriptionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lista los planes del backend', () => {
    let received: unknown;
    service.listPlans().subscribe((p) => (received = p));

    const req = http.expectOne('/api/subscriptions/plans');
    expect(req.request.method).toBe('GET');
    // ApiService desenvuelve el sobre: la respuesta va dentro de `data`.
    req.flush({
      success: true,
      data: [{ id: 1, code: 'NEGOCODE', name: 'NegoCode', priceMonthly: 49900, active: true }],
    });

    expect(received).toEqual([
      { id: 1, code: 'NEGOCODE', name: 'NegoCode', priceMonthly: 49900, active: true },
    ]);
  });

  it('propaga el error de listar planes en vez de inventar planes', () => {
    let error: unknown;
    service.listPlans().subscribe({ error: (e) => (error = e) });

    http.expectOne('/api/subscriptions/plans').flush('nope', { status: 500, statusText: 'Error' });

    expect(error).toBeTruthy();
  });

  it('propaga el 404 de getMine: sin suscripción no es un plan activo', () => {
    let error: unknown;
    let value: unknown;
    service.getMine().subscribe({ next: (s) => (value = s), error: (e) => (error = e) });

    http.expectOne('/api/subscriptions/me').flush('no', { status: 404, statusText: 'Not Found' });

    expect(value).toBeUndefined();
    expect(error).toBeTruthy();
  });

  it('devuelve sessionId y token al suscribirse', () => {
    let received: { checkoutSessionId: string | null; checkoutToken?: string | null } | undefined;
    service.subscribe('NEGOCODE').subscribe((r) => (received = r));

    const req = http.expectOne('/api/subscriptions/subscribe');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ planCode: 'NEGOCODE' });
    req.flush({
      success: true,
      data: {
        subscription: { id: 1, status: 'PENDING' },
        checkoutSessionId: 'ses_123',
        checkoutToken: 'tok_abc',
      },
    });

    // El token es imprescindible: Smart Checkout v2 no abre sin él.
    expect(received?.checkoutSessionId).toBe('ses_123');
    expect(received?.checkoutToken).toBe('tok_abc');
  });

  it('propaga el error de suscripción: si falla el cobro, no se finge una activación', () => {
    let error: unknown;
    service.subscribe('NEGOCODE').subscribe({ error: (e) => (error = e) });

    http.expectOne('/api/subscriptions/subscribe').flush('no', { status: 402, statusText: 'Payment Required' });

    expect(error).toBeTruthy();
  });

  it('propaga el error al cancelar', () => {
    let error: unknown;
    service.cancel().subscribe({ error: (e) => (error = e) });

    http.expectOne('/api/subscriptions/cancel').flush('no', { status: 409, statusText: 'Conflict' });

    expect(error).toBeTruthy();
  });
});