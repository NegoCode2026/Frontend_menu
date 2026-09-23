import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface UploadResult {
  url: string;
  fileId: string;
}

@Injectable({ providedIn: 'root' })
export class FileService {
  constructor(private api: ApiService) {}

  /**
   * Convierte la imagen a cadena Base64 Data URI (data:image/...;base64,...).
   * Almacenamiento directo en base de datos sin peticiones HTTP extra ni timeouts.
   */
  upload(file: File): Observable<UploadResult> {
    return new Observable<UploadResult>((observer) => {
      if (!file || !file.type.startsWith('image/')) {
        observer.error({ error: { message: 'El archivo debe ser una imagen válida' } });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        observer.next({ url: dataUrl, fileId: dataUrl });
        observer.complete();
      };
      reader.onerror = (err) => observer.error(err);
      reader.readAsDataURL(file);
    });
  }
}