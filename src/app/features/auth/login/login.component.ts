import { ChangeDetectorRef, Component, NgZone, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly ngZone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly form: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  loading = false;
  errorMessage: string | null = null;

  submit(): void {
    if (this.form.invalid || this.loading) return;
    this.loading = true;
    this.errorMessage = null;

    this.auth.login(this.form.value.email, this.form.value.password).subscribe({
      next: (user) => {
        this.ngZone.run(() => {
          const role = (user.role ?? '').startsWith('ROLE_') ? user.role.substring(5) : user.role;
          this.router.navigate([role === 'SUPER_ADMIN' ? '/admin/super-admin/dashboard' : '/admin']);
          this.cdr.detectChanges();
        });
      },
      error: (err) => {
        this.ngZone.run(() => {
          this.loading = false;
          this.errorMessage = err.error?.message ?? 'Credenciales inválidas';
          this.cdr.detectChanges();
        });
      },
    });
  }
}