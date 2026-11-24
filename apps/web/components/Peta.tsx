"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer } from "react-leaflet";

export default function Peta() {
  return (
    <MapContainer
      center={[-6.17, 106.79]}
      zoom={15}
      zoomControl={false}
      className="h-full w-full"
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
    </MapContainer>
  );
}
