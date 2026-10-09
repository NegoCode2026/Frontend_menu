import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { beforeEach, describe, expect, it } from 'vitest';

import { OrderService } from './order.service';
import { CreateOrderRequest } from '../models/models';

/**
 * El cliente envía identificadores de opción, NUNCA el precio.
 *
 * <p>El backend recalcula el delta desde su tabla; ModifiersIT lo demuestra
 * enviando priceDelta -17000 y cobrando el precio de lista. El servicio limpia el
 * payload en un único punto, para que ningún llamante pueda colar un precio por
 * error y para que quede claro de dónde sale el dinero.
 */
describe('OrderService con modifiers', () => {
  let service: OrderService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(OrderService);
    http = TestBed.inject(HttpTestingController);
  });

  /** Va con campos de más a propósito: el servicio debe quitarlos. */
  function richPayload(): CreateOrderRequest {
    return {
      customerName: 'Cliente',
      customerPhone: '3001234567',
      orderType: 'DINE_IN',
      items: [
        {
          productId: 7,
          quantity: 2,
          modifiers: [
            { modifierId: 12, quantity: 1, name: 'Grande', groupName: 'Tamaño', priceDelta: 3000 },
          ] as never,
        },
      ],
    } as CreateOrderRequest;
  }

  it('envía solo modifierId y quantity, nunca el precio', () => {
    let created: unknown;
    service.createPublicOrder('rest-x', richPayload()).subscribe((r) => (created = r));

    const req = http.expectOne('/api/public/orders/rest-x');
    const body = req.request.body as { items: Array<{ modifiers?: object[] }> };
    const modifiers = body.items[0].modifiers ?? [];

    expect(modifiers).toHaveLength(1);
    expect(Object.keys(modifiers[0]).sort()).toEqual(['modifierId', 'quantity']);
    expect(modifiers[0]).toEqual({ modifierId: 12, quantity: 1 });

    req.flush({ success: true, data: { id: 1 } });
    expect(created).toBeTruthy();
  });

  it('un item sin opciones viaja con la lista vacía, no con undefined', () => {
    service.createPublicOrder('rest-x', {
      customerName: 'Cliente',
      customerPhone: '3001234567',
      orderType: 'DINE_IN',
      items: [{ productId: 9, quantity: 1 }],
    }).subscribe();

    const req = http.expectOne('/api/public/orders/rest-x');
    const body = req.request.body as { items: Array<{ modifiers?: object[] }> };

    expect(body.items[0].modifiers).toEqual([]);
    req.flush({ success: true, data: { id: 2 } });
  });
});