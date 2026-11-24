import { EMPTY, Observable, distinctUntilChanged, exhaustMap, switchMap, timer } from 'rxjs';

/** La visibilidad controla el ciclo completo, incluida la solicitud HTTP en curso. */
export function pollWhileAvailable<T>(
  available: Observable<boolean>, intervalMs: number, read: () => Observable<T>,
): Observable<T> {
  return available.pipe(
    distinctUntilChanged(),
    switchMap(active => active ? timer(0, intervalMs).pipe(exhaustMap(read)) : EMPTY),
  );
}
