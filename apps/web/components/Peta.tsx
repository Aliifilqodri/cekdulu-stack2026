"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import type { Lokasi, Status } from "@/lib/contoh";

const WARNA: Record<Status, string> = {
  open: "#16A34A",
  queue: "#D97706",
  closed: "#DC2626",
  unknown: "#94A3B8",
};

const SINGKAT: Record<Status, string> = {
  open: "Buka",
  queue: "Antre",
  closed: "Tutup",
  unknown: "Belum ada info",
};

function ikonPin(l: Lokasi, i: number) {
  const nama = l.nama
    .replace("Kelurahan", "Kel.")
    .replace("Puskesmas Sukamaju", "Puskesmas");
  return L.divIcon({
    className: "pin-cekdulu",
    iconSize: [34, 42],
    iconAnchor: [17, 42],
    html: `
      <div class="pin-wrap" style="animation-delay:${i * 80}ms">
        <svg width="34" height="42" viewBox="0 0 36 44">
          <path d="M18 42s15-14 15-25C33 8.9 26.3 2 18 2S3 8.9 3 17c0 11 15 25 15 25Z" fill="${WARNA[l.status]}" stroke="#fff" stroke-width="3"/>
          <circle cx="18" cy="17" r="6" fill="#fff"/>
        </svg>
        <span class="pin-label">${nama}<small>${SINGKAT[l.status]}</small></span>
      </div>`,
  });
}

const ikonSaya = L.divIcon({
  className: "pin-cekdulu",
  iconSize: [56, 56],
  iconAnchor: [28, 28],
  html: `<div class="saya"><span></span></div>`,
});

type Props = {
  lokasi: Lokasi[];
  onPilih?: (l: Lokasi) => void;
};

export default function Peta({ lokasi, onPilih }: Props) {
  return (
    <MapContainer
      center={[-6.1728, 106.7895]}
      zoom={16}
      zoomControl={false}
      attributionControl={false}
      className="h-full w-full"
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker
        position={[-6.1712, 106.7898]}
        icon={ikonSaya}
        interactive={false}
      />
      {lokasi.map((l, i) => (
        <Marker
          key={l.id}
          position={[l.lat, l.lng]}
          icon={ikonPin(l, i)}
          eventHandlers={{ click: () => onPilih?.(l) }}
        />
      ))}
    </MapContainer>
  );
}
