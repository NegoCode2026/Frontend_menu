import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { TenantBackendService } from './tenant-backend.service';
import { PublicMenu } from '../models/models';

@Injectable({ providedIn: 'root' })
export class MenuService {
  constructor(
    private api: ApiService,
    private tenants: TenantBackendService,
  ) {}

  getPublicMenu(slug: string): Observable<PublicMenu> {
    // Espera el registry remoto (máx ~4s, suele ser ms) y recién ahí fija
    // el docker del slug: así un cliente nuevo (solo en el JSON remoto)
    // también pega a su docker sin redeploy.
    return this.tenants.ensureLoaded().pipe(
      switchMap(() => {
        this.tenants.pinFor(slug);
        return this.api.get<PublicMenu>(`/public/menu/${encodeURIComponent(slug)}`);
      })
    );
  }
}
