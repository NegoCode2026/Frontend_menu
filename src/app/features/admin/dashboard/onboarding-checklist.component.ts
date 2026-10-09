import { Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Guía de primer uso.
 *
 * <p>Un restaurante recién registrado llega a un panel vacío: no sabe qué
 * hacer primero y la Carte blanche le hace sospechar que el producto no sirve
 * para nada. Esta lista convierte el estado real del restaurante en los
 * siguiente pasos, sin pedirle que adivine.
 *
 * <p>Todo se deriva de datos que el dashboard ya carga (categorías, productos,
 * disponibilidad, slug). No inventa progreso ni exige backend nuevo.
 */

export interface OnboardingStep {
  id: string;
  label: string;
  detail: string;
  done: boolean;
  /** Ruta donde se resuelve el paso. */
  link?: string;
  /** Texto del botón. */
  cta?: string;
}

@Component({
  selector: 'app-onboarding-checklist',
  imports: [RouterLink],
  templateUrl: './onboarding-checklist.component.html',
})
export class OnboardingChecklistComponent {
  /** Se oculta cuando el restaurante ya tiene su menú publicado. */
  readonly categoryCount = input(0);
  readonly productCount = input(0);
  readonly availableCount = input(0);
  readonly hasSlug = input(false);
  readonly isOpen = input(true);
  readonly dismissed = input(false);
  readonly dismissedChange = output<boolean>();

  readonly collapsed = signal(false);

  readonly steps = computed<OnboardingStep[]>(() => [
    {
      id: 'restaurant',
      label: 'Completa los datos del restaurante',
      detail: 'Nombre, dirección, teléfono y WhatsApp. Aparece en tu carta pública.',
      done: this.hasSlug(),
      link: '/admin/restaurant',
      cta: 'Completar',
    },
    {
      id: 'categories',
      label: 'Crea tus categorías',
      detail: 'Entrantes, platos fuertes, bebidas… Es como se ordenará tu carta.',
      done: this.categoryCount() > 0,
      link: '/admin/categories',
      cta: 'Crear categorías',
    },
    {
      id: 'products',
      label: 'Sube al menos 3 platos',
      detail: 'Con precio y foto. Un menú con dos platos no se defiende solo.',
      done: this.productCount() >= 3,
      link: '/admin/products',
      cta: 'Añadir platos',
    },
    {
      id: 'available',
      label: 'Deja algo disponible',
      detail: 'Un plato marcado como agotado no aparece en la carta online.',
      done: this.availableCount() > 0,
      link: '/admin/products',
      cta: 'Revisar disponibilidad',
    },
    {
      id: 'open',
      label: 'Abre el restaurante',
      detail: 'Mientras esté cerrado no se aceptan pedidos.',
      done: this.isOpen(),
      link: '/admin/restaurant',
      cta: 'Abrir',
    },
    {
      id: 'share',
      label: 'Comparte tu enlace y tu QR',
      detail: 'Tu carta es un enlace. Ponlo en la mesa, el rótulo o Instagram.',
      done: false,
      link: '/admin/qr',
      cta: 'Ver mi QR',
    },
  ]);

  readonly pending = computed(() => this.steps().filter((s) => !s.done));
  readonly doneCount = computed(() => this.steps().filter((s) => s.done).length);
  readonly progress = computed(() => Math.round((this.doneCount() / this.steps().length) * 100));

  /**
   * Se oculta cuando el menú ya está publicado (3+ platos y alguno
   * disponible) o si el usuario la aparta.
   *
   * <p>Antes bastaba un solo plato disponible para esconderla, y un restaurante
   * con dos platos a medio subir se quedaba sin ninguna guía: justo cuando
   * más la necesita.
   */
  readonly visible = computed(
    () => !this.dismissed() && !(this.productCount() >= 3 && this.availableCount() > 0),
  );

  /** Solo se muestra lo que falta: una lista de 6 pasos con 5 tachados no ayuda. */
  readonly visibleSteps = computed(() =>
    this.steps().filter((s) => !s.done).slice(0, 4),
  );

  dismiss(): void {
    this.dismissedChange.emit(true);
  }

  toggle(): void {
    this.collapsed.update((c) => !c);
  }
}