import { useEffect, useId, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { createScreenWakeLock, screenWakeLockPreference } from "@/lib/screen-wake-lock";

/** One instance per operational view, outside repeated ride cards. */
export function ScreenWakeLockSetting({ active, userId }: { active: boolean; userId?: string }) {
  const id = useId();
  const storageKey = `gopet:screen-wake-lock:${userId ?? "shared-tracking"}`;
  const [preference, setPreference] = useState<{ key: string; enabled: boolean } | null>(null);
  const enabled = preference?.key === storageKey ? preference.enabled : true;

  useEffect(() => {
    let value: string | null = null;
    try { value = localStorage.getItem(storageKey); } catch { /* Storage may be unavailable. */ }
    setPreference({ key: storageKey, enabled: screenWakeLockPreference(value) });
  }, [storageKey]);

  useEffect(() => {
    if (!active || preference?.key !== storageKey) return;
    const controller = createScreenWakeLock({
      ...(navigator.wakeLock ? { request: () => navigator.wakeLock.request("screen") } : {}),
      isVisible: () => document.visibilityState === "visible",
    });
    controller.setEnabled(enabled);
    const onVisibilityChange = () => controller.visibilityChanged();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      controller.dispose();
    };
  }, [active, enabled, storageKey, preference?.key]);

  if (!active) return null;
  return (
    <div className="flex items-center gap-2 py-2">
      <Switch id={id} checked={enabled} onCheckedChange={(value) => {
        setPreference({ key: storageKey, enabled: value });
        try { localStorage.setItem(storageKey, String(value)); } catch { /* Keep session preference. */ }
      }} />
      <Label htmlFor={id} className="text-sm">Manter tela sempre ativa</Label>
    </div>
  );
}