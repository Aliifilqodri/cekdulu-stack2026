"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  ApiRequestError,
  CONDITION_OPTIONS,
  createReport,
  QUEUE_OPTIONS,
  type LocationItem,
  type QueueBucket,
  type ReportCondition,
} from "@/lib/api";

interface Props {
  open: boolean;
  locations: LocationItem[];
  defaultLocationId?: string | null;
  token: string | null;
  onClose: () => void;
  onRequireAuth: () => void;
  onSubmitted: () => void;
}

const CONDITION_ICONS: Record<ReportCondition, string> = {
  buka: "M3 21h18M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M14 12h.01",
  antre:
    "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  tutup:
    "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2ZM7 11V7a5 5 0 0 1 10 0v4",
  blanko_habis:
    "M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7ZM2 10h20",
  sistem_offline:
    "M2 2 22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.58 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01",
  petugas_tidak_ada:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM17 8l5 5M22 8l-5 5",
};

export default function ReportModal({
  open,
  locations,
  defaultLocationId,
  token,
  onClose,
  onRequireAuth,
  onSubmitted,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [locationId, setLocationId] = useState("");
  const [changingLocation, setChangingLocation] = useState(false);
  const [conditionType, setConditionType] = useState<ReportCondition>("antre");
  const [queueRange, setQueueRange] = useState<QueueBucket>("5-15");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (defaultLocationId) {
      setLocationId(defaultLocationId);
      setChangingLocation(false);
    } else if (!locationId && locations.length > 0) {
      setLocationId(locations[0].id);
    }
  }, [defaultLocationId, locations, locationId]);

  const selectedLocation = locations.find((l) => l.id === locationId);
  const activeCondition = CONDITION_OPTIONS.find(
    (c) => c.value === conditionType,
  );

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) {
      onRequireAuth();
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await createReport(token, {
        locationId,
        conditionType,
        queueRange: activeCondition?.supportsQueue ? queueRange : null,
        notes: notes.trim() || null,
      });
      setNotes("");
      onSubmitted();
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Gagal mengirim laporan kondisi.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={() => {
        if (dialogRef.current) {
          dialogRef.current.returnValue = "";
        }
        setError(null);
        onClose();
      }}
      {...({ closedby: "any" } as Record<string, string>)}
      className="m-auto h-dvh max-h-[96dvh] w-full max-w-md rounded-3xl bg-surface p-0 text-ink shadow-float open:flex open:flex-col"
    >
      {/* Header Figma 03 */}
      <header className="flex items-center justify-between px-4 pb-2 pt-4">
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Tutup form lapor"
          className="grid h-10 w-10 place-items-center rounded-full bg-white text-ink shadow-chip"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <h1 id={titleId} className="text-[15px] font-extrabold text-ink">
          Lapor kondisi
        </h1>

        <span className="w-10" aria-hidden="true" />
      </header>

      {!token ? (
        <div className="flex flex-1 flex-col justify-center px-5 pb-8">
          <div className="flex flex-col gap-3 rounded-3xl bg-white p-5 text-center shadow-chip">
            <p className="text-base font-extrabold text-ink">
              Masuk dengan WhatsApp dulu
            </p>
            <p className="text-xs text-muted">
              1 nomor WhatsApp = 1 akun untuk mencegah laporan palsu berulang.
            </p>
            <button
              type="button"
              onClick={() => {
                dialogRef.current?.close();
                onRequireAuth();
              }}
              className="min-h-[48px] rounded-2xl bg-brand px-4 text-sm font-bold text-white"
            >
              Verifikasi Nomor WhatsApp
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 pt-2">
            {error && (
              <div
                role="status"
                aria-live="polite"
                className="rounded-2xl bg-closed-soft px-3.5 py-2.5 text-xs font-semibold text-closed-text"
              >
                {error}
              </div>
            )}

            {/* Card lokasi saat ini + tombol Ganti */}
            <div className="rounded-[20px] bg-white p-3.5 shadow-chip">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      aria-hidden="true"
                    >
                      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
                      <circle cx="12" cy="9.5" r="2.5" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-muted">
                      Kamu lagi di
                    </p>
                    <p className="truncate text-sm font-extrabold text-ink">
                      {selectedLocation?.name || "Pilih lokasi layanan"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setChangingLocation((v) => !v)}
                  className="shrink-0 px-2 py-1 text-xs font-bold text-brand"
                >
                  {changingLocation ? "Selesai" : "Ganti"}
                </button>
              </div>

              {changingLocation && (
                <div className="mt-3">
                  <label htmlFor="report-location-select" className="sr-only">
                    Pilih lokasi layanan
                  </label>
                  <select
                    id="report-location-select"
                    name="locationId"
                    required
                    value={locationId}
                    onChange={(e) => {
                      setLocationId(e.target.value);
                      setChangingLocation(false);
                    }}
                    className="min-h-[44px] w-full rounded-xl border border-line bg-surface px-3 text-sm font-semibold outline-none focus:border-brand"
                  >
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} ({loc.categoryLabel})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Grid 3x2 kondisi layanan sesuai Figma 03 */}
            <fieldset>
              <legend className="mb-2 text-xs font-extrabold text-ink">
                Apa yang kamu lihat sekarang?
              </legend>
              <div className="grid grid-cols-3 gap-2.5">
                {CONDITION_OPTIONS.map((opt) => {
                  const selected = conditionType === opt.value;
                  const isAmber = opt.value === "antre";
                  return (
                    <label
                      key={opt.value}
                      className={`flex min-h-[82px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border p-2.5 text-center transition ${
                        selected
                          ? isAmber
                            ? "border-queue bg-queue-soft/60 text-queue-text"
                            : "border-brand bg-brand-soft/60 text-brand-dark"
                          : "border-transparent bg-white text-ink shadow-chip"
                      }`}
                    >
                      <input
                        type="radio"
                        name="conditionType"
                        value={opt.value}
                        checked={selected}
                        onChange={() => setConditionType(opt.value)}
                        className="sr-only"
                      />
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d={CONDITION_ICONS[opt.value]} />
                      </svg>
                      <span className="text-[11.5px] font-bold leading-tight">
                        {opt.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* Segmented queue picker sesuai Figma 03 */}
            {activeCondition?.supportsQueue && (
              <fieldset>
                <legend className="mb-2 text-xs font-extrabold text-ink">
                  Kira-kira antre berapa orang?
                </legend>
                <div className="grid grid-cols-4 gap-1 rounded-2xl bg-white p-1.5 shadow-chip">
                  {QUEUE_OPTIONS.map((q) => {
                    const selected = queueRange === q;
                    return (
                      <label
                        key={q}
                        className={`flex min-h-[40px] cursor-pointer items-center justify-center rounded-xl text-xs font-bold transition ${
                          selected
                            ? "bg-ink text-white"
                            : "text-ink hover:bg-surface"
                        }`}
                      >
                        <input
                          type="radio"
                          name="queueRange"
                          value={q}
                          checked={selected}
                          onChange={() => setQueueRange(q)}
                          className="sr-only"
                        />
                        {q}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {/* Catatan opsional */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="report-notes" className="text-xs font-extrabold">
                Catatan <span className="font-medium text-muted">(opsional)</span>
              </label>
              <textarea
                id="report-notes"
                name="notes"
                rows={2}
                maxLength={500}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Mis. Nomor antrean yang dipanggil sekarang 47"
                className="rounded-2xl border border-brand/50 bg-white px-3.5 py-3 text-base outline-none focus:border-brand"
              />
            </div>

            {/* Info banner konsensus 2 jam sesuai Figma 03 */}
            <div className="flex items-start gap-2.5 rounded-2xl bg-brand-soft/65 p-3.5 text-xs text-brand-dark">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <p className="leading-relaxed">
                Laporanmu tampil sebagai <strong>menunggu konfirmasi</strong>{" "}
                sampai terkonfirmasi oleh bobot laporan warga lain. Otomatis
                hilang setelah 2 jam.
              </p>
            </div>
          </div>

          <footer className="border-t border-line bg-white px-4 py-3">
            <button
              type="submit"
              disabled={submitting || !locationId}
              className="min-h-[48px] w-full rounded-2xl bg-brand px-4 text-sm font-bold text-white transition hover:bg-brand-dark disabled:opacity-60"
            >
              {submitting ? "Mengirim..." : "Kirim laporan"}
            </button>
          </footer>
        </form>
      )}
    </dialog>
  );
}
