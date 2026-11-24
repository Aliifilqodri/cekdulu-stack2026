"use client";

export const FILTERS = [
  "Semua",
  "Kantor RT",
  "Kelurahan",
  "Puskesmas",
  "Samsat",
] as const;
export type Filter = (typeof FILTERS)[number];

type Props = {
  query: string;
  onQuery: (v: string) => void;
  filter: Filter;
  onFilter: (f: Filter) => void;
};

function Logo() {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-[9px] bg-brand py-1 pl-1 pr-2 text-[12.5px] font-extrabold text-white">
      <svg width="18" height="18" viewBox="0 0 24 24">
        <path d="M12 22s-8-7-8-13a8 8 0 0 1 16 0c0 6-8 13-8 13Z" fill="#fff" />
        <path
          d="m8.6 9.4 2.4 2.4 4.4-4.6"
          stroke="#0F766E"
          strokeWidth="2.4"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      CekDulu
    </span>
  );
}

export default function Header({ query, onQuery, filter, onFilter }: Props) {
  return (
    <div className="absolute inset-x-0 top-0 z-[1000] flex flex-col gap-2.5 px-4 pt-3">
      <label className="flex items-center gap-2.5 rounded-2xl bg-white py-2 pl-2 pr-3.5 shadow-float">
        <Logo />
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#64748B"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Cari RT, kelurahan, puskesmas"
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
        />
      </label>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => onFilter(f)}
            className={`shrink-0 rounded-full px-3.5 py-2 text-[12.5px] font-semibold shadow-chip ${
              filter === f ? "bg-ink text-white" : "bg-white text-ink"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <span className="flex items-center gap-1.5 self-start rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-muted shadow-chip">
        <i className="h-[7px] w-[7px] animate-pulse rounded-full bg-open" />
        Live · update 2 mnt lalu
      </span>
    </div>
  );
}
