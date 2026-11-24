"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import Header, { type Filter } from "./Header";
import BottomSheet from "./BottomSheet";
import BottomNav from "./BottomNav";
import { contohLokasi } from "@/lib/contoh";

const Peta = dynamic(() => import("./Peta"), { ssr: false });

export default function Beranda() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("Semua");
  const [expanded, setExpanded] = useState(false);

  const tampil = useMemo(
    () =>
      contohLokasi.filter(
        (l) =>
          (filter === "Semua" || l.kategori === filter) &&
          l.nama.toLowerCase().includes(query.toLowerCase()),
      ),
    [query, filter],
  );

  return (
    <main className="relative mx-auto h-dvh max-w-md overflow-hidden bg-surface">
      <Peta lokasi={tampil} onPilih={(l) => alert(l.nama)} />
      <Header
        query={query}
        onQuery={setQuery}
        filter={filter}
        onFilter={setFilter}
      />
      <BottomSheet
        items={tampil}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />
      <BottomNav aktif="Peta" />
    </main>
  );
}
