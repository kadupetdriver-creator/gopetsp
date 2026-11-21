export const INSTALL_DISMISS_STORAGE_KEY = "gopet-sp:install-dismissed-at";
export const INSTALL_DISMISS_DURATION_MS = 24 * 60 * 60 * 1000;

export type InstallPlatform = "android" | "ios" | "other";

export function shouldShowInstallInvite({
  installed,
  dismissedAt,
  now,
}: {
  installed: boolean;
  dismissedAt: string | null;
  now: number;
}): boolean {
  if (installed) return false;
  if (!dismissedAt) return true;

  const dismissedTime = Number(dismissedAt);
  if (!Number.isFinite(dismissedTime)) return true;

  return now >= dismissedTime + INSTALL_DISMISS_DURATION_MS;
}

export function detectInstallPlatform(userAgent: string): InstallPlatform {
  if (/android/i.test(userAgent)) return "android";
  if (/iPad|iPhone|iPod/i.test(userAgent)) return "ios";
  return "other";
}
