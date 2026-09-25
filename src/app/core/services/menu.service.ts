import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { TenantBackendService } from './tenant-backend.service';
import { PublicMenu } from '../models/models';
import { DEMO_PUBLIC_MENU } from '../data/demo-menu.data';
import { MULTI_RESTAURANT_MENUS } from '../data/directory-restaurants.data';

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
      }),
      catchError(() => {
        const found = MULTI_RESTAURANT_MENUS[slug];
        if (found) {
          return of(found);
        }
        return of(DEMO_PUBLIC_MENU);
      })
    );
  }
}

