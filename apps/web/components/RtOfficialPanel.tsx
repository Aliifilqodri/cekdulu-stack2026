"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ApiRequestError,
  createAnswer,
  createRequirement,
  createSchedule,
  fetchLocationDetail,
  formatRelativeMinutes,
  getInitials,
  updateRequirement,
  updateSchedule,
  type AuthUserProfile,
  type LocationDetail,
} from "@/lib/api";

interface Props {
  token: string;
  user: AuthUserProfile;
  fallbackLocationId?: string | null;
  onBack: () => void;
}

export default function RtOfficialPanel({
  token,
  user,
  fallbackLocationId,
  onBack,
}: Props) {
  const assignment = user.rtOfficialAssignments?.[0];
  const targetLocationId = assignment?.locationId || fallbackLocationId || "";

  const [detail, setDetail] = useState<LocationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddSlot, setShowAddSlot] = useState(false);
  const [startTime, setStartTime] = useState("19:00");
  const [endTime, setEndTime] = useState("20:30");

  const [editingReqId, setEditingReqId] = useState<string | null>(null);
  const [reqServiceName, setReqServiceName] = useState(
    "Syarat surat pengantar",
  );
  const [reqItemsText, setReqItemsText] = useState("");
  const [showReqEditor, setShowReqEditor] = useState(false);

  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [saving, setSaving] = useState(false);

  const loadPanel = useCallback(async () => {
    if (!targetLocationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLocationDetail(targetLocationId);
      setDetail(data);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Gagal memuat data panel pengurus RT",
      );
    } finally {
      setLoading(false);
    }
  }, [targetLocationId]);

  useEffect(() => {
    void loadPanel();
  }, [loadPanel]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todaySchedules =
    detail?.schedules.filter((s) => s.scheduleDate === todayStr) ?? [];
  const isAvailableToday = todaySchedules.some((s) => s.isAvailable);
  const unansweredCount =
    detail?.questions.filter((q) => !q.isAnswered).length ?? 0;

  async function handleToggleAvailable() {
    if (!targetLocationId) return;
    setSaving(true);
    setError(null);
    try {
      if (todaySchedules.length > 0) {
        await Promise.all(
          todaySchedules.map((s) =>
            updateSchedule(token, s.id, { isAvailable: !isAvailableToday }),
          ),
        );
      } else {
        await createSchedule(token, {
          locationId: targetLocationId,
          startTime: `${startTime}:00`,
          endTime: `${endTime}:00`,
          isAvailable: true,
        });
      }
      await loadPanel();
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Gagal memperbarui ketersediaan jadwal",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleAddSlot(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!targetLocationId) return;
    setSaving(true);
    setError(null);
    try {
      await createSchedule(token, {
        locationId: targetLocationId,
        startTime: startTime.length === 5 ? `${startTime}:00` : startTime,
        endTime: endTime.length === 5 ? `${endTime}:00` : endTime,
        isAvailable: true,
      });
      setShowAddSlot(false);
      await loadPanel();
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Gagal menambah slot",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveRequirements(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!targetLocationId) return;
    const lines = reqItemsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    setSaving(true);
    setError(null);
    try {
      const checklistItems = lines.map((label) => ({ label, required: true }));
      if (editingReqId) {
        await updateRequirement(token, targetLocationId, editingReqId, {
          serviceName: reqServiceName,
          checklistItems,
        });
      } else {
        await createRequirement(token, targetLocationId, {
          serviceName: reqServiceName,
          checklistItems,
        });
      }
      setShowReqEditor(false);
      await loadPanel();
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Gagal memperbarui syarat surat",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSendReply(e: FormEvent<HTMLFormElement>, qId: string) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createAnswer(token, qId, replyText);
      setReplyText("");
      setReplyingId(null);
      await loadPanel();
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Gagal mengirim jawaban",
      );
    } finally {
      setSaving(false);
    }
  }

  const primaryReq = detail?.requirements[0];

  return (
    <section className="absolute inset-0 z-[1020] flex flex-col overflow-y-auto bg-surface pb-8">
      {/* Header Navy Gelap sesuai Figma 07 */}
      <header className="rounded-b-[28px] bg-ink px-5 pb-14 pt-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={onBack}
              className="mb-2 inline-flex items-center gap-1 text-xs font-bold text-teal-300"
            >
              ← Kembali ke Profil
            </button>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-teal-300">
              PANEL PENGURUS
            </p>
            <h1 className="mt-0.5 text-xl font-extrabold">
              {assignment?.rtRwCode || detail?.name || "Pengurus RT"}
            </h1>
            <p className="text-xs text-slate-300">
              {assignment?.locationName || detail?.address || "Wilayah binaan"}
            </p>
          </div>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-xs font-extrabold text-white">
            {getInitials(user.fullName, "RT")}
          </span>
        </div>
      </header>

      {/* Overlapping Stat Cards */}
      <div className="-mt-9 grid grid-cols-2 gap-3 px-4">
        <div className="rounded-[20px] bg-white p-4 shadow-chip">
          <p className="text-2xl font-extrabold text-ink">
            {detail?.activeReports.length ?? 0}
          </p>
          <p className="mt-0.5 text-xs text-muted">laporan aktif hari ini</p>
        </div>
        <div className="rounded-[20px] bg-white p-4 shadow-chip">
          <p className="text-2xl font-extrabold text-ink">{unansweredCount}</p>
          <p className="mt-0.5 text-xs text-muted">pertanyaan baru</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3.5 px-4">
        {error && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-2xl bg-closed-soft px-3.5 py-2.5 text-xs font-semibold text-closed-text"
          >
            {error}
          </div>
        )}

        {loading && !detail ? (
          <div className="h-44 animate-pulse rounded-[20px] bg-white" />
        ) : (
          <>
            {/* Card 1: Slot tanda tangan hari ini (Figma 07) */}
            <article className="rounded-[20px] bg-white p-4 shadow-chip">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-extrabold text-ink">
                  Slot tanda tangan hari ini
                </h2>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isAvailableToday}
                  disabled={saving}
                  onClick={() => void handleToggleAvailable()}
                  className={`relative h-7 w-12 rounded-full transition ${
                    isAvailableToday ? "bg-brand" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`block h-5 w-5 rounded-full bg-white shadow transition ${
                      isAvailableToday ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {todaySchedules.map((s) => (
                  <span
                    key={s.id}
                    className={`rounded-xl px-3 py-2 text-xs font-bold ${
                      s.isAvailable
                        ? "bg-brand text-white"
                        : "bg-surface text-muted line-through"
                    }`}
                  >
                    {s.startTime.slice(0, 5)}–{s.endTime.slice(0, 5)}
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => setShowAddSlot((v) => !v)}
                  className="rounded-xl border border-dashed border-line px-3 py-2 text-xs font-bold text-ink"
                >
                  + Tambah
                </button>
              </div>

              {showAddSlot && (
                <form
                  onSubmit={handleAddSlot}
                  className="mt-3 flex items-center gap-2 rounded-2xl bg-surface p-2.5"
                >
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                    className="min-h-[38px] rounded-xl border border-line bg-white px-2 text-xs font-bold"
                  />
                  <span className="text-xs font-bold text-muted">–</span>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                    className="min-h-[38px] rounded-xl border border-line bg-white px-2 text-xs font-bold"
                  />
                  <button
                    type="submit"
                    disabled={saving}
                    className="ml-auto rounded-xl bg-brand px-3 py-2 text-xs font-bold text-white"
                  >
                    Simpan
                  </button>
                </form>
              )}

              <div className="mt-3 flex items-start gap-2 rounded-2xl bg-surface p-3 text-[11.5px] text-muted">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="mt-0.5 shrink-0"
                  aria-hidden="true"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <p>
                  Warga cuma lihat jam layanan. Lokasi dan status Bapak di rumah
                  nggak pernah ditampilkan.
                </p>
              </div>
            </article>

            {/* Card 2: Syarat surat pengantar */}
            <article className="rounded-[20px] bg-white p-4 shadow-chip">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-extrabold text-ink">
                  {primaryReq?.serviceName || "Syarat surat pengantar"}
                </h2>
                <button
                  type="button"
                  aria-label="Ubah syarat surat"
                  onClick={() => {
                    setEditingReqId(primaryReq?.id || null);
                    setReqServiceName(
                      primaryReq?.serviceName || "Syarat surat pengantar",
                    );
                    setReqItemsText(
                      primaryReq
                        ? primaryReq.checklistItems
                            .map((i) => (typeof i === "string" ? i : i.label))
                            .join("\n")
                        : "Fotokopi KTP dan KK\nKeperluan surat",
                    );
                    setShowReqEditor((v) => !v);
                  }}
                  className="grid h-8 w-8 place-items-center rounded-full text-brand hover:bg-brand-soft"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    aria-hidden="true"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" />
                  </svg>
                </button>
              </div>

              {showReqEditor ? (
                <form
                  onSubmit={handleSaveRequirements}
                  className="mt-3 flex flex-col gap-2.5"
                >
                  <input
                    type="text"
                    value={reqServiceName}
                    onChange={(e) => setReqServiceName(e.target.value)}
                    required
                    className="min-h-[40px] rounded-xl border border-line px-3 text-xs font-bold outline-none focus:border-brand"
                  />
                  <textarea
                    rows={4}
                    value={reqItemsText}
                    onChange={(e) => setReqItemsText(e.target.value)}
                    placeholder="Satu syarat per baris"
                    required
                    className="rounded-xl border border-line px-3 py-2 text-xs outline-none focus:border-brand"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowReqEditor(false)}
                      className="flex-1 rounded-xl border border-line py-2 text-xs font-bold"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-1 rounded-xl bg-brand py-2 text-xs font-bold text-white"
                    >
                      Simpan Syarat
                    </button>
                  </div>
                </form>
              ) : primaryReq ? (
                <>
                  <ol className="mt-3 flex flex-col gap-2.5">
                    {primaryReq.checklistItems.map((item, idx) => (
                      <li key={idx} className="flex items-center gap-2.5 text-xs">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-brand-soft text-[11px] font-extrabold text-brand-dark">
                          {idx + 1}
                        </span>
                        <span className="font-medium text-ink">
                          {typeof item === "string" ? item : item.label}
                        </span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-3 text-[11px] text-muted">
                    Terakhir diubah {formatRelativeMinutes(primaryReq.updatedAt)}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-xs text-muted">
                  Belum ada daftar syarat dokumen. Klik ikon pensil untuk mengisi.
                </p>
              )}
            </article>

            {/* Card 3: Pertanyaan warga */}
            <article className="rounded-[20px] bg-white p-4 shadow-chip">
              <h2 className="mb-3 text-sm font-extrabold text-ink">
                Pertanyaan warga
              </h2>

              {!detail || detail.questions.length === 0 ? (
                <p className="text-xs text-muted">
                  Belum ada pertanyaan warga masuk.
                </p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {detail.questions.map((q) => (
                    <div key={q.id} className="rounded-2xl bg-surface p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-extrabold text-ink">
                            {q.questionText}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted">
                            {q.askedBy} · {formatRelativeMinutes(q.createdAt)}
                          </p>
                        </div>
                        {q.isAnswered ? (
                          <span className="shrink-0 text-xs font-extrabold text-open-text">
                            ✓
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setReplyingId(q.id);
                              setReplyText("");
                            }}
                            className="shrink-0 rounded-xl bg-brand px-3.5 py-2 text-xs font-bold text-white"
                          >
                            Jawab
                          </button>
                        )}
                      </div>

                      {q.isAnswered && (
                        <p className="mt-1 text-[11px] font-bold text-open-text">
                          Sudah dijawab
                        </p>
                      )}

                      {replyingId === q.id && (
                        <form
                          onSubmit={(e) => void handleSendReply(e, q.id)}
                          className="mt-2.5 flex gap-2"
                        >
                          <input
                            type="text"
                            required
                            minLength={2}
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Tulis jawaban resmi RT..."
                            className="min-h-[40px] min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-xs outline-none focus:border-brand"
                          />
                          <button
                            type="submit"
                            disabled={saving}
                            className="rounded-xl bg-brand px-3 text-xs font-bold text-white"
                          >
                            Kirim
                          </button>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </article>
          </>
        )}
      </div>
    </section>
  );
}
