"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { Card, SectionLabel, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";
import type { Device } from "@/lib/types";

interface DevicesResponse {
  devices: Device[];
  linkedDeviceId: string | null;
  linkedDeviceName: string | null;
}

export function DeviceSection() {
  const toast = useToast();
  const [data, setData] = useState<DevicesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<DevicesResponse>("/api/devices"));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const link = async (device: Device) => {
    setLinkingId(device.id);
    try {
      await api("/api/devices/select", { method: "POST", body: { deviceId: device.id, deviceName: device.name } });
      setData((prev) => prev && { ...prev, linkedDeviceId: device.id, linkedDeviceName: device.name });
      toast(`Linked ${device.name}`);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setLinkingId(null);
    }
  };

  const linkedMissing =
    data?.linkedDeviceId && !data.devices.some((d) => d.id === data.linkedDeviceId) ? data.linkedDeviceName : null;

  return (
    <Card>
      <div className="flex items-start justify-between">
        <SectionLabel>Device</SectionLabel>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="-mt-2 -mr-2 flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-volt disabled:opacity-50"
        >
          {loading && <Spinner />} Refresh
        </button>
      </div>
      <p className="-mt-1 mb-3 text-sm text-muted">Open Spotify on your phone first so it appears here.</p>

      {error && (
        <p role="alert" className="mb-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {linkedMissing && (
        <p className="mb-3 rounded-xl bg-raised px-3 py-2 text-sm text-muted">
          Linked: <span className="font-semibold text-fg">{linkedMissing}</span> (not visible right now)
        </p>
      )}

      {data?.devices.length === 0 && (
        <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-sm text-muted">
          No devices found.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {data?.devices.map((device) => {
          const linked = device.id === data.linkedDeviceId;
          return (
            <li key={device.id}>
              <button
                type="button"
                onClick={() => link(device)}
                disabled={linked || linkingId !== null}
                className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border px-4 text-left ${
                  linked ? "border-volt bg-volt/10" : "border-line bg-raised active:bg-line"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{device.name}</span>
                  <span className="block text-xs text-muted">
                    {device.type}
                    {device.isActive ? " · active" : ""}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-volt">
                  {linkingId === device.id ? <Spinner /> : linked ? "Linked ✓" : "Link this"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
