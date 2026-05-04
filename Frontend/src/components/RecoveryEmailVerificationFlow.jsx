/**
 * RecoveryEmailVerificationFlow
 *
 * Shown on the home page when the user's recovery email is not yet verified.
 * Calls two APIs:
 *   POST /api/user/sendmailotptoverify         — backend sends OTP to recovery email
 *   POST /api/user/verifymailotpforemailv1?code — backend verifies the code
 *
 * Everything else (finding the address, sending the email) is handled server-side.
 */
import { useState, useEffect, useRef } from "react";
import { X, ShieldCheck, Loader2, RefreshCw } from "lucide-react";

const BASE_URL = "/api";
const OTP_LENGTH = 4;

/** Returns true if a stored ms-timestamp is from today's calendar day */
export const isTimestampFromToday = (ts) => {
  if (!ts) return false;
  const stored = new Date(Number(ts));
  const now    = new Date();
  return (
    stored.getFullYear() === now.getFullYear() &&
    stored.getMonth()    === now.getMonth()    &&
    stored.getDate()     === now.getDate()
  );
};

const RecoveryEmailVerificationFlow = ({ onDone }) => {
  const [otp, setOtp]             = useState(Array(OTP_LENGTH).fill(""));
  const [sending, setSending]     = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sent, setSent]           = useState(false);
  const [error, setError]         = useState("");
  const [cooldown, setCooldown]   = useState(0);
  const inputRefs                 = useRef([]);
  const timerRef                  = useRef(null);

  // Auto-send OTP as soon as the modal opens
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
      const res = await fetch(`${BASE_URL}/user/sendmailotptoverifyv1`, {
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
    const next  = [...otp];
    next[index] = digit;
    setOtp(next);
    setError("");
    if (digit && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) inputRefs.current[index - 1]?.focus();
    if (e.key === "ArrowLeft"  && index > 0)            inputRefs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  };

  const handlePaste = (e) => {
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
    if (code.length < OTP_LENGTH) { setError(`Please enter all ${OTP_LENGTH} digits.`); return; }

    setVerifying(true);
    setError("");
    try {
      const token  = localStorage.getItem("token");
      const params = new URLSearchParams({ code }).toString();
      const res    = await fetch(`${BASE_URL}/user/verifymailotpforemail?${params}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accesstoken: token },
      });
      const text = await res.text().catch(() => "");
      let data = {};
      try { data = JSON.parse(text); } catch { /* plain-text response is fine */ }

      const msg = (data?.message || text || "").toLowerCase();
      // Treat as success if HTTP ok OR message contains "success"/"verified"
      const isSuccess = res.ok || msg.includes("success") || msg.includes("verif");
      if (!isSuccess) {
        throw new Error(data?.message || text || "Verification failed. Please check the code.");
      }

      // Clear timestamp and close immediately — parent shows the toast
      localStorage.removeItem("cat_confirmEmailPopupTs");
      onDone(true); // true = verified successfully
    } catch (err) {
      setError(err.message || "Invalid code. Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-auto overflow-hidden">

        {/* Header */}
        <div className="relative bg-gradient-to-br from-blue-600 to-blue-700 px-6 pt-8 pb-6 text-white text-center">
          <button
            onClick={onDone}
            className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/20 transition-colors"
            aria-label="Skip"
          >
            <X size={16} />
          </button>

          <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
            <ShieldCheck size={28} className="text-white" />
          </div>

          <h2 className="text-lg font-bold">Verify Your Email</h2>
          <p className="text-sm text-blue-100 mt-1">
            {sent
              ? "We sent a verification code to your recovery email."
              : "Sending verification code…"}
          </p>
        </div>

        {/* Body */}
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
                    onPaste={i === 0 ? handlePaste : undefined}
                    className={`w-10 h-12 text-center text-lg font-bold border-2 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      digit
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 text-slate-800"
                    }`}
                  />
                ))}
              </div>
              {error && (
                <p className="mt-2 text-xs text-red-500 text-center">
                  <span className="font-bold">! </span>{error}
                </p>
              )}
            </div>

            {/* Verify */}
            <button
              onClick={handleVerify}
              disabled={verifying || otp.join("").length < OTP_LENGTH}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl py-2.5 flex items-center justify-center gap-2 transition-colors"
            >
              {verifying
                ? <><Loader2 size={15} className="animate-spin" /> Verifying…</>
                : "Verify Email"}
            </button>

            {/* Resend */}
            <div className="flex items-center justify-center text-xs text-slate-400">
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
              onClick={onDone}
              className="w-full text-xs text-slate-400 hover:text-slate-600 py-1 transition-colors"
            >
              Skip for now
            </button>
          </div>
      </div>
    </div>
  );
};

export default RecoveryEmailVerificationFlow;
