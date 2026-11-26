"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  ApiRequestError,
  maskPhoneNumber,
  requestOtp,
  verifyOtp,
  type AuthUserProfile,
} from "@/lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  onAuthenticated: (token: string, user: AuthUserProfile) => void;
}

export default function AuthModal({ open, onClose, onAuthenticated }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const id = window.setInterval(() => {
      setResendSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [resendSeconds]);

  async function sendOtpRequest(rawPhone: string) {
    setError(null);
    setLoading(true);
    try {
      const res = await requestOtp(rawPhone);
      setPhoneNumber(res.phoneNumber);
      setDevOtpHint(res.devOtp ?? null);
      setResendSeconds(60);
      setStep("otp");
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Gagal mengirim kode OTP. Pastikan backend berjalan.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestOtp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await sendOtpRequest(phoneNumber);
  }

  async function handleVerifyOtp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await verifyOtp(phoneNumber, otpCode, fullName);
      onAuthenticated(res.token, res.user);
      setStep("phone");
      setOtpCode("");
      setDevOtpHint(null);
      dialogRef.current?.close();
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Kode OTP tidak valid",
      );
    } finally {
      setLoading(false);
    }
  }

  const formattedCountdown = `00:${String(resendSeconds).padStart(2, "0")}`;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={() => {
        if (dialogRef.current) {
          dialogRef.current.returnValue = "";
        }
        setError(null);
        onClose();
      }}
      {...({ closedby: "any" } as Record<string, string>)}
      className="m-auto h-dvh max-h-[96dvh] w-full max-w-md rounded-3xl bg-surface p-0 text-ink shadow-float open:flex open:flex-col"
    >
      {/* Top Bar Figma 04 */}
      <header className="flex items-center justify-between px-4 pb-2 pt-4">
        <button
          type="button"
          onClick={() => {
            if (step === "otp") {
              setStep("phone");
              setError(null);
            } else {
              dialogRef.current?.close();
            }
          }}
          aria-label="Kembali"
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

        <h1 id={titleId} className="text-[15px] font-extrabold text-ink">
          Verifikasi nomor
        </h1>

        <span className="w-10" aria-hidden="true" />
      </header>

      <div className="flex flex-1 flex-col items-center overflow-y-auto px-5 pb-8 pt-6">
        {/* Shield icon badge sesuai Figma 04 */}
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-brand">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </div>

        {error && (
          <div
            role="status"
            aria-live="polite"
            className="mt-4 w-full rounded-2xl bg-closed-soft px-3.5 py-2.5 text-center text-xs font-semibold text-closed-text"
          >
            {error}
          </div>
        )}

        {step === "phone" ? (
          <form
            onSubmit={handleRequestOtp}
            className="mt-5 flex w-full flex-col gap-4"
          >
            <div className="text-center">
              <h2 className="text-lg font-extrabold text-ink">
                Masukin nomor WhatsApp
              </h2>
              <p className="mt-1 text-xs text-muted">
                Kode 6 digit bakal dikirim lewat chat CekDulu Bot.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="wa-phone" className="text-xs font-bold text-ink">
                Nomor WhatsApp <span aria-hidden="true">*</span>
              </label>
              <input
                id="wa-phone"
                name="phoneNumber"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                minLength={9}
                maxLength={20}
                value={phoneNumber}
                onChange={(e) => {
                  setPhoneNumber(e.target.value);
                  setError(null);
                }}
                placeholder="0812xxxxxxxx"
                className="min-h-[48px] rounded-2xl border border-line bg-white px-4 text-base outline-none focus:border-brand"
              />
            </div>

            <div className="flex items-start gap-2.5 rounded-2xl bg-white p-3.5 text-xs text-muted shadow-chip">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <p>
                Satu nomor cuma bisa punya satu akun, jadi laporan palsu nggak
                bisa dikirim berkali-kali.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="min-h-[48px] rounded-2xl bg-brand px-4 text-sm font-bold text-white transition hover:bg-brand-dark disabled:opacity-60"
            >
              {loading ? "Mengirim kode..." : "Kirim kode ke WhatsApp"}
            </button>
          </form>
        ) : (
          <form
            onSubmit={handleVerifyOtp}
            className="mt-5 flex w-full flex-col items-center gap-4"
          >
            <div className="text-center">
              <h2 className="text-lg font-extrabold text-ink">
                Masukin kode dari WhatsApp
              </h2>
              <p id="otp-help" className="mt-1 text-xs leading-relaxed text-muted">
                Kode 6 digit udah dikirim ke{" "}
                <strong className="text-ink">
                  {maskPhoneNumber(phoneNumber)}
                </strong>{" "}
                lewat chat CekDulu Bot
              </p>
            </div>

            {devOtpHint && (
              <div className="w-full rounded-2xl bg-brand-soft px-3.5 py-2 text-center text-xs font-semibold text-brand-dark">
                Mode Dev — Kode OTP:{" "}
                <strong className="font-mono">{devOtpHint}</strong>
              </div>
            )}

            {/* Satu <input> aksesibel yang divisualisasikan 6 kotak sesuai Figma 04 */}
            <div className="w-full">
              <label htmlFor="otp-code" className="sr-only">
                Kode OTP 6 digit
              </label>
              <div className="relative mx-auto w-full max-w-[310px]">
                <div
                  aria-hidden="true"
                  className="grid grid-cols-6 gap-2"
                >
                  {[0, 1, 2, 3, 4, 5].map((idx) => {
                    const char = otpCode[idx] || "";
                    const isActive =
                      otpCode.length === idx ||
                      (otpCode.length === 6 && idx === 5);
                    return (
                      <div
                        key={idx}
                        className={`grid h-14 place-items-center rounded-2xl border bg-white font-mono text-xl font-extrabold shadow-chip ${
                          isActive
                            ? "border-2 border-brand text-ink"
                            : "border-line text-ink"
                        }`}
                      >
                        {char}
                      </div>
                    );
                  })}
                </div>

                <input
                  id="otp-code"
                  name="otpCode"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  aria-describedby="otp-help"
                  value={otpCode}
                  onChange={(e) => {
                    setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                    setError(null);
                  }}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </div>
            </div>

            <div className="text-xs text-muted">
              {resendSeconds > 0 ? (
                <span>
                  Kirim ulang dalam{" "}
                  <strong className="text-ink">{formattedCountdown}</strong>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void sendOtpRequest(phoneNumber)}
                  className="font-bold text-brand"
                >
                  Kirim ulang kode
                </button>
              )}
            </div>

            <div className="flex w-full flex-col gap-1">
              <label htmlFor="full-name" className="text-xs font-bold text-ink">
                Nama panggilan <span className="font-normal text-muted">(opsional)</span>
              </label>
              <input
                id="full-name"
                name="fullName"
                type="text"
                autoComplete="name"
                maxLength={100}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Mis. Rina Ayu"
                className="min-h-[44px] rounded-2xl border border-line bg-white px-3.5 text-base outline-none focus:border-brand"
              />
            </div>

            <div className="flex w-full items-start gap-2.5 rounded-2xl bg-white p-3.5 text-xs text-muted shadow-chip">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <p>
                Satu nomor cuma bisa punya satu akun, jadi laporan palsu nggak
                bisa dikirim berkali-kali.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="min-h-[48px] w-full rounded-2xl bg-brand px-4 text-sm font-bold text-white transition hover:bg-brand-dark disabled:opacity-60"
            >
              {loading ? "Memverifikasi..." : "Verifikasi & Masuk"}
            </button>
          </form>
        )}
      </div>
    </dialog>
  );
}
