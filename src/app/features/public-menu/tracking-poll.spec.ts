import { BehaviorSubject, Observable } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pollWhileAvailable } from './tracking-poll';

describe('seguimiento de pedidos', () => {
  afterEach(() => vi.useRealTimers());
  it('mantiene una sola petición y cancela al ocultar o cambiar de pedido', () => {
    vi.useFakeTimers();
    const visible = new BehaviorSubject(true);
    const cancel = vi.fn();
    const fetchStatus = vi.fn(() => new Observable(() => cancel));
    const sub = pollWhileAvailable(visible, 4000, fetchStatus).subscribe();
    vi.advanceTimersByTime(12000);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    visible.next(false);
    expect(cancel).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(12000);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    visible.next(true);
    vi.advanceTimersByTime(1);
    expect(fetchStatus).toHaveBeenCalledTimes(2);
    sub.unsubscribe();
    expect(cancel).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(12000);
    expect(fetchStatus).toHaveBeenCalledTimes(2);
  });
});
