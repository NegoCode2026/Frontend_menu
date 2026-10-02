import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { ApiService } from './api.service';

export interface UploadResult {
  url: string;
  fileId: string;
}

/**
 * Sube imágenes al backend (multipart). El backend valida la cabecera real del
 * archivo y devuelve un fileId más una URL firmada.
 *
 * Antes, si la subida fallaba, se guardaba la imagen como base64 dentro del
 * propio registro (Data URI). Eso era un doble problema: el usuario veía
 * "subido" cuando nada se había subido, y el base64 entraba en la base de datos
 * saltándose toda validación y ocupando mucho más espacio. Ahora un fallo de
 * subida se propaga como error.
 */
@Injectable({ providedIn: 'root' })
export class FileService {
  constructor(private api: ApiService) {}

  upload(file: File): Observable<UploadResult> {
    if (!file || !file.type.startsWith('image/')) {
      return throwError(() => ({ error: { message: 'El archivo debe ser una imagen válida' } }));
    }

    const formData = new FormData();
    formData.append('file', file);

    return this.api.postForm<UploadResult>('/files/upload', formData);
  }
}