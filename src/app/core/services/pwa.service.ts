import { Injectable, NgZone, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class PwaService {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  readonly canInstall = signal(false);
  readonly updateAvailable = signal(false);
  readonly isInstalled = signal(false);
  readonly isOnline = signal(typeof navigator !== 'undefined' ? navigator.onLine : true);

  constructor(private sw: SwUpdate, private zone: NgZone) {
    if (typeof window === 'undefined') {
      return;
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.zone.run(() => this.canInstall.set(true));
    });

    window.addEventListener('appinstalled', () => {
      this.zone.run(() => {
        this.isInstalled.set(true);
        this.canInstall.set(false);
        this.deferredPrompt = null;
      });
    });

    window.addEventListener('online', () =>
      this.zone.run(() => this.isOnline.set(true)),
    );
    window.addEventListener('offline', () =>
      this.zone.run(() => this.isOnline.set(false)),
    );

    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    ) {
      this.isInstalled.set(true);
    }

    if (this.sw.isEnabled) {
      this.sw.versionUpdates
        .pipe(
          filter(
            (e): e is VersionReadyEvent => e.type === 'VERSION_READY',
          ),
        )
        .subscribe(() =>
          this.zone.run(() => this.updateAvailable.set(true)),
        );
    }
  }

  async install(): Promise<void> {
    if (!this.deferredPrompt) {
      return;
    }
    this.deferredPrompt.prompt();
    await this.deferredPrompt.userChoice;
    this.deferredPrompt = null;
    this.canInstall.set(false);
  }

  reload(): void {
    window.location.reload();
  }
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
