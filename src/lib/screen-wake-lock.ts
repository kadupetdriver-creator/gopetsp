export interface ScreenLock {
  readonly released: boolean;
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
}

/** Called after mount only; injected ports keep lifecycle testable without browser globals. */
export function createScreenWakeLock(ports: {
  request?: () => Promise<ScreenLock>;
  isVisible: () => boolean;
}) {
  let enabled = false;
  let disposed = false;
  let pending = false;
  let lock: ScreenLock | null = null;

  const release = () => {
    const previous = lock;
    lock = null;
    if (previous && !previous.released) void previous.release().catch(() => {});
  };

  const sync = async () => {
    if (disposed || !enabled || !ports.isVisible()) {
      release();
      return;
    }
    if (lock || pending || !ports.request) return;
    pending = true;
    try {
      const acquired = await ports.request();
      if (disposed || !enabled || !ports.isVisible()) {
        await acquired.release().catch(() => {});
        return;
      }
      lock = acquired;
      acquired.addEventListener("release", () => {
        if (lock === acquired) lock = null;
        // Battery/OS releases are respected; retry only on visibility or preference changes.
      });
    } catch {
      // Unsupported contexts, battery saver and denied requests must not affect rides/GPS.
    } finally {
      pending = false;
    }
  };

  return {
    setEnabled(value: boolean) { enabled = value; void sync(); },
    visibilityChanged() { void sync(); },
    dispose() { disposed = true; release(); },
  };
}

export function screenWakeLockPreference(value: string | null): boolean {
  return value !== "false";
}