import { Injectable } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';

export interface UploadResult {
  url: string;
  fileId: string;
}

const demoMode = !environment.production;

@Injectable({ providedIn: 'root' })
export class FileService {
  constructor(private api: ApiService) {}

  /**
   * Sube la imagen al backend (multipart) y devuelve fileId + URL pública
   * (firmada si es almacenamiento local/BD, o HTTPS de Cloudinary).
   * En modo demo (o si la subida falla) cae a Data URI para no romper la UX.
   */
  upload(file: File): Observable<UploadResult> {
    if (!file || !file.type.startsWith('image/')) {
      return throwError(() => ({ error: { message: 'El archivo debe ser una imagen válida' } }));
    }

    const formData = new FormData();
    formData.append('file', file);

    return this.api
      .postForm<UploadResult>('/files/upload', formData)
      .pipe(catchError((err) => (demoMode ? this.toDataUri(file) : throwError(() => err))));
  }

  private toDataUri(file: File): Observable<UploadResult> {
    return new Observable<UploadResult>((observer) => {
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