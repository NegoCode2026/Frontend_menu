import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ReportsService } from './reports.service';
import { FileService } from './file.service';

/**
 * Fijan dos cambios de comportamiento deliberados:
 *
 * - reports.service ya no devuelve ceros cuando la consulta falla. Antes un 403
 *   (falta permiso) o una caída de la API mostraban "utilidad $0", imposible de
 *   distinguir de un día sin ventas.
 * - file.service ya no guarda la imagen como base64 dentro del registro cuando
 *   la subida falla. Antes devolvía éxito mientras nada se había subido, y el
 *   base64 acababa en la base saltándose toda validación de la subida.
 */
describe('ReportsService', () => {
  let service: ReportsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ReportsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('consulta por día por defecto', () => {
    service.profits().subscribe();
    const req = http.expectOne('/api/reports/profits?period=day');
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: { period: 'day', profit: 0 } });
  });

  it('propaga el error en vez de devolver ceros', () => {
    let error: unknown;
    service.profits('month', '2026-10-01').subscribe({ error: (e) => (error = e) });

    http
      .expectOne('/api/reports/profits?period=month&date=2026-10-01')
      .flush('nope', { status: 403, statusText: 'Forbidden' });

    // Un 403 significa "sin permiso", no "utilidad cero".
    expect(error).toBeTruthy();
  });
});

describe('FileService', () => {
  let service: FileService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FileService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function imageFile(name = 'plato.png'): File {
    return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: 'image/png' });
  }

  it('sube la imagen como multipart y devuelve fileId y url', () => {
    let received: { url: string; fileId: string } | undefined;
    service.upload(imageFile()).subscribe((r) => (received = r));

    const req = http.expectOne('/api/files/upload');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeInstanceOf(FormData);
    expect((req.request.body as FormData).get('file')).toBeTruthy();

    req.flush({ success: true, data: { url: 'https://api/x.png', fileId: 'abc.png' } });
    expect(received).toEqual({ url: 'https://api/x.png', fileId: 'abc.png' });
  });

  it('propaga el fallo de la subida: no devuelve un Data URI inventado', () => {
    let error: unknown;
    let value: unknown;
    service.upload(imageFile()).subscribe({ next: (v) => (value = v), error: (e) => (error = e) });

    http.expectOne('/api/files/upload').flush('nope', { status: 403, statusText: 'Forbidden' });

    expect(value).toBeUndefined();
    expect(error).toBeTruthy();
  });

  it('rechaza un archivo que no es imagen sin llamar a la API', () => {
    let error: unknown;
    service.upload(new File(['x'], 'nota.pdf', { type: 'application/pdf' })).subscribe({
      error: (e) => (error = e),
    });

    http.expectNone('/api/files/upload');
    expect(error).toBeTruthy();
  });
});