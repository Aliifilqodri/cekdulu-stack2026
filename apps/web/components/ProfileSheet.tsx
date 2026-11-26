"use client";

import { useEffect, useState, type FormEvent } from "react";
import StatusChip from "./StatusChip";
import {
  ApiRequestError,
  fetchReports,
  formatRelativeMinutes,
  getInitials,
  maskPhoneNumber,
  toUiStatus,
  updateMe,
  type AuthUserProfile,
  type ReportFeedItem,
  type WatchlistItem,
} from "@/lib/api";

interface Props {
  token: string | null;
  user: AuthUserProfile | null;
  watchlist: WatchlistItem[];
  onOpenAuth: () => void;
  onOpenRtPanel: () => void;
  onLogout: () => void;
  onUserUpdated: (user: AuthUserProfile) => void;
  onSelectLocation: (locationId: string) => void;
}

export default function ProfileSheet({
  token,
  user,
  watchlist,
  onOpenAuth,
  onOpenRtPanel,
  onLogout,
  onUserUpdated,
  onSelectLocation,
}: Props) {
  const [editingName, setEditingName] = useState(false);
  const [fullName, setFullName] = useState(user?.fullName || "");
  const [waNotifEnabled, setWaNotifEnabled] = useState(
    user?.waNotifEnabled ?? true,
  );
  const [saving, setSaving] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [recentReports, setRecentReports] = useState<ReportFeedItem[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setFullName(user?.fullName || "");
    setWaNotifEnabled(user?.waNotifEnabled ?? true);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void fetchReports()
      .then((list) => {
        const mine = list.filter((r) => r.reporter.id === user.id);
        setRecentReports((mine.length > 0 ? mine : list).slice(0, 3));
      })
      .catch(() => undefined);
  }, [user]);

  async function handleToggleWaNotif() {
    if (!token || !user) return;
    const nextValue = !waNotifEnabled;
    setWaNotifEnabled(nextValue);
    try {
      const updated = await updateMe(token, { waNotifEnabled: nextValue });
      onUserUpdated({
        ...user,
        waNotifEnabled: updated.waNotifEnabled,
      });
    } catch {
      setWaNotifEnabled(!nextValue);
    }
  }

  async function handleSaveName(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token || !user) return;
    setSaving(true);
    setFeedback(null);
    try {
      const updated = await updateMe(token, {
        fullName: fullName.trim() || null,
      });
      onUserUpdated({
        ...user,
        fullName: updated.fullName,
      });
      setEditingName(false);
      setFeedback("Nama tampilan diperbarui.");
    } catch (err) {
      setFeedback(
        err instanceof ApiRequestError
          ? err.message
          : "Gagal menyimpan nama tampilan.",
      );
    } finally {
      setSaving(false);
    }
  }

  const totalReports = user?.reputation?.totalReports ?? 0;
  const matchedReports = user?.reputation?.matchedReports ?? 0;
  const accuracyPct =
    totalReports > 0 ? Math.round((matchedReports / totalReports) * 100) : 0;
  const isTrusted = user?.reputation?.isTrustedReporter ?? false;
  const canOpenRtPanel =
    user?.role === "pengurus_rt" ||
    user?.role === "admin" ||
    (user?.rtOfficialAssignments?.length ?? 0) > 0;

  return (
    <section className="flex h-[calc(100dvh-78px)] flex-col overflow-y-auto bg-surface px-4 pb-6 pt-5">
      {!token || !user ? (
        <div className="my-auto flex flex-col items-center gap-3 rounded-3xl bg-white p-6 text-center shadow-chip">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-brand">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <h1 className="text-lg font-extrabold text-ink">
            Masuk Akun Warga
          </h1>
          <p className="text-xs leading-relaxed text-muted">
            Masuk sekali pakai nomor WhatsApp untuk mengirim laporan kondisi,
            memantau lokasi favorit, dan meraih badge{" "}
            <strong>Pelapor Terpercaya</strong>.
          </p>
          <button
            type="button"
            onClick={onOpenAuth}
            className="mt-1 min-h-[48px] w-full rounded-2xl bg-brand px-4 text-sm font-bold text-white"
          >
            Verifikasi Nomor WhatsApp
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {/* Header Avatar + Nama + Nomor Terverifikasi sesuai Figma 08 */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#FDE68A] text-base font-extrabold text-[#92400E]">
                {getInitials(user.fullName)}
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-extrabold text-ink">
                  {user.fullName || "Warga CekDulu"}
                </h1>
                <p className="text-xs text-muted">
                  {maskPhoneNumber(user.phoneNumber)} ·{" "}
                  {user.isVerified ? "terverifikasi" : "belum verifikasi"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEditingName((v) => !v)}
              className="rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-ink shadow-chip"
            >
              {editingName ? "Tutup" : "Ubah"}
            </button>
          </div>

          {editingName && (
            <form
              onSubmit={handleSaveName}
              className="flex gap-2 rounded-2xl bg-white p-3 shadow-chip"
            >
              <input
                type="text"
                value={fullName}
                maxLength={100}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nama tampilan"
                className="min-h-[42px] min-w-0 flex-1 rounded-xl border border-line px-3 text-sm outline-none focus:border-brand"
              />
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-brand px-3.5 text-xs font-bold text-white"
              >
                Simpan
              </button>
            </form>
          )}

          {feedback && (
            <p
              role="status"
              aria-live="polite"
              className="rounded-xl bg-brand-soft px-3 py-2 text-xs font-semibold text-brand-dark"
            >
              {feedback}
            </p>
          )}

          {/* Card Pelapor Terpercaya sesuai Figma 08 */}
          <article className="rounded-[22px] bg-brand-dark p-4 text-white shadow-chip">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  aria-hidden="true"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-extrabold">
                  {isTrusted
                    ? "Pelapor terpercaya"
                    : "Menuju Pelapor Terpercaya"}
                </h2>
                <p className="mt-0.5 text-xs leading-relaxed text-teal-100">
                  {isTrusted
                    ? "Laporanmu tampil lebih dulu dan langsung dihitung 2 suara"
                    : "Capai minimal 10 laporan dengan akurasi ≥ 90% agar suara bernilai 2x"}
                </p>
              </div>
            </div>

            <div className="mt-3.5 h-2 w-full overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-[#FACC15] transition-all"
                style={{ width: `${Math.max(6, Math.min(100, accuracyPct))}%` }}
              />
            </div>

            <div className="mt-2 flex items-center justify-between text-xs font-semibold text-teal-100">
              <span>
                {matchedReports} dari {totalReports} laporan cocok
              </span>
              <span>{accuracyPct}%</span>
            </div>
          </article>

          {/* 3 Stat Cards sesuai Figma 08 */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-2xl bg-white p-3.5 shadow-chip">
              <p className="text-xl font-extrabold text-ink">{totalReports}</p>
              <p className="text-[11px] text-muted">laporan</p>
            </div>
            <div className="rounded-2xl bg-white p-3.5 shadow-chip">
              <p className="text-xl font-extrabold text-ink">
                {matchedReports}
              </p>
              <p className="text-[11px] text-muted">terkonfirmasi</p>
            </div>
            <div className="rounded-2xl bg-white p-3.5 shadow-chip">
              <p className="text-xl font-extrabold text-ink">
                {watchlist.length}
              </p>
              <p className="text-[11px] text-muted">lokasi favorit</p>
            </div>
          </div>

          {/* Riwayat terakhir sesuai Figma 08 */}
          <article className="rounded-[20px] bg-white p-4 shadow-chip">
            <h2 className="mb-3 text-sm font-extrabold text-ink">
              Riwayat terakhir
            </h2>
            {recentReports.length === 0 ? (
              <p className="text-xs text-muted">
                Belum ada riwayat laporan aktif.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {recentReports.map((rep) => {
                  const statusMap =
                    rep.conditionType === "buka"
                      ? "buka"
                      : rep.conditionType === "antre"
                        ? "antre"
                        : "tutup";
                  return (
                    <button
                      type="button"
                      key={rep.id}
                      onClick={() => onSelectLocation(rep.locationId)}
                      className="flex items-center gap-3 text-left"
                    >
                      <StatusChip
                        status={toUiStatus(statusMap)}
                        label={
                          rep.conditionType === "buka"
                            ? "Buka"
                            : rep.conditionType === "antre"
                              ? "Antre"
                              : "Tutup"
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-extrabold text-ink">
                          {rep.locationName}
                        </p>
                        <p className="text-[11px] text-muted">
                          {formatRelativeMinutes(rep.createdAt)} ·{" "}
                          {rep.validationStatus === "confirmed"
                            ? "terkonfirmasi warga"
                            : "menunggu konfirmasi"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </article>

          {/* Settings Card sesuai Figma 08 */}
          <article className="divide-y divide-line rounded-[20px] bg-white px-4 shadow-chip">
            <div className="flex min-h-[54px] items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 text-xs font-bold text-ink">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                <span>Notifikasi lewat WhatsApp</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={waNotifEnabled}
                onClick={() => void handleToggleWaNotif()}
                className={`relative h-7 w-12 rounded-full transition ${
                  waNotifEnabled ? "bg-brand" : "bg-slate-300"
                }`}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-white shadow transition ${
                    waNotifEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowFavorites((v) => !v)}
              className="flex min-h-[54px] w-full items-center justify-between gap-3 py-2 text-left text-xs font-bold text-ink"
            >
              <span className="flex items-center gap-3">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                Lokasi favorit ({watchlist.length})
              </span>
              <span className="text-muted">›</span>
            </button>

            {showFavorites && (
              <div className="flex flex-col gap-2 py-3">
                {watchlist.length === 0 ? (
                  <p className="text-xs text-muted">
                    Belum ada lokasi favorit. Tap ikon bintang pada detail
                    lokasi untuk memantau.
                  </p>
                ) : (
                  watchlist.map((w) => (
                    <button
                      type="button"
                      key={w.locationId}
                      onClick={() => onSelectLocation(w.locationId)}
                      className="flex items-center justify-between rounded-xl bg-surface px-3 py-2 text-left"
                    >
                      <span className="truncate pr-2 text-xs font-bold text-ink">
                        {w.name}
                      </span>
                      <StatusChip
                        status={toUiStatus(w.summary?.currentStatus)}
                        label={w.summary?.statusLabel}
                      />
                    </button>
                  ))
                )}
              </div>
            )}

            {canOpenRtPanel && (
              <button
                type="button"
                onClick={onOpenRtPanel}
                className="flex min-h-[54px] w-full items-center justify-between gap-3 py-2 text-left text-xs font-bold text-brand"
              >
                <span className="flex items-center gap-3">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
                  </svg>
                  Panel Pengurus RT
                </span>
                <span>›</span>
              </button>
            )}

            <button
              type="button"
              onClick={onLogout}
              className="flex min-h-[54px] w-full items-center gap-3 py-2 text-left text-xs font-bold text-closed-text"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Keluar
            </button>
          </article>
        </div>
      )}
    </section>
  );
}
