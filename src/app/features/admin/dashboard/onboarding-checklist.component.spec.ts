import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { OnboardingChecklistComponent } from './onboarding-checklist.component';

/**
 * La guía de primer uso deriva del estado real del restaurante.
 *
 * <p>Un panel vacío sin orientación es la razón por la que un restaurante
 * abandona el producto en la primera semana. La guía solo vale si refleja el
 * estado de verdad: si marca como hecho algo que no está hecho, es peor que no
 * tenerla.
 */
describe('OnboardingChecklistComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [OnboardingChecklistComponent],
      providers: [provideRouter([])],
    });
  });

  function build(overrides: Partial<{
    categoryCount: number;
    productCount: number;
    availableCount: number;
    hasSlug: boolean;
    isOpen: boolean;
    dismissed: boolean;
  }> = {}) {
    const fixture = TestBed.createComponent(OnboardingChecklistComponent);
    fixture.componentRef.setInput('categoryCount', overrides.categoryCount ?? 0);
    fixture.componentRef.setInput('productCount', overrides.productCount ?? 0);
    fixture.componentRef.setInput('availableCount', overrides.availableCount ?? 0);
    fixture.componentRef.setInput('hasSlug', overrides.hasSlug ?? true);
    fixture.componentRef.setInput('isOpen', overrides.isOpen ?? true);
    fixture.componentRef.setInput('dismissed', overrides.dismissed ?? false);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('un restaurante vacío ve los pasos pendientes', () => {
    const c = build({ hasSlug: false, productCount: 0, availableCount: 0 });
    expect(c.pending().length).toBeGreaterThan(0);
    expect(c.progress()).toBeLessThan(100);
  });

  it('la categoría creada marca su paso como hecho', () => {
    const antes = build({ hasSlug: false }).pending().length;
    const despues = build({ hasSlug: false, categoryCount: 1 }).pending().length;
    expect(despues).toBe(antes - 1);
  });

  it('tres platos disponibles completan la guía y la ocultan', () => {
    // Con menú publicado la guía desaparece sola: ya no aporta nada.
    const c = build({ categoryCount: 2, productCount: 3, availableCount: 3 });
    expect(c.visible()).toBe(false);
  });

  it('con dos platos todavía se muestra', () => {
    const c = build({ categoryCount: 1, productCount: 2, availableCount: 1 });
    expect(c.visible()).toBe(true);
  });

  it('un restaurante cerrado lo tiene pendiente y lo puede abrir', () => {
    const paso = build({ isOpen: false }).steps().find((s) => s.id === 'open');
    expect(paso?.done).toBe(false);
    expect(paso?.link).toBeTruthy();
  });

  it('el usuario puede ocultarla y deja de mostrarse', () => {
    expect(build({ dismissed: true }).visible()).toBe(false);
  });

  it('solo muestra los pasos que faltan, no la lista entera', () => {
    const c = build({ hasSlug: true, isOpen: true });
    expect(c.visibleSteps().length).toBeGreaterThan(0);
    expect(c.visibleSteps().length).toBeLessThanOrEqual(4);
    expect(c.visibleSteps().every((s) => !s.done)).toBe(true);
  });
});