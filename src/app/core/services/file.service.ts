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
   * Sube una imagen y devuelve la URL firmada y el fileId.
   * El FormData se envía como multipart/form-data; Angular HttpClient
   * detecta FormData automáticamente y deja que el browser ponga el
   * Content-Type con el boundary correcto (no se fuerza application/json).
   */
  upload(file: File): Observable<UploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    return this.api.post<UploadResult>('/files/upload', formData);
  }
}