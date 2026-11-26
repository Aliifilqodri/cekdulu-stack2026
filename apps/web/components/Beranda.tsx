"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import AuthModal from "./AuthModal";
import BottomNav, { type NavTab } from "./BottomNav";
import BottomSheet from "./BottomSheet";
import Header, { type Filter } from "./Header";
import HistorySheet from "./HistorySheet";
import LocationDetailView from "./LocationDetailView";
import ProfileSheet from "./ProfileSheet";
import ReportModal from "./ReportModal";
import RtOfficialPanel from "./RtOfficialPanel";
import {
  CATEGORY_TO_API,
  clearStoredToken,
  createRealtimeSocket,
  fetchLocations,
  fetchMe,
  fetchNotifications,
  fetchWatchlist,
  formatRelativeMinutes,
  getStoredToken,
  setStoredToken,
  type AuthUserProfile,
  type LocationItem,
  type LocationSummary,
  type WatchlistItem,
} from "@/lib/api";

const Peta = dynamic(() => import("./Peta"), { ssr: false });

export default function Beranda() {
  const [activeTab, setActiveTab] = useState<NavTab>("Peta");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("Semua");
  const [expanded, setExpanded] = useState(false);

  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [locationsError, setLocationsError] = useState<string | null>(null);
  const [userPosition, setUserPosition] = useState<[number, number] | null>(
    null,
  );
  const [focusCoord, setFocusCoord] = useState<[number, number] | null>(null);

  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    null,
  );
  const [rtPanelOpen, setRtPanelOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportDefaultLocationId, setReportDefaultLocationId] = useState<
    string | null
  >(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUserProfile | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const selectedLocationIdRef = useRef<string | null>(null);
  selectedLocationIdRef.current = selectedLocationId;

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, 250);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPosition([pos.coords.latitude, pos.coords.longitude]);
      },
      () => undefined,
      { enableHighAccuracy: false, timeout: 4000 },
    );
  }, []);

  const loadLocations = useCallback(async () => {
    setLoadingLocations(true);
    setLocationsError(null);
    try {
      const apiCategory =
        filter === "Semua" ? undefined : CATEGORY_TO_API[filter];
      const data = await fetchLocations({
        category: apiCategory,
        q: debouncedQuery || undefined,
        ...(userPosition
          ? { lat: userPosition[0], lng: userPosition[1] }
          : {}),
      });
      setLocations(data);
      setLastSyncAt(new Date().toISOString());
    } catch {
      setLocationsError(
        "Tidak dapat terhubung ke backend API. Pastikan server Express berjalan di port 4000.",
      );
    } finally {
      setLoadingLocations(false);
    }
  }, [filter, debouncedQuery, userPosition]);

  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

  const loadSessionData = useCallback(async (jwtToken: string) => {
    try {
      const [me, watchData, notifData] = await Promise.all([
        fetchMe(jwtToken),
        fetchWatchlist(jwtToken),
        fetchNotifications(jwtToken),
      ]);
      setUser(me);
      setWatchlist(watchData);
      setUnreadCount(notifData.unreadCount);
    } catch {
      clearStoredToken();
      setToken(null);
      setUser(null);
      setWatchlist([]);
      setUnreadCount(0);
    }
  }, []);

  useEffect(() => {
    const stored = getStoredToken();
    if (stored) {
      setToken(stored);
      void loadSessionData(stored);
    }
  }, [loadSessionData]);

  useEffect(() => {
    const socket = createRealtimeSocket();
    socketRef.current = socket;

    socket.on("connect", () => {
      setIsLiveConnected(true);
      if (token) {
        socket.emit("subscribe:user", token);
      }
      if (selectedLocationIdRef.current) {
        socket.emit("subscribe:location", selectedLocationIdRef.current);
      }
    });

    socket.on("disconnect", () => {
      setIsLiveConnected(false);
    });

    socket.on(
      "location:status_updated",
      (payload: { locationId: string; summary: LocationSummary }) => {
        setLastSyncAt(new Date().toISOString());
        setLocations((prev) =>
          prev.map((loc) =>
            loc.id === payload.locationId
              ? {
                  ...loc,
                  summary: payload.summary,
                  headline: `${payload.summary.statusLabel}${
                    payload.summary.queueEstimate
                      ? ` · Antre ${payload.summary.queueEstimate} orang`
                      : ""
                  }`,
                  metaText: `${payload.summary.confirmationCount} warga konfirmasi · baru saja`,
                }
              : loc,
          ),
        );
      },
    );

    socket.on("location:schedule_updated", () => {
      void loadLocations();
    });

    socket.on("notification:new", () => {
      setUnreadCount((c) => c + 1);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, loadLocations]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !selectedLocationId) return;
    socket.emit("subscribe:location", selectedLocationId);
    return () => {
      socket.emit("unsubscribe:location", selectedLocationId);
    };
  }, [selectedLocationId]);

  const watchedSet = useMemo(
    () => new Set(watchlist.map((w) => w.locationId)),
    [watchlist],
  );

  const liveText = useMemo(() => {
    if (locationsError) return "Offline · API tidak terjangkau";
    if (!isLiveConnected) return "Menghubungkan live feed...";
    return `Live · update ${formatRelativeMinutes(lastSyncAt)}`;
  }, [locationsError, isLiveConnected, lastSyncAt]);

  function handleSelectNav(tab: NavTab) {
    setSelectedLocationId(null);
    setRtPanelOpen(false);
    if (tab === "Lapor") {
      setReportDefaultLocationId(selectedLocationId);
      setReportModalOpen(true);
      return;
    }
    setActiveTab(tab);
  }

  function handleSelectLocation(loc: LocationItem) {
    setFocusCoord([loc.latitude, loc.longitude]);
    setSelectedLocationId(loc.id);
  }

  return (
    <main className="relative mx-auto h-dvh max-w-md overflow-hidden bg-surface">
      {activeTab === "Peta" && (
        <>
          <Peta
            lokasi={locations}
            userPosition={userPosition}
            focusCoord={focusCoord}
            onPilih={handleSelectLocation}
          />
          <Header
            query={query}
            onQuery={setQuery}
            filter={filter}
            onFilter={setFilter}
            isLiveConnected={isLiveConnected && !locationsError}
            liveText={liveText}
          />
          <BottomSheet
            items={locations}
            loading={loadingLocations}
            error={locationsError}
            expanded={expanded}
            onToggle={() => setExpanded((v) => !v)}
            onSelect={handleSelectLocation}
            onRetry={() => void loadLocations()}
          />
        </>
      )}

      {activeTab === "Riwayat" && (
        <HistorySheet
          token={token}
          onSelectLocation={(id) => {
            setSelectedLocationId(id);
          }}
          onNotificationsChanged={setUnreadCount}
        />
      )}

      {activeTab === "Profil" && (
        <ProfileSheet
          token={token}
          user={user}
          watchlist={watchlist}
          onOpenAuth={() => setAuthModalOpen(true)}
          onOpenRtPanel={() => setRtPanelOpen(true)}
          onLogout={() => {
            clearStoredToken();
            setToken(null);
            setUser(null);
            setWatchlist([]);
            setUnreadCount(0);
            setRtPanelOpen(false);
          }}
          onUserUpdated={(updated) => setUser(updated)}
          onSelectLocation={(id) => {
            setSelectedLocationId(id);
          }}
        />
      )}

      <BottomNav
        aktif={activeTab}
        unreadCount={unreadCount}
        onSelect={handleSelectNav}
      />

      {selectedLocationId && (
        <LocationDetailView
          locationId={selectedLocationId}
          liveSummary={
            locations.find((l) => l.id === selectedLocationId)?.summary ?? null
          }
          token={token}
          isWatched={watchedSet.has(selectedLocationId)}
          onBack={() => setSelectedLocationId(null)}
          onRequireAuth={() => setAuthModalOpen(true)}
          onOpenReport={(locId) => {
            setReportDefaultLocationId(locId);
            setReportModalOpen(true);
          }}
          onWatchChanged={() => {
            if (token) {
              void fetchWatchlist(token).then(setWatchlist);
            }
          }}
        />
      )}

      {rtPanelOpen && token && user && (
        <RtOfficialPanel
          token={token}
          user={user}
          fallbackLocationId={
            locations.find((l) => l.category === "kantor_rt")?.id ??
            locations[0]?.id ??
            null
          }
          onBack={() => setRtPanelOpen(false)}
        />
      )}

      <ReportModal
        open={reportModalOpen}
        locations={locations}
        defaultLocationId={reportDefaultLocationId}
        token={token}
        onClose={() => setReportModalOpen(false)}
        onRequireAuth={() => setAuthModalOpen(true)}
        onSubmitted={() => {
          void loadLocations();
          if (token) void loadSessionData(token);
        }}
      />

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={(jwtToken, authedUser) => {
          setStoredToken(jwtToken);
          setToken(jwtToken);
          setUser(authedUser);
          void loadSessionData(jwtToken);
        }}
      />
    </main>
  );
}
