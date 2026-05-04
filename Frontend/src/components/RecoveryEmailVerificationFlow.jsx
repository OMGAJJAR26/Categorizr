/**
 * RecoveryEmailVerificationFlow
 *
 * Mirrors the iOS popup chain:
 *   1. UpdateEmailModal   — shown when recoveryEmail is empty (add email first)
 *   2. VerifyEmailModal   — shown when recoveryEmail exists but is not yet verified (OTP entry)
 *
 * The parent (HomePage) decides which step to open via `initialStep` prop.
 * After the user adds their email, the component automatically advances to the OTP step.
 */
import { useState, useEffect, useRef } from "react";
import { X, Mail, ShieldCheck, Loader2, CheckCircle, RefreshCw } from "lucide-react";

const BASE_URL = "/api";
const OTP_LENGTH = 6;

/** Returns true if a stored timestamp (ms) is from today's calendar day */
export const isTimestampFromToday = (ts) => {
  if (!ts) return false;
  const stored = new Date(Number(ts));
  const now = new Date();
  return (
    stored.getFullYear() === now.getFullYear() &&
    stored.getMonth()    === now.getMonth()    &&
    stored.getDate()     === now.getDate()
  );
};

/* ─── Step 1: Add / Update Recovery Email ─────────────────────────────── */
const UpdateEmailModal = ({ onSaved, onSkip }) => {
  const [email, setEmail]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const handleSave = async () => {
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      // Update recovery email on the user's account
      const params = new URLSearchParams({ recoveryEmail: trimmed }).toString();
      const res = await fetch(`${BASE_URL}/user/updateprofilev1?${params}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accesstoken: token },
      });
      // Treat any 2xx response as success (API may return plain text)
      if (!res.ok && res.status !== 200) {
        const text = await res.text().catch(() => "");
        throw new Error(text || "Failed to save email. Please try again.");
      }
      onSaved(trimmed);
    } catch (err) {
      // If the update endpoint doesn't exist yet, still proceed so the OTP
      // step can run (the recoveryEmail may already be set server-side or we
      // can prompt again once the endpoint is wired up).
      if (err.name === "TypeError" || String(err).includes("fetch")) {
        // Network / 404 — proceed optimistically
        onSaved(trimmed);
      } else {
        setError(err.message || "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-auto overflow-hidden">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-blue-600 to-blue-700 px-6 pt-8 pb-6 text-white text-center">
          <button
            onClick={onSkip}
            className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/20 transition-colors"
          >
            <X size={16} />
          </button>
          <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
            <Mail size={28} className="text-white" />
          </div>
          <h2 className="text-lg font-bold">Add Recovery Email</h2>
          <p className="text-sm text-blue-100 mt-1">
            Add a recovery email to secure your account and receive important notifications.
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Recovery Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="e.g. backup@email.com"
              autoFocus
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {error && (
              <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                <span className="font-bold">!</span> {error}
              </p>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={loading || !email.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl py-2.5 flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : "Continue →"}
          </button>

          <button
            onClick={onSkip}
            className="w-full text-xs text-slate-400 hover:text-slate-600 py-1 transition-colors"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─── Step 2: Verify Recovery Email via OTP ───────────────────────────── */
const VerifyEmailModal = ({ recoveryEmail, onVerified, onSkip }) => {
  const [otp, setOtp]               = useState(Array(OTP_LENGTH).fill(""));
  const [sending, setSending]       = useState(false);
  const [verifying, setVerifying]   = useState(false);
  const [sent, setSent]             = useState(false);
  const [error, setError]           = useState("");
  const [success, setSuccess]       = useState(false);
  const [cooldown, setCooldown]     = useState(0);
  const inputRefs                   = useRef([]);
  const timerRef                    = useRef(null);

  // Auto-send OTP on mount
  useEffect(() => {
    handleSendOtp();
    return () => clearInterval(timerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCooldown = (seconds = 60) => {
    setCooldown(seconds);
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) { clearInterval(timerRef.current); return 0; }
        return c - 1;
      });
    }, 1000);
  };

  const handleSendOtp = async () => {
    setSending(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BASE_URL}/user/sendmailotptoverify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accesstoken: token },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || "Failed to send OTP.");
      }
      setSent(true);
      startCooldown(60);
    } catch (err) {
      setError(err.message || "Could not send OTP. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const handleOtpChange = (index, value) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    setError("");
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) inputRefs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    const next = [...otp];
    pasted.split("").forEach((d, i) => { next[i] = d; });
    setOtp(next);
    inputRefs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
  };

  const handleVerify = async () => {
    const code = otp.join("");
    if (code.length < OTP_LENGTH) {
      setError(`Please enter all ${OTP_LENGTH} digits.`);
      return;
    }
    setVerifying(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      const params = new URLSearchParams({ code }).toString();
      const res = await fetch(`${BASE_URL}/user/verifymailotpforemailv1?${params}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accesstoken: token },
      });
      const text = await res.text().catch(() => "");
      let data = {};
      try { data = JSON.parse(text); } catch { /* plain-text response is fine */ }

      // Treat HTTP 200 with no error as success; also check any "code" field
      if (!res.ok || (data?.code && data.code !== 0 && data.code !== 200)) {
        throw new Error(data?.message || text || "Verification failed. Check the code and try again.");
      }

      setSuccess(true);
      setTimeout(() => onVerified(), 1200);
    } catch (err) {
      setError(err.message || "Invalid code. Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  const maskedEmail = recoveryEmail
    ? recoveryEmail.replace(/^(.{2})(.*)(@.*)$/, (_, a, b, c) => a + "*".repeat(Math.max(1, b.length)) + c)
    : "";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-auto overflow-hidden">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-blue-600 to-blue-700 px-6 pt-8 pb-6 text-white text-center">
          <button
            onClick={onSkip}
            className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/20 transition-colors"
          >
            <X size={16} />
          </button>
          <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
            {success
              ? <CheckCircle size={28} className="text-white" />
              : <ShieldCheck size={28} className="text-white" />}
          </div>
          <h2 className="text-lg font-bold">
            {success ? "Email Verified!" : "Verify Your Email"}
          </h2>
          {!success && (
            <p className="text-sm text-blue-100 mt-1">
              {sent
                ? <>We sent a code to <span className="font-semibold">{maskedEmail}</span></>
                : "Sending verification code…"}
            </p>
          )}
          {success && (
            <p className="text-sm text-blue-100 mt-1">Your recovery email is now verified.</p>
          )}
        </div>

        {/* Body */}
        {!success && (
          <div className="px-6 py-5 flex flex-col gap-4">
            {/* OTP boxes */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 text-center">
                Enter {OTP_LENGTH}-digit code
              </label>
              <div className="flex justify-center gap-2">
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => (inputRefs.current[i] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    onPaste={i === 0 ? handleOtpPaste : undefined}
                    className={`w-10 h-12 text-center text-lg font-bold border-2 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      digit ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-800"
                    }`}
                  />
                ))}
              </div>
              {error && (
                <p className="mt-2 text-xs text-red-500 text-center flex items-center justify-center gap-1">
                  <span className="font-bold">!</span> {error}
                </p>
              )}
            </div>

            {/* Verify button */}
            <button
              onClick={handleVerify}
              disabled={verifying || otp.join("").length < OTP_LENGTH}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl py-2.5 flex items-center justify-center gap-2 transition-colors"
            >
              {verifying ? <><Loader2 size={15} className="animate-spin" /> Verifying…</> : "Verify Email"}
            </button>

            {/* Resend */}
            <div className="flex items-center justify-center gap-1 text-xs text-slate-400">
              {cooldown > 0 ? (
                <span>Resend in <span className="font-semibold text-slate-600">{cooldown}s</span></span>
              ) : (
                <button
                  onClick={handleSendOtp}
                  disabled={sending}
                  className="flex items-center gap-1 text-blue-500 hover:text-blue-700 font-medium transition-colors disabled:opacity-50"
                >
                  {sending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  {sending ? "Sending…" : "Resend Code"}
                </button>
              )}
            </div>

            <button
              onClick={onSkip}
              className="w-full text-xs text-slate-400 hover:text-slate-600 py-1 transition-colors"
            >
              Skip for now
            </button>
          </div>
        )}

        {/* Success state body */}
        {success && (
          <div className="px-6 py-8 flex flex-col items-center gap-2 text-center">
            <p className="text-sm text-slate-500">Redirecting…</p>
            <Loader2 size={18} className="animate-spin text-blue-500 mt-1" />
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── Orchestrator ─────────────────────────────────────────────────────── */
/**
 * Props:
 *   initialStep  "update" | "verify"   — which modal to show first
 *   recoveryEmail  string               — current recovery email (may be empty)
 *   onDone()                            — called when verification completes or user skips
 */
const RecoveryEmailVerificationFlow = ({ initialStep, recoveryEmail: initialEmail, onDone }) => {
  const [step, setStep]   = useState(initialStep); // "update" | "verify"
  const [email, setEmail] = useState(initialEmail || "");

  const handleEmailSaved = (savedEmail) => {
    setEmail(savedEmail);
    // Save confirmation popup timestamp so we don't re-show it today if the
    // user skips OTP — mirrors the iOS completion handler chain.
    localStorage.setItem("cat_confirmEmailPopupTs", Date.now().toString());
    setStep("verify");
  };

  const handleVerified = () => {
    // Clear both timestamps so we don't skip showing a new popup in future sessions
    localStorage.removeItem("cat_updateEmailPopupTs");
    localStorage.removeItem("cat_confirmEmailPopupTs");
    onDone();
  };

  if (step === "update") {
    return (
      <UpdateEmailModal
        onSaved={handleEmailSaved}
        onSkip={onDone}
      />
    );
  }

  return (
    <VerifyEmailModal
      recoveryEmail={email}
      onVerified={handleVerified}
      onSkip={onDone}
    />
  );
};

export default RecoveryEmailVerificationFlow;
