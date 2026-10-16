"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { Card, pill, SectionLabel, Spinner } from "@/components/ui";
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
          className={`${pill.secondary} -mt-1 min-h-8 px-3 text-[13px]`}
        >
          {loading && <Spinner />} Refresh
        </button>
      </div>
      <p className="-mt-1 mb-3 text-sm text-muted">Open Spotify on your phone first so it appears here.</p>

      {error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      )}

      {linkedMissing && (
        <p className="mb-3 text-sm text-muted">
          Linked: <span className="font-semibold text-fg">{linkedMissing}</span> (not visible right now)
        </p>
      )}

      {data?.devices.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">
          No devices found.
        </p>
      )}

      <ul className="-mx-2 flex flex-col">
        {data?.devices.map((device) => {
          const linked = device.id === data.linkedDeviceId;
          return (
            <li key={device.id}>
              <button
                type="button"
                onClick={() => link(device)}
                disabled={linked || linkingId !== null}
                className="flex min-h-14 w-full items-center justify-between gap-3 rounded-md px-2 text-left active:bg-raised"
              >
                <span className="min-w-0">
                  <span className={`block truncate text-base font-medium ${linked ? "text-accent" : ""}`}>{device.name}</span>
                  <span className="block text-sm text-muted">
                    {device.type}
                    {device.isActive ? " · active" : ""}
                  </span>
                </span>
                <span className={`shrink-0 text-sm font-bold ${linked ? "text-accent" : "text-muted"}`}>
                  {linkingId === device.id ? <Spinner /> : linked ? "Linked" : "Link"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
