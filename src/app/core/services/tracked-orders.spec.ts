import { expect, it } from 'vitest';
import { readTrackingRefs } from './tracked-orders';

it('migra comprobantes anteriores y descarta datos del cliente y pedidos finalizados', () => {
  const ref = { id: 8, trackingCode: 'ref', orderNumber: 'A-8', status: 'PENDING', tableNumber: 'Mesa 1' };
  const previous = { ...ref, customerPhone: '300000', deliveryAddress: 'Dirección', items: [], notes: 'Nota' };
  const result = readTrackingRefs(JSON.stringify({ uno: [previous, { ...previous, status: 'DELIVERED' }], dos: [] }));
  expect(result.uno).toEqual([ref]);
  expect(result.dos).toEqual([]);
});
