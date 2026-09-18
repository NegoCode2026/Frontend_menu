import { ChangeDetectorRef, Component, NgZone, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly ngZone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly form: FormGroup = this.fb.group(
    {
      name: ['', [Validators.required, Validators.maxLength(120)]],
      email: ['', [Validators.required, Validators.email]],
      restaurantName: ['', [Validators.required, Validators.maxLength(120)]],
      slug: [
        '',
        [Validators.required, Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), Validators.maxLength(120)],
      ],
      password: [
        '',
        [
          Validators.required,
          Validators.minLength(8),
          Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/),
        ],
      ],
      confirmPassword: ['', Validators.required],
    },
    { validators: (g) => (g.get('password')?.value === g.get('confirmPassword')?.value ? null : { mismatch: true }) },
  );

  loading = false;
  errorMessage: string | null = null;

  /** Slug autocompletado a partir del nombre del restaurante.
   *  Solo sugiere si el campo está vacío (respeta lo ya escrito) y recuerda
   *  la sugerencia para seleccionarla al enfocar: así, escribir reemplaza
   *  en vez de concatenar. */
  readonly suggestedSlug = signal<string | null>(null);

  suggestSlug(): void {
    const current = (this.form.get('slug')?.value ?? '').trim();
    if (current) {
      this.suggestedSlug.set(null);
      return;
    }
    const name = this.form.get('restaurantName')?.value ?? '';
    const slug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (slug) {
      this.form.get('slug')?.setValue(slug);
      this.suggestedSlug.set(slug);
    }
  }

  selectSuggestion(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const suggested = this.suggestedSlug();
    if (input && suggested && input.value === suggested) {
      input.select();
    }
  }

  submit(): void {
    if (this.form.invalid || this.loading) return;
    this.loading = true;
    this.errorMessage = null;

    this.auth
      .register({
        name: this.form.value.name,
        email: this.form.value.email,
        password: this.form.value.password,
        restaurantName: this.form.value.restaurantName,
        slug: this.form.value.slug,
      })
      .subscribe({
        next: () => {
          this.ngZone.run(() => {
            this.router.navigate(['/admin']);
            this.cdr.detectChanges();
          });
        },
        error: (err) => {
          this.ngZone.run(() => {
            this.loading = false;
          const msg = err.error?.message ?? '';
          const fieldErrors = err.error?.fieldErrors;

          if (fieldErrors && Object.keys(fieldErrors).length > 0) {
            const firstKey = Object.keys(fieldErrors)[0];
            this.errorMessage = fieldErrors[firstKey];
          } else if (msg) {
            this.errorMessage = msg;
            if (msg.toLowerCase().includes('correo')) {
              this.form.get('email')?.setErrors({ conflict: true });
            }
            if (msg.toLowerCase().includes('slug')) {
              this.form.get('slug')?.setErrors({ conflict: true });
            }
          } else {
            this.errorMessage = 'No se pudo completar el registro';
          }
            this.cdr.detectChanges();
          });
        },
      });
  }
}