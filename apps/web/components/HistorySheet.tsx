"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CONDITION_OPTIONS,
  fetchNotifications,
  fetchReports,
  formatRelativeMinutes,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
  type ReportFeedItem,
} from "@/lib/api";

interface Props {
  token: string | null;
  onSelectLocation: (locationId: string) => void;
  onNotificationsChanged: (unreadCount: number) => void;
}

export default function HistorySheet({
  token,
  onSelectLocation,
  onNotificationsChanged,
}: Props) {
  const [subtab, setSubtab] = useState<"reports" | "notifications">("reports");
  const [reports, setReports] = useState<ReportFeedItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [repData, notifData] = await Promise.all([
        fetchReports(),
        token ? fetchNotifications(token) : Promise.resolve(null),
      ]);
      setReports(repData);
      if (notifData) {
        setNotifications(notifData.items);
        onNotificationsChanged(notifData.unreadCount);
      }
    } catch {
      setError("Gagal memuat riwayat aktivitas dari API.");
    } finally {
      setLoading(false);
    }
  }, [token, onNotificationsChanged]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleReadAll() {
    if (!token) return;
    await markAllNotificationsRead(token);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    onNotificationsChanged(0);
  }

  async function handleReadOne(id: string) {
    if (!token) return;
    await markNotificationRead(token, id);
    setNotifications((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, isRead: true } : n));
      onNotificationsChanged(next.filter((n) => !n.isRead).length);
      return next;
    });
  }

  return (
    <section className="flex h-[calc(100dvh-78px)] flex-col bg-surface px-4 pb-4 pt-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-extrabold text-ink">Aktivitas Terbaru</h1>
          <p className="text-xs text-muted">
            Laporan warga aktif 2 jam & notifikasi pantauan
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          className="rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-ink shadow-chip"
        >
          Segarkan
        </button>
      </div>

      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={() => setSubtab("reports")}
          className={`flex-1 rounded-xl py-2 text-xs font-bold ${
            subtab === "reports"
              ? "bg-ink text-white"
              : "bg-white text-muted shadow-chip"
          }`}
        >
          Laporan Warga ({reports.length})
        </button>
        <button
          type="button"
          onClick={() => setSubtab("notifications")}
          className={`flex-1 rounded-xl py-2 text-xs font-bold ${
            subtab === "notifications"
              ? "bg-ink text-white"
              : "bg-white text-muted shadow-chip"
          }`}
        >
          Notifikasi ({notifications.filter((n) => !n.isRead).length})
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-xl bg-closed-soft p-3 text-xs font-semibold text-closed-text">
          {error}
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto pb-4">
        {loading ? (
          [1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-2xl bg-white"
            />
          ))
        ) : subtab === "reports" ? (
          reports.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">
              Belum ada laporan aktif saat ini.
            </p>
          ) : (
            reports.map((rep) => {
              const condLabel =
                CONDITION_OPTIONS.find((c) => c.value === rep.conditionType)
                  ?.label || rep.conditionType;
              return (
                <button
                  type="button"
                  key={rep.id}
                  onClick={() => onSelectLocation(rep.locationId)}
                  className="rounded-2xl bg-white p-3.5 text-left shadow-chip"
                >
                  <div className="flex items-center justify-between gap-2">
                    <b className="truncate text-sm text-ink">
                      {rep.locationName}
                    </b>
                    <span className="shrink-0 text-[11px] text-muted">
                      {formatRelativeMinutes(rep.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-bold text-brand">
                    {condLabel}
                    {rep.queueRange ? ` · Antrean ${rep.queueRange}` : ""}
                  </p>
                  {rep.notes && (
                    <p className="mt-1 text-xs text-slate-600">{rep.notes}</p>
                  )}
                  <p className="mt-1.5 text-[11px] text-muted">
                    Oleh {rep.reporter.name}
                    {rep.reporter.isTrustedReporter ? " (Trusted Reporter)" : ""} ·{" "}
                    {rep.validationStatus === "confirmed"
                      ? "Terkonfirmasi"
                      : "Menunggu konfirmasi"}
                  </p>
                </button>
              );
            })
          )
        ) : !token ? (
          <p className="py-10 text-center text-xs text-muted">
            Masuk lewat menu Profil untuk melihat notifikasi lokasi yang kamu
            pantau.
          </p>
        ) : (
          <>
            {notifications.some((n) => !n.isRead) && (
              <button
                type="button"
                onClick={() => void handleReadAll()}
                className="self-end text-xs font-bold text-brand"
              >
                Tandai semua dibaca
              </button>
            )}
            {notifications.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">
                Belum ada notifikasi.
              </p>
            ) : (
              notifications.map((n) => (
                <button
                  type="button"
                  key={n.id}
                  onClick={() => void handleReadOne(n.id)}
                  className={`rounded-2xl p-3.5 text-left shadow-chip ${
                    n.isRead ? "bg-white" : "border border-brand/30 bg-brand-soft/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <b className="text-sm text-ink">{n.title}</b>
                    <span className="text-[11px] text-muted">
                      {formatRelativeMinutes(n.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-700">{n.body}</p>
                </button>
              ))
            )}
          </>
        )}
      </div>
    </section>
  );
}
