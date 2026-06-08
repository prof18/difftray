export const DAILY_UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1_000;

type Timer = ReturnType<typeof setTimeout>;

export class UpdateCheckScheduler {
  private checkInFlight: Promise<void> | undefined;
  private hasChecked = false;
  private started = false;
  private timer: Timer | undefined;

  constructor(
    private readonly dependencies: {
      readonly checkForUpdates: () => Promise<void>;
      readonly intervalMs?: number;
    }
  ) {}

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;

    if (!this.hasChecked) {
      void this.checkNow();
    }

    this.scheduleNextCheck();
  }

  async checkNow(): Promise<void> {
    this.hasChecked = true;
    this.checkInFlight ??= this.dependencies.checkForUpdates().finally(() => {
      this.checkInFlight = undefined;
    });

    return this.checkInFlight;
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    this.started = false;
  }

  private scheduleNextCheck(): void {
    if (this.timer) {
      return;
    }

    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.checkNow().finally(() => {
        if (this.started) {
          this.scheduleNextCheck();
        }
      });
    }, this.dependencies.intervalMs ?? DAILY_UPDATE_CHECK_INTERVAL_MS);
  }
}
