import { Eye, EyeOff } from "lucide-react";
import FontLogo from "../../assets/categorizrFontLogo.png";

export const authInputClass =
  "w-full px-4 py-3 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 shadow-sm border border-transparent focus:outline-none focus:ring-2 focus:ring-sky-400/60 focus:border-sky-300 transition";

export const authLinkClass =
  "cursor-pointer block mt-2.5 text-sm font-semibold text-white/95 hover:text-white transition";

export const authErrorClass = "text-red-300 text-sm block mt-1.5";

export const AuthFormCard = ({ title, children }) => (
  <div className="w-full max-w-md lg:max-w-lg bg-gradient-to-b from-[#1e40af] via-blue-900 to-[#172554] text-white px-7 py-9 sm:px-9 sm:py-11 rounded-3xl shadow-2xl shadow-blue-950/50 border border-white/10">
    <img
      src={FontLogo}
      alt="Categorizr"
      className="h-10 sm:h-11 w-auto object-contain mb-5 sm:mb-6"
    />
    <h2 className="text-3xl font-bold tracking-tight mb-7 sm:mb-8">{title}</h2>
    {children}
  </div>
);

export const AuthPrimaryButton = ({ type = "submit", onClick, children }) => (
  <button
    type={type}
    onClick={onClick}
    className="w-full mt-6 bg-sky-500 hover:bg-sky-400 active:bg-sky-600 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-blue-950/30 transition"
  >
    {children}
  </button>
);

export const AuthSecondaryButton = ({ onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full bg-slate-100 hover:bg-white text-blue-900 py-3.5 rounded-xl font-bold transition shadow-sm"
  >
    {children}
  </button>
);

export const AuthDivider = () => (
  <div className="flex items-center gap-3 my-5 sm:my-6">
    <div className="flex-1 h-px bg-white/25" />
    <span className="text-sm font-semibold text-white/80">or</span>
    <div className="flex-1 h-px bg-white/25" />
  </div>
);

export const AuthFooter = () => (
  <div className="text-sm mt-8 text-center text-blue-100/90 leading-relaxed space-y-4">
    <p>
      Having trouble signing in?{" "}
      <span
        onClick={() => window.open("https://categorizr.com/#contactus")}
        className="underline cursor-pointer font-bold text-white hover:text-sky-200 transition"
      >
        Contact Customer Care
      </span>
    </p>
    <p>
      By continuing, you agree to our{" "}
      <span
        onClick={() => window.open("https://categorizr.com/privacy-policy/")}
        className="underline cursor-pointer font-bold text-white hover:text-sky-200 transition"
      >
        Privacy Policy
      </span>
    </p>
  </div>
);

export const AuthPasswordToggle = ({ showPassword, onToggle }) => (
  <button
    type="button"
    className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-800 hover:text-blue-900 p-1 rounded-md transition"
    onClick={onToggle}
    aria-label={showPassword ? "Hide password" : "Show password"}
  >
    {showPassword ? <Eye size={20} /> : <EyeOff size={20} />}
  </button>
);
