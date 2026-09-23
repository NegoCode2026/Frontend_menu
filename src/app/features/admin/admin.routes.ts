import { Routes } from '@angular/router';
import { AdminLayoutComponent } from './admin-layout/admin-layout.component';
import { roleGuard } from '../../core/guards/role.guard';

/**
 * Rutas tenant (dashboard, orders, restaurant, categories, products, qr,
 * users, settings) = solo roles de restaurante. El SUPER_ADMIN tiene
 * restaurantId null y esos endpoints responden 403, así que el guard lo
 * manda a /admin/super-admin/dashboard. La gestión global vive bajo
 * /admin/super-admin (solo SUPER_ADMIN).
 */
const tenantGuard = roleGuard('RESTAURANT_ADMIN', 'RESTAURANT_USER', 'WAITER', 'CASHIER');

export const adminRoutes: Routes = [
  {
    path: '',
    component: AdminLayoutComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        canActivate: [tenantGuard],
        loadComponent: () => import('./dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'orders',
        canActivate: [tenantGuard],
        loadComponent: () => import('./orders/orders.component').then((m) => m.OrdersComponent),
      },
      {
        path: 'staff',
        canActivate: [tenantGuard],
        loadComponent: () => import('./staff/staff.component').then((m) => m.StaffComponent),
      },
      {
        path: 'inventory',
        canActivate: [roleGuard('RESTAURANT_ADMIN')],
        loadComponent: () => import('./inventory/inventory.component').then((m) => m.InventoryComponent),
      },
      {
        path: 'profits',
        canActivate: [roleGuard('RESTAURANT_ADMIN')],
        loadComponent: () => import('./profits/profits.component').then((m) => m.ProfitsComponent),
      },
      {
        path: 'tables',
        canActivate: [tenantGuard],
        loadComponent: () => import('./tables/tables.component').then((m) => m.TablesComponent),
      },
      {
        path: 'restaurant',
        canActivate: [roleGuard('RESTAURANT_ADMIN')],
        loadComponent: () => import('./restaurant/restaurant.component').then((m) => m.RestaurantComponent),
      },
      {
        path: 'products',
        canActivate: [tenantGuard],
        loadComponent: () => import('./products/products.component').then((m) => m.ProductsComponent),
      },
      {
        path: 'qr',
        canActivate: [roleGuard('RESTAURANT_ADMIN')],
        loadComponent: () => import('./qr/qr.component').then((m) => m.QrComponent),
      },
      {
        path: 'users',
        canActivate: [roleGuard('RESTAURANT_ADMIN')],
        loadComponent: () => import('./users/users.component').then((m) => m.UsersComponent),
      },
      {
        path: 'settings',
        canActivate: [roleGuard('RESTAURANT_ADMIN')],
        loadComponent: () => import('./settings/settings.component').then((m) => m.SettingsComponent),
      },
      {
        path: 'super-admin',
        canActivate: [roleGuard('SUPER_ADMIN')],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
          {
            path: 'dashboard',
            loadComponent: () =>
              import('./super-admin/super-admin-dashboard.component').then((m) => m.SuperAdminDashboardComponent),
          },
          {
            path: 'restaurants',
            loadComponent: () =>
              import('./super-admin/super-admin-restaurants.component').then((m) => m.SuperAdminRestaurantsComponent),
          },
          {
            path: 'users',
            loadComponent: () =>
              import('./super-admin/super-admin-users.component').then((m) => m.SuperAdminUsersComponent),
          },
        ],
      },
    ],
  },
];
