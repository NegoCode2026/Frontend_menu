import { Component, computed, HostListener, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import QRCode from 'qrcode';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { OrderService } from '../../../core/services/order.service';
import { TableService, RestaurantTable } from '../../../core/services/table.service';
import { AuthService } from '../../../core/services/auth.service';
import { Order } from '../../../core/models/models';
import { BusinessMobileNavComponent } from '../business-mobile-nav/business-mobile-nav.component';

const ACTIVE_ORDER_STATUS: Order['status'][] = ['PENDING', 'CONFIRMED', 'IN_PREPARATION', 'READY'];

export interface TableView extends RestaurantTable {
  orderCount: number;
  itemCount: number;
  urgent: boolean;
}

@Component({
  selector: 'app-tables',
  imports: [RouterLink, BusinessMobileNavComponent],
  templateUrl: './tables.component.html',
})
export class TablesComponent implements OnInit {
  private readonly restaurantService = inject(RestaurantService);
  private readonly orderService = inject(OrderService);
  private readonly tableService = inject(TableService);
  private readonly auth = inject(AuthService);

  readonly user = this.auth.user;
  readonly restaurantId = computed(() => this.user()?.restaurantId ?? null);
  readonly restaurantName = signal<string | null>(null);
  readonly menuSlug = signal<string | null>(null);
  readonly isOpen = signal(true);

  readonly tables = signal<RestaurantTable[]>([]);
  readonly allOrders = signal<Order[]>([]);

  readonly showAdd = signal(false);
  readonly newNumber = signal('');
  readonly newSeats = signal(2);

  readonly qrTable = signal<TableView | null>(null);
  readonly qrDataUrl = signal<string | null>(null);
  readonly linkCopied = signal(false);

  readonly isAdmin = computed(() => {
    const raw = this.user()?.role ?? '';
    return (raw.startsWith('ROLE_') ? raw.substring(5) : raw) === 'RESTAURANT_ADMIN';
  });

  readonly activeOrders = computed(() =>
    this.allOrders().filter((o) => o && ACTIVE_ORDER_STATUS.includes(o.status))
  );

  readonly tableViews = computed<TableView[]>(() => {
    const active = this.activeOrders();
    return this.tables().map((t) => {
      const n = TableService.normalizeNumber(t.number);
      const mine = n === null ? [] : active.filter((o) => TableService.normalizeNumber(o.tableNumber) === n);
      return {
        ...t,
        orderCount: mine.length,
        itemCount: mine.reduce((sum, o) => sum + (o.items ?? []).length, 0),
        urgent: mine.some((o) => o.status === 'PENDING'),
      };
    });
  });

  ngOnInit(): void {
    this.reloadTables();
    this.restaurantService.getMine().subscribe({
      next: (r) => {
        this.restaurantName.set(r.name);
        this.isOpen.set(r.open);
        this.menuSlug.set(r.slug);
      },
      error: () => undefined,
    });
    this.orderService.listMine().subscribe({
      next: (orders) => this.allOrders.set(Array.isArray(orders) ? orders : []),
      error: () => undefined,
    });
  }

  reloadTables(): void {
    this.tables.set(this.tableService.list(this.restaurantId()));
  }

  suggestedNumber(): string {
    const nums = this.tables()
      .map((t) => TableService.normalizeNumber(t.number))
      .filter((n): n is number => n !== null);
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    return String(next).padStart(2, '0');
  }

  openAdd(): void {
    this.newNumber.set(this.suggestedNumber());
    this.newSeats.set(2);
    this.showAdd.set(true);
  }

  saveTable(): void {
    const number = this.newNumber().trim();
    if (!number) return;
    this.tableService.add(this.restaurantId(), number, this.newSeats());
    this.reloadTables();
    this.showAdd.set(false);
  }

  deleteTable(id: string): void {
    this.tableService.remove(this.restaurantId(), id);
    this.reloadTables();
    if (this.qrTable()?.id === id) this.closeQr();
  }

  menuUrlFor(table: RestaurantTable): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const slug = this.menuSlug() ?? '';
    return `${origin}/menu/${slug}?mesa=${encodeURIComponent(table.number)}`;
  }

  async openQr(table: TableView): Promise<void> {
    this.qrTable.set(table);
    this.qrDataUrl.set(null);
    this.linkCopied.set(false);
    try {
      const dataUrl = await QRCode.toDataURL(this.menuUrlFor(table), {
        width: 640,
        margin: 2,
        errorCorrectionLevel: 'H',
        color: { dark: '#1c1917', light: '#ffffff' },
      });
      if (this.qrTable()?.id === table.id) {
        this.qrDataUrl.set(dataUrl);
      }
    } catch {
      this.qrDataUrl.set(null);
    }
  }

  closeQr(): void {
    this.qrTable.set(null);
    this.qrDataUrl.set(null);
  }

  @HostListener('document:keydown.escape')
  closeTopModalOnEscape(): void {
    if (this.qrTable()) {
      this.closeQr();
      return;
    }
    if (this.showAdd()) this.showAdd.set(false);
  }

  async copyMenuLink(): Promise<void> {
    const table = this.qrTable();
    if (!table) return;
    const url = this.menuUrlFor(table);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
    }
    this.linkCopied.set(true);
    window.setTimeout(() => this.linkCopied.set(false), 2000);
  }

  downloadQr(): void {
    const url = this.qrDataUrl();
    const table = this.qrTable();
    if (!url || !table) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = `qr-mesa-${table.number}.png`;
    link.click();
  }

  printStand(): void {
    window.print();
  }

  logout(): void {
    this.auth.forceLogout();
  }
}
