"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import { toUiStatus, type LocationItem, type UiStatus } from "@/lib/api";

const WARNA: Record<UiStatus, string> = {
  open: "#16A34A",
  queue: "#D97706",
  closed: "#DC2626",
  unknown: "#94A3B8",
};

const DEFAULT_CENTER: [number, number] = [-6.1924, 106.7695];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolvePinSublabel(l: LocationItem): string {
  const ttdMatch = l.headline.match(/(\d{2}\.\d{2})–/);
  if (ttdMatch) {
    return `TTD ${ttdMatch[1]}`;
  }
  if (l.summary?.queueEstimate) {
    return `${l.summary.queueEstimate} antre`;
  }
  return l.summary?.statusLabel || "Belum dicek";
}

function ikonPin(l: LocationItem, i: number) {
  const uiStatus = toUiStatus(l.summary?.currentStatus);
  const sublabel = resolvePinSublabel(l);
  const namaPendek = l.name
    .replace("Sekretariat ", "")
    .replace("Kelurahan ", "Kel. ")
    .replace("Puskesmas Kecamatan ", "PKM ")
    .replace("Gerai ", "");

  return L.divIcon({
    className: "pin-cekdulu",
    iconSize: [34, 42],
    iconAnchor: [17, 42],
    html: `
      <div class="pin-wrap" style="animation-delay:${i * 70}ms">
        <svg width="34" height="42" viewBox="0 0 36 44">
          <path d="M18 42s15-14 15-25C33 8.9 26.3 2 18 2S3 8.9 3 17c0 11 15 25 15 25Z" fill="${WARNA[uiStatus]}" stroke="#fff" stroke-width="3"/>
          <circle cx="18" cy="17" r="6" fill="#fff"/>
        </svg>
        <span class="pin-label">${escapeHtml(namaPendek)}<small>${escapeHtml(sublabel)}</small></span>
      </div>`,
  });
}

const ikonSaya = L.divIcon({
  className: "pin-cekdulu",
  iconSize: [56, 56],
  iconAnchor: [28, 28],
  html: `<div class="saya"><span></span></div>`,
});

function MapViewportController({
  lokasi,
  focusCoord,
}: {
  lokasi: LocationItem[];
  focusCoord: [number, number] | null;
}) {
  const map = useMap();
  const hasFittedInitial = useRef(false);

  useEffect(() => {
    if (!hasFittedInitial.current && lokasi.length > 0) {
      hasFittedInitial.current = true;
      if (lokasi.length === 1) {
        map.setView([lokasi[0].latitude, lokasi[0].longitude], 16);
      } else {
        const bounds = L.latLngBounds(
          lokasi.map((l) => [l.latitude, l.longitude] as [number, number]),
        );
        map.fitBounds(bounds, { padding: [60, 140], maxZoom: 16 });
      }
    }
  }, [lokasi, map]);

  useEffect(() => {
    if (focusCoord) {
      map.flyTo(focusCoord, 16, { duration: 0.45 });
    }
  }, [focusCoord, map]);

  return null;
}

type Props = {
  lokasi: LocationItem[];
  userPosition: [number, number] | null;
  focusCoord: [number, number] | null;
  onPilih?: (l: LocationItem) => void;
};

export default function Peta({
  lokasi,
  userPosition,
  focusCoord,
  onPilih,
}: Props) {
  return (
    <MapContainer
      center={userPosition ?? DEFAULT_CENTER}
      zoom={15}
      zoomControl={false}
      attributionControl={false}
      className="h-full w-full"
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <MapViewportController lokasi={lokasi} focusCoord={focusCoord} />
      {userPosition && (
        <Marker position={userPosition} icon={ikonSaya} interactive={false} />
      )}
      {lokasi.map((l, i) => (
        <Marker
          key={l.id}
          position={[l.latitude, l.longitude]}
          icon={ikonPin(l, i)}
          eventHandlers={{ click: () => onPilih?.(l) }}
        />
      ))}
    </MapContainer>
  );
}
