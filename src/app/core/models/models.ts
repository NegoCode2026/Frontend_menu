export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  timestamp: string;
}

export interface TokenUser {
  id: number;
  name: string;
  email: string;
  role: string;
  restaurantId: number | null;
}

export interface AuthResponse {
  user: TokenUser;
}

export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface Restaurant {
  id: number;
  name: string;
  slug: string;
  logoUrl: string | null;
  description: string | null;
  phone: string | null;
  address: string | null;
  whatsapp: string | null;
  instagram: string | null;
  facebook: string | null;
  taxId?: string | null;
  estimatedPrepTime?: string | null;
  active: boolean;
  open: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DirectoryRestaurant {
  id: number;
  name: string;
  slug: string;
  description: string;
  logoUrl: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  productCount: number;
  /** Interruptor abierto/cerrado controlado por el dueño. */
  open?: boolean;
  // Campos enriquecidos opcionales (aun sin datos reales en BD)
  tagline?: string;
  cuisine?: string;
  cuisineCategory?: string;
  city?: string;
  coverUrl?: string | null;
  rating?: number;
  reviewCount?: number;
  priceLevel?: '$' | '$$' | '$$$' | '$$$$';
  minPrice?: number;
  maxPrice?: number;
  averagePrice?: number;
  deliveryTime?: string;
  isOpen?: boolean;
  featuredDish?: string;
  tags?: string[];
}

export interface DirectoryDish {
  id: number;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  restaurantName: string;
  restaurantSlug: string;
  restaurantLogo: string;
  cuisineCategory: string;
  tags: string[];
}

export interface DishOption {
  id: string;
  name: string;
  price: number;
}

export interface DishCustomization {
  selectedTerm?: string;
  selectedOptions: DishOption[];
  notes?: string;
  extraCost: number;
}

export interface DirectoryFilter {
  query?: string;
  cuisineCategory?: string;
  city?: string;
  onlyOpen?: boolean;
  priceLevel?: string;
  sortBy?: 'recommended' | 'priceAsc' | 'priceDesc' | 'rating';
  onlyFavorites?: boolean;
  viewMode?: 'restaurants' | 'dishes';
}

export interface RestaurantRequest {
  name: string;
  slug: string;
  logoUrl?: string | null;
  description?: string | null;
  phone?: string | null;
  address?: string | null;
  whatsapp?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  taxId?: string | null;
  estimatedPrepTime?: string | null;
  active?: boolean | null;
}

export interface Category {
  id: number;
  restaurantId: number;
  name: string;
  description: string | null;
  position: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryRequest {
  name: string;
  description?: string | null;
  position?: number | null;
  active?: boolean | null;
}

export interface Product {
  id: number;
  restaurantId: number;
  categoryId: number | null;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  available: boolean;
  position: number;
  costPrice: number;
  stockQuantity: number;
  lowStockThreshold: number;
  trackStock: boolean;
  lowStock: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductRequest {
  categoryId?: number | null;
  name: string;
  description?: string | null;
  price: number;
  imageUrl?: string | null;
  available?: boolean | null;
  position?: number | null;
  costPrice?: number | null;
  stockQuantity?: number | null;
  lowStockThreshold?: number | null;
  trackStock?: boolean | null;
}

export interface PublicMenu {
  restaurant: {
    name: string;
    slug: string;
    logoUrl: string | null;
    description: string | null;
    phone: string | null;
    address: string | null;
    whatsapp: string | null;
    instagram: string | null;
    facebook: string | null;
    taxId?: string | null;
    estimatedPrepTime?: string | null;
    open: boolean;
  };
  categories: Array<{
    id: number;
    name: string;
    description: string | null;
    position: number;
    products: Array<{
      id: number;
      name: string;
      description: string | null;
      price: number;
      imageUrl: string | null;
      available: boolean;
    }>;
  }>;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  restaurantId: number | null;
  active: boolean;
  createdAt: string;
}

export interface Plan {
  id: number;
  code: string;
  name: string;
  description: string | null;
  priceMonthly: number;
}

export interface Subscription {
  id: number;
  restaurantId: number;
  plan: Plan;
  status: string;
  provider?: string | null;
  startsAt: string;
  endsAt: string | null;
}

export interface SubscribeResult {
  subscription: Subscription;
  checkoutSessionId: string | null;
}

export interface MenuSummary {
  id: number;
  name: string;
  slug: string;
  categoryCount: number;
  productCount: number;
}

export interface AdminStats {
  totalRestaurants: number;
  activeRestaurants: number;
  totalUsers: number;
  activeSubscriptions: number;
  totalProducts: number;
}

export interface AdminRestaurant {
  id: number;
  name: string;
  slug: string;
  logoUrl: string | null;
  phone: string | null;
  address: string | null;
  active: boolean;
  createdAt: string;
  userCount: number;
  productCount: number;
  planName: string;
  adminEmail: string;
}

export interface AdminCreateRestaurant {
  restaurantName: string;
  slug: string;
  adminName: string;
  adminEmail: string;
  adminPassword: String;
  planCode?: string;
}

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: string;
  restaurantId: number | null;
  restaurantName: string;
}

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'IN_PREPARATION' | 'READY' | 'DELIVERED' | 'CANCELLED';
export type OrderType = 'DINE_IN' | 'DELIVERY' | 'TAKEAWAY';
export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER';

export interface OrderItem {
  id: number;
  productId: number;
  productName: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  notes: string | null;
}

export interface OrderStatusEvent {
  id: number;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  changedAt: string;
}

export interface Order {
  id: number;
  restaurantId: number;
  orderNumber: string;
  trackingCode?: string | null;
  customerName: string;
  customerPhone: string | null;
  tableNumber: string | null;
  deliveryAddress?: string | null;
  orderType: OrderType;
  notes: string | null;
  status: OrderStatus;
  totalAmount: number;
  discountAmount?: number | null;
  tipAmount?: number | null;
  paymentMethod?: PaymentMethod | null;
  paidAt?: string | null;
  estimatedPrepTime?: string | null;
  readyAt?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  timeline?: OrderStatusEvent[];
}

export interface UpdateOrderRequest {
  customerName?: string;
  customerPhone?: string;
  tableNumber?: string;
  deliveryAddress?: string;
  notes?: string;
  orderType?: OrderType;
  discountAmount?: number | null;
  tipAmount?: number | null;
  items?: CreateOrderItemRequest[];
}

export interface CartItem {
  productId: number;
  productName: string;
  unitPrice: number;
  imageUrl: string | null;
  quantity: number;
  notes?: string;
  categoryName?: string;
}

export interface CreateOrderItemRequest {
  productId: number;
  quantity: number;
  notes?: string;
}

export interface CreateOrderRequest {
  customerName: string;
  customerPhone?: string;
  tableNumber?: string;
  orderType?: OrderType;
  deliveryAddress?: string;
  notes?: string;
  discountAmount?: number | null;
  tipAmount?: number | null;
  items: CreateOrderItemRequest[];
}

/** El pedido manual se identifica por mesa/destino; el nombre es opcional. */
export interface CreateManualOrderRequest {
  customerName?: string;
  customerPhone?: string;
  tableNumber?: string;
  orderType?: OrderType;
  deliveryAddress?: string;
  notes?: string;
  discountAmount?: number | null;
  tipAmount?: number | null;
  items: CreateOrderItemRequest[];
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmado',
  IN_PREPARATION: 'En Preparación',
  READY: 'Listo para Servir',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, { bg: string; text: string; border: string }> = {  PENDING: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  CONFIRMED: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200' },
  IN_PREPARATION: { bg: 'bg-violet-50', text: 'text-violet-800', border: 'border-violet-200' },
  READY: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
  DELIVERED: { bg: 'bg-stone-100', text: 'text-stone-700', border: 'border-stone-200' },
  CANCELLED: { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200' },
};

/** Roles operativos del restaurante (además de RESTAURANT_ADMIN/USER). */export type StaffRole = 'WAITER' | 'CASHIER';

export const STAFF_ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  RESTAURANT_ADMIN: 'Administrador',
  RESTAURANT_USER: 'Equipo',
  WAITER: 'Mesero',
  CASHIER: 'Cajero',
};

export type MovementReason = 'ORDER' | 'CANCEL_RESTORE' | 'RESTOCK' | 'ADJUST';

export interface StockMovement {
  id: number;
  productId: number | null;
  ingredientId: number | null;
  quantity: number;
  reason: MovementReason;
  orderId: number | null;
  createdAt: string;
}

export interface AdjustStockRequest {
  productId: number;
  quantity: number;
  reason?: MovementReason | null;
}

export interface DailyProfit {
  date: string;
  revenue: number;
  cost: number;
  profit: number;
  orders: number;
}

export interface ProfitsResponse {
  period: string;
  from: string;
  to: string;
  revenue: number;
  cost: number;
  profit: number;
  orders: number;
  days: DailyProfit[];
}

/** Evento WebSocket del staff (/topic/r/{rid}/orders). */
export interface OrderEvent {
  type: 'CREATED' | 'STATUS_CHANGED';
  restaurantId: number;
  order: Order;
}

export interface Ingredient {
  id: number;
  name: string;
  unit: string;
  stockQuantity: number;
  lowStockThreshold: number;
  unitCost: number;
  trackStock: boolean;
  lowStock: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IngredientRequest {
  name: string;
  unit?: string | null;
  stockQuantity?: number | null;
  lowStockThreshold?: number | null;
  unitCost?: number | null;
  trackStock?: boolean | null;
}

export interface RecipeItem {
  id: number;
  ingredientId: number;
  ingredientName: string;
  unit: string;
  quantity: number;
}

export interface RecipeLineRequest {
  ingredientId: number;
  quantity: number;
}
export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  DINE_IN: 'Mesa',
  DELIVERY: 'Domicilio',
  TAKEAWAY: 'Para llevar',
};
