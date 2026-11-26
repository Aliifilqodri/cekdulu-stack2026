"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import StatusChip from "./StatusChip";
import {
  ApiRequestError,
  createAnswer,
  createQuestion,
  fetchLocationDetail,
  formatExpiresCountdown,
  formatRelativeMinutes,
  toUiStatus,
  unwatchLocation,
  watchLocation,
  type LocationDetail,
  type LocationSummary,
} from "@/lib/api";

interface Props {
  locationId: string;
  liveSummary?: LocationSummary | null;
  token: string | null;
  isWatched: boolean;
  onBack: () => void;
  onRequireAuth: () => void;
  onOpenReport: (locationId: string) => void;
  onWatchChanged: () => void;
}

export default function LocationDetailView({
  locationId,
  liveSummary,
  token,
  isWatched,
  onBack,
  onRequireAuth,
  onOpenReport,
  onWatchChanged,
}: Props) {
  const [detail, setDetail] = useState<LocationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAskBox, setShowAskBox] = useState(false);
  const [questionText, setQuestionText] = useState("");
  const [asking, setAsking] = useState(false);
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [watchPending, setWatchPending] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const askInputRef = useRef<HTMLInputElement>(null);

  const loadDetail = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLocationDetail(id);
      setDetail(data);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Gagal memuat detail lokasi",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDetail(locationId);
  }, [locationId, loadDetail]);

  useEffect(() => {
    if (!liveSummary || liveSummary.locationId !== locationId) return;
    setDetail((prev) => (prev ? { ...prev, summary: liveSummary } : prev));
  }, [locationId, liveSummary]);

  async function handleToggleWatch() {
    if (!token) {
      onRequireAuth();
      return;
    }
    setWatchPending(true);
    try {
      if (isWatched) {
        await unwatchLocation(token, locationId);
      } else {
        await watchLocation(token, locationId);
      }
      onWatchChanged();
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Gagal memperbarui pantauan",
      );
    } finally {
      setWatchPending(false);
    }
  }

  async function handleShare() {
    if (!detail) return;
    const shareText = `${detail.name} — ${detail.summary?.statusLabel ?? "CekDulu"}: ${detail.headline}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator
        .share({ title: detail.name, text: shareText })
        .catch(() => undefined);
      return;
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(shareText).catch(() => undefined);
      setCopiedToast(true);
      window.setTimeout(() => setCopiedToast(false), 2000);
    }
  }

  async function handleAskQuestion(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) {
      onRequireAuth();
      return;
    }
    setAsking(true);
    setError(null);
    try {
      await createQuestion(token, { locationId, questionText });
      setQuestionText("");
      setShowAskBox(false);
      await loadDetail(locationId);
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Gagal mengirim pertanyaan",
      );
    } finally {
      setAsking(false);
    }
  }

  async function handleSendAnswer(
    e: FormEvent<HTMLFormElement>,
    qId: string,
  ) {
    e.preventDefault();
    if (!token) {
      onRequireAuth();
      return;
    }
    setAsking(true);
    setError(null);
    try {
      await createAnswer(token, qId, replyText);
      setReplyText("");
      setReplyTargetId(null);
      await loadDetail(locationId);
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Gagal mengirim jawaban",
      );
    } finally {
      setAsking(false);
    }
  }

  const summary = detail?.summary ?? null;
  const uiStatus = toUiStatus(summary?.currentStatus);
  const countdownText = formatExpiresCountdown(summary?.expiresAt);
  const todaySchedule = detail?.schedules.find((s) => s.isAvailable);

  return (
    <section className="absolute inset-0 z-[1020] flex flex-col bg-surface">
      {/* Top Bar sesuai Figma 02 */}
      <header className="flex items-center justify-between px-4 pb-3 pt-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Kembali ke peta"
          className="grid h-10 w-10 place-items-center rounded-full bg-white text-ink shadow-chip"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        <h1 className="text-[15px] font-extrabold text-ink">Detail lokasi</h1>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={watchPending}
            onClick={handleToggleWatch}
            aria-label={isWatched ? "Berhenti pantau lokasi" : "Pantau lokasi"}
            className={`grid h-10 w-10 place-items-center rounded-full shadow-chip transition ${
              isWatched ? "bg-brand text-white" : "bg-white text-ink"
            }`}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill={isWatched ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => void handleShare()}
            aria-label="Bagikan info lokasi"
            className="grid h-10 w-10 place-items-center rounded-full bg-white text-ink shadow-chip"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </button>
        </div>
      </header>

      {copiedToast && (
        <div
          role="status"
          aria-live="polite"
          className="mx-4 mb-2 rounded-xl bg-ink px-3 py-2 text-center text-xs font-semibold text-white"
        >
          Info status lokasi disalin ke clipboard
        </div>
      )}

      {/* Scrollable Body */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-24">
        {loading && !detail && (
          <div className="flex flex-col gap-3">
            <div className="h-32 animate-pulse rounded-[20px] bg-white" />
            <div className="h-44 animate-pulse rounded-[20px] bg-white" />
            <div className="h-36 animate-pulse rounded-[20px] bg-white" />
          </div>
        )}

        {error && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-2xl bg-closed-soft px-4 py-3 text-xs font-semibold text-closed-text"
          >
            {error}
          </div>
        )}

        {detail && (
          <>
            {/* Card 1: Identitas Lokasi */}
            <article className="rounded-[20px] bg-white p-4 shadow-chip">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-brand">
                  KANTOR {detail.categoryLabel.toUpperCase()}
                </span>
                <StatusChip
                  status={uiStatus}
                  label={summary?.statusLabel}
                />
              </div>

              <h2 className="mt-1.5 text-xl font-extrabold leading-tight text-ink">
                {detail.name}
              </h2>
              {detail.address && (
                <p className="mt-0.5 text-xs text-muted">{detail.address}</p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-medium text-muted">
                {detail.openTime && detail.closeTime && (
                  <span className="inline-flex items-center gap-1">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    {detail.openTime.slice(0, 5)}–{detail.closeTime.slice(0, 5)}
                  </span>
                )}
                {detail.operationalDays && (
                  <span className="inline-flex items-center gap-1">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    {detail.operationalDays}
                  </span>
                )}
              </div>
            </article>

            {/* Card 2: Kondisi Sekarang */}
            <article className="rounded-[20px] bg-white p-4 shadow-chip">
              <div className="flex items-center justify-between gap-2 pb-2">
                <h3 className="text-[15px] font-extrabold text-ink">
                  Kondisi sekarang
                </h3>
                {countdownText && (
                  <span className="rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted">
                    {countdownText}
                  </span>
                )}
              </div>

              <div className="divide-y divide-line text-xs">
                {detail.category !== "kantor_rt" && (
                  <div className="flex items-center justify-between py-2.5">
                    <span className="text-muted">Blanko / Dokumen</span>
                    <span
                      className={`font-bold ${
                        summary?.blankoStatus === "habis"
                          ? "text-closed-text"
                          : summary?.blankoStatus === "ada"
                            ? "text-open-text"
                            : "text-ink"
                      }`}
                    >
                      {summary?.blankoStatus === "ada"
                        ? "Ada"
                        : summary?.blankoStatus === "habis"
                          ? "Habis"
                          : "Belum ada info"}
                    </span>
                  </div>
                )}

                {todaySchedule && (
                  <div className="flex items-center justify-between py-2.5">
                    <span className="text-muted">Slot TTD Pengurus RT</span>
                    <span className="font-bold text-open-text">
                      {todaySchedule.startTime.slice(0, 5)}–
                      {todaySchedule.endTime.slice(0, 5)}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between py-2.5">
                  <span className="text-muted">Antrean</span>
                  <span className="font-bold text-queue-text">
                    {summary?.queueEstimate
                      ? `${summary.queueEstimate} orang`
                      : "-"}
                  </span>
                </div>

                <div className="flex items-center justify-between py-2.5">
                  <span className="text-muted">Petugas Loket</span>
                  <span
                    className={`font-bold ${
                      summary?.officerStatus === "tidak_ada"
                        ? "text-closed-text"
                        : summary?.officerStatus === "di_loket"
                          ? "text-open-text"
                          : "text-ink"
                    }`}
                  >
                    {summary?.officerStatus === "di_loket"
                      ? "Di loket"
                      : summary?.officerStatus === "tidak_ada"
                        ? "Tidak ada"
                        : "-"}
                  </span>
                </div>

                {summary?.networkStatus && (
                  <div className="flex items-center justify-between py-2.5">
                    <span className="text-muted">Sistem / Jaringan</span>
                    <span
                      className={`font-bold ${
                        summary.networkStatus === "offline"
                          ? "text-closed-text"
                          : "text-open-text"
                      }`}
                    >
                      {summary.networkStatus === "offline"
                        ? "Offline"
                        : "Normal"}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center gap-2 rounded-xl bg-brand-soft/60 px-3 py-2.5 text-xs font-medium text-brand-dark">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>
                  {summary && summary.confirmationCount > 0
                    ? `Cocok dari ${summary.confirmationCount} laporan warga, terakhir ${formatRelativeMinutes(summary.lastUpdatedAt)}`
                    : "Belum ada laporan terkonfirmasi. Jadilah yang pertama melapor."}
                </span>
              </div>
            </article>

            {/* Card 3: Syarat Layanan (Figma 02) */}
            {detail.requirements.length > 0 && (
              <article className="rounded-[20px] bg-white p-4 shadow-chip">
                {detail.requirements.map((req, rIdx) => (
                  <div
                    key={req.id}
                    className={rIdx > 0 ? "mt-4 border-t border-line pt-4" : ""}
                  >
                    <h3 className="text-[15px] font-extrabold text-ink">
                      {req.serviceName}
                    </h3>
                    <ul className="mt-3 flex flex-col gap-2.5">
                      {req.checklistItems.map((item, idx) => {
                        const label =
                          typeof item === "string" ? item : item.label;
                        return (
                          <li
                            key={idx}
                            className="flex items-start gap-2.5 text-xs font-medium text-ink"
                          >
                            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-open text-white">
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </span>
                            <span>{label}</span>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="mt-3 text-[11px] text-muted">
                      Terakhir diperbarui {formatRelativeMinutes(req.updatedAt)}
                      {req.updatedByName ? ` oleh ${req.updatedByName}` : ""}
                    </p>
                  </div>
                ))}
              </article>
            )}

            {/* Card 4: Tanya Warga (Figma 02) */}
            <article className="rounded-[20px] bg-white p-4 shadow-chip">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[15px] font-extrabold text-ink">
                  Tanya warga
                </h3>
                <span className="text-xs font-bold text-brand">
                  {detail.questions.length} pertanyaan
                </span>
              </div>

              {showAskBox && (
                <form onSubmit={handleAskQuestion} className="mb-3 flex gap-2">
                  <label htmlFor="detail-ask-input" className="sr-only">
                    Tulis pertanyaan untuk warga atau pengurus
                  </label>
                  <input
                    ref={askInputRef}
                    id="detail-ask-input"
                    name="questionText"
                    type="text"
                    required
                    minLength={5}
                    maxLength={1000}
                    value={questionText}
                    onChange={(e) => setQuestionText(e.target.value)}
                    placeholder="Mis. Sabtu buka nggak buat urus KK?"
                    className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-line px-3 text-base outline-none focus:border-brand"
                  />
                  <button
                    type="submit"
                    disabled={asking}
                    className="min-h-[44px] shrink-0 rounded-xl bg-brand px-4 text-xs font-bold text-white disabled:opacity-60"
                  >
                    Kirim
                  </button>
                </form>
              )}

              {detail.questions.length === 0 ? (
                <p className="rounded-2xl bg-surface p-3 text-xs text-muted">
                  Belum ada pertanyaan. Klik tombol Tanya di bawah bila ingin
                  bertanya ke warga atau pengurus.
                </p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {detail.questions.map((q) => (
                    <div key={q.id} className="rounded-2xl bg-surface p-3">
                      <p className="text-xs font-extrabold text-ink">
                        {q.questionText}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {q.askedBy} · {formatRelativeMinutes(q.createdAt)}
                      </p>

                      {q.answers.map((a) => (
                        <div
                          key={a.id}
                          className="mt-2 border-t border-line/70 pt-2 text-xs text-slate-700"
                        >
                          <p>{a.answerText}</p>
                          <p className="mt-1 text-[11px] font-semibold text-brand-dark">
                            {a.answeredBy}
                            {a.isOfficialRt ? " · Pengurus RT" : ""}
                          </p>
                        </div>
                      ))}

                      {token && (
                        <div className="mt-2">
                          {replyTargetId === q.id ? (
                            <form
                              onSubmit={(e) => handleSendAnswer(e, q.id)}
                              className="flex gap-1.5"
                            >
                              <input
                                type="text"
                                required
                                minLength={2}
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                placeholder="Tulis jawaban..."
                                className="min-h-[40px] min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-sm outline-none"
                              />
                              <button
                                type="submit"
                                disabled={asking}
                                className="rounded-xl bg-brand px-3 text-xs font-bold text-white"
                              >
                                Kirim
                              </button>
                            </form>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setReplyTargetId(q.id);
                                setReplyText("");
                              }}
                              className="text-[11px] font-bold text-brand"
                            >
                              Bantu jawab
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </article>
          </>
        )}
      </div>

      {/* Bottom Sticky CTA sesuai Figma 02 */}
      <footer className="absolute inset-x-0 bottom-0 flex gap-2.5 border-t border-line bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => {
            if (!token) {
              onRequireAuth();
              return;
            }
            setShowAskBox(true);
            window.setTimeout(() => askInputRef.current?.focus(), 60);
          }}
          className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-2xl border border-line bg-white px-4 text-sm font-bold text-ink"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Tanya
        </button>

        <button
          type="button"
          onClick={() => onOpenReport(locationId)}
          className="min-h-[48px] flex-1 rounded-2xl bg-brand px-4 text-sm font-bold text-white transition hover:bg-brand-dark"
        >
          Lapor kondisi sekarang
        </button>
      </footer>
    </section>
  );
}
