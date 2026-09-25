import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Bottom tab flotante negro estilo food-app, compartido por
 * todas las vistas de Super Admin en móvil.
 * Solo visual: los iconos navegan a las rutas existentes.
 */
@Component({
  selector: 'app-super-admin-mobile-nav',
  imports: [RouterLink],
  template: `
    <div
      class="fixed bottom-0 left-1/2 z-[60] w-full max-w-[430px] -translate-x-1/2 px-6 lg:hidden"
      style="padding-bottom: calc(1.25rem + env(safe-area-inset-bottom, 0px));"
    >
      <nav class="flex items-center justify-between rounded-full border border-stone-200 bg-white/95 px-8 py-3 shadow-[0_20px_45px_rgba(0,0,0,0.12)] backdrop-blur">
        <a
          routerLink="/admin/super-admin/dashboard"
          aria-label="Inicio"
          class="flex h-11 w-11 items-center justify-center rounded-full active:scale-90 transition {{ active() === 'home' ? 'bg-[#ff5c00] text-white' : 'text-stone-400 hover:bg-stone-100' }}"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-[22px] w-[22px]"><path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z"/><path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.43z"/></svg>
        </a>
        <a
          routerLink="/admin/super-admin/restaurants"
          aria-label="Restaurantes"
          class="flex h-11 w-11 items-center justify-center rounded-full active:scale-90 transition {{ active() === 'lists' ? 'bg-[#ff5c00] text-white' : 'text-stone-400 hover:bg-stone-100' }}"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.7" stroke="currentColor" class="h-[22px] w-[22px]"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .414.336.75.75.75z"/></svg>
        </a>
        <a
          routerLink="/admin/super-admin/users"
          aria-label="Usuarios"
          class="flex h-11 w-11 items-center justify-center rounded-full active:scale-90 transition {{ active() === 'users' ? 'bg-[#ff5c00] text-white' : 'text-stone-400 hover:bg-stone-100' }}"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.7" stroke="currentColor" class="h-[22px] w-[22px]"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/></svg>
        </a>
      </nav>
    </div>
  `,
})
export class SuperAdminMobileNavComponent {
  readonly active = input<'home' | 'lists' | 'users'>('home');
}
