"use client";

import StatusChip from "./StatusChip";
import { toUiStatus, type Kategori, type LocationItem, type UiStatus } from "@/lib/api";

const IKON: Record<Kategori, string> = {
  Kelurahan: "M3 21h18M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M14 12h.01",
  "Kantor RT":
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M9 13h6M9 17h4",
  Puskesmas:
    "M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z",
  Samsat: "M5 17h14M6 17v2M18 17v2M3 13l2-6h14l2 6v4H3zM7 13h.01M17 13h.01",
};

const WARNA: Record<UiStatus, { bg: string; stroke: string }> = {
  open: { bg: "bg-open-soft", stroke: "#15803D" },
  queue: { bg: "bg-queue-soft", stroke: "#B45309" },
  closed: { bg: "bg-closed-soft", stroke: "#B91C1C" },
  unknown: { bg: "bg-unknown-soft", stroke: "#475569" },
};

type Props = {
  items: LocationItem[];
  loading: boolean;
  error: string | null;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (loc: LocationItem) => void;
  onRetry: () => void;
};

export default function BottomSheet({
  items,
  loading,
  error,
  expanded,
  onToggle,
  onSelect,
  onRetry,
}: Props) {
  return (
    <section
      className={`absolute inset-x-0 bottom-[78px] z-[1000] flex flex-col rounded-t-[26px] bg-white shadow-sheet transition-[height] duration-300 ${
        expanded ? "h-[72%]" : "h-[38%]"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full justify-center pb-1.5 pt-2.5"
        aria-label={expanded ? "Perkecil daftar" : "Buka daftar"}
      >
        <i className="h-[5px] w-10 rounded-full bg-line" />
      </button>

      <div className="flex items-center justify-between px-4 pb-2.5">
        <b className="text-base">Di sekitarmu</b>
        <button
          type="button"
          onClick={onToggle}
          className="text-[12.5px] font-bold text-brand"
        >
          {expanded ? "Tutup" : "Lihat semua"}
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 pb-4">
        {loading && items.length === 0 && (
          <div className="flex flex-col gap-2.5 py-2">
            {[1, 2, 3].map((k) => (
              <div
                key={k}
                className="h-[74px] animate-pulse rounded-[17px] bg-surface"
              />
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-closed/20 bg-closed-soft p-3 text-center">
            <p className="text-xs font-semibold text-closed-text">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-ink shadow-chip"
            >
              Coba lagi
            </button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">
            Nggak ada lokasi yang cocok.
          </p>
        )}

        {items.map((l) => {
          const uiStatus = toUiStatus(l.summary?.currentStatus);
          return (
            <button
              type="button"
              key={l.id}
              onClick={() => onSelect(l)}
              className="flex w-full items-center gap-3 rounded-[17px] bg-surface p-3 text-left transition hover:bg-slate-200/70"
            >
              <span
                className={`grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[13px] ${WARNA[uiStatus].bg}`}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={WARNA[uiStatus].stroke}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d={IKON[l.categoryLabel]} />
                </svg>
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2">
                  <b className="truncate text-sm">{l.name}</b>
                  <StatusChip
                    status={uiStatus}
                    label={l.summary?.statusLabel}
                  />
                </span>
                <span className="mt-0.5 text-[12.5px] font-medium">
                  {l.headline}
                </span>
                <small className="text-[11px] text-muted">
                  {l.distanceKm !== null ? `${l.distanceKm} km · ` : ""}
                  {l.metaText}
                </small>
              </span>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#94A3B8"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          );
        })}
        <p className="pt-1 text-center text-[10.5px] text-muted">
          Data layanan real-time CekDulu API · Peta © OpenStreetMap contributors
        </p>
      </div>
    </section>
  );
}
