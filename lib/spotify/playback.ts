import { getSettings, updateSettings } from "@/lib/db/settings";
import { AppError, SpotifyHttpError } from "@/lib/errors";
import { getDevices, startPlayback, transferPlayback } from "@/lib/spotify/client";
import type { Device, Settings } from "@/lib/types";
import { sleep } from "@/lib/utils";

/** Give Spotify a moment to wake the device after a transfer before playing. */
const TRANSFER_SETTLE_MS = 300;

/** Used when no device is linked: first phone, else whatever is active. */
export function pickFallbackDevice(devices: Device[]): Device | null {
  return devices.find((d) => d.type === "Smartphone") ?? devices.find((d) => d.isActive) ?? null;
}

/** Used when the linked device 404s: same id, else same-named phone, else any phone. */
export function findRecoveryDevice(
  devices: Device[],
  linked: Pick<Settings, "deviceId" | "deviceName">,
): Device | null {
  return (
    devices.find((d) => d.id === linked.deviceId) ??
    devices.find((d) => d.type === "Smartphone" && d.name === linked.deviceName) ??
    devices.find((d) => d.type === "Smartphone") ??
    null
  );
}

function isNotFound(err: unknown): boolean {
  return err instanceof SpotifyHttpError && err.httpStatus === 404;
}

/**
 * Starts `track` at `positionMs` on the user's linked phone, recovering from a
 * stale/asleep device by re-finding it and transferring playback (spec §11.4).
 */
export async function playOnDevice(
  userId: string,
  track: { uri: string; name: string },
  positionMs: number,
): Promise<void> {
  const settings = await getSettings(userId);
  const deviceId = settings.deviceId ?? pickFallbackDevice(await getDevices(userId))?.id;
  if (!deviceId) throw new AppError("NO_DEVICE");

  try {
    await startPlayback(userId, deviceId, track.uri, positionMs);
    return;
  } catch (err) {
    if (!isNotFound(err)) {
      if (err instanceof SpotifyHttpError && err.httpStatus < 500) {
        throw new AppError("TRACK_UNAVAILABLE", `Couldn't play ${track.name}. Try again.`);
      }
      throw err;
    }
  }

  const target = findRecoveryDevice(await getDevices(userId), settings);
  if (!target) throw new AppError("NO_DEVICE");
  if (target.id !== settings.deviceId) {
    await updateSettings(userId, { deviceId: target.id, deviceName: target.name });
  }

  try {
    await transferPlayback(userId, target.id);
    await sleep(TRANSFER_SETTLE_MS);
    await startPlayback(userId, target.id, track.uri, positionMs);
  } catch (err) {
    if (err instanceof SpotifyHttpError) throw new AppError("NO_DEVICE");
    throw err;
  }
}
