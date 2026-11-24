const MENU = [
  {
    label: "Peta",
    d: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21ZM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  },
  { label: "Lapor", d: "M12 5v14M5 12h14" },
  { label: "Riwayat", d: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
  {
    label: "Profil",
    d: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0",
  },
];

export default function BottomNav({ aktif = "Peta" }: { aktif?: string }) {
  return (
    <nav className="absolute inset-x-0 bottom-0 z-[1001] flex h-[78px] justify-around border-t border-line bg-white pt-2">
      {MENU.map((m) =>
        m.label === "Lapor" ? (
          <button
            key={m.label}
            className="flex w-16 flex-col items-center gap-0.5 text-[10.5px] font-semibold text-ink"
          >
            <span className="grid h-[30px] w-[42px] place-items-center rounded-[10px] bg-brand">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="2.4"
                strokeLinecap="round"
              >
                <path d={m.d} />
              </svg>
            </span>
            {m.label}
          </button>
        ) : (
          <button
            key={m.label}
            className={`flex w-16 flex-col items-center gap-0.5 text-[10.5px] font-semibold ${
              aktif === m.label ? "text-brand" : "text-slate-400"
            }`}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={m.d} />
            </svg>
            {m.label}
          </button>
        ),
      )}
    </nav>
  );
}
