import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Toast from "../components/Toast";
import { useFormik } from "formik";
import * as Yup from "yup";
import Logo from "../assets/categorizrLogoSimple.png";
import FontLogo from "../assets/categorizrFontLogo.png";
import { Eye, EyeOff } from "lucide-react";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { useLoader } from "../context/LoaderContext";

// Resolve the user's country name from the browser.
// 1st attempt: IP-based geolocation (no API key needed).
// Fallback: derive from navigator.language locale code.
const getBrowserCountry = async () => {
  try {
    const res = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      return (data.country_name || data.country || "").trim();
    }
  } catch { /* ignore network errors */ }

  // Fallback – extract region from navigator.language (e.g. "en-US" → "United States")
  try {
    const locale = navigator.language || "";
    const parts  = locale.split("-");
    if (parts.length >= 2) {
      const regionCode = parts[parts.length - 1].toUpperCase();
      const display = new Intl.DisplayNames(["en"], { type: "region" });
      return display.of(regionCode) || "";
    }
  } catch { /* ignore */ }

  return "";
};

const Signup = () => {
  const [toastConfig, setToastConfig] = useState({ isVisible: false, message: "", type: "error" });
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { setLoading } = useLoader();

  const sliderSettings = {
    dots: false,
    infinite: true,
    speed: 700,
    autoplay: true,
    autoplaySpeed: 3000,
    slidesToShow: 1,
    slidesToScroll: 1,
    arrows: true,
  };

  const formik = useFormik({
    initialValues: {
      userName: "",
      emailAddress: "",
      password: "",
    },
    validationSchema: Yup.object({
      userName: Yup.string().required("Username is required"),
      emailAddress: Yup.string().email("Invalid email").required("Email is required"),
      password: Yup.string().min(8, "Password must be at least 8 characters").required("Password is required"),
    }),
    onSubmit: async (values) => {
      setLoading(true);
      try {
        // ── 1. Resolve country from browser ─────────────────────────────────
        const country = await getBrowserCountry();

        // ── 2. Build signup payload ──────────────────────────────────────────
        // recoveryEmail and duplicate_eReciept_email mirror the primary email.
        const signupPayload = {
          userName:                 values.userName,
          emailAddress:             values.emailAddress,
          password:                 values.password,
          recoveryEmail:            values.emailAddress,
          duplicate_eReciept_email: values.emailAddress,
          location:                 country,
        };

        const query = new URLSearchParams(signupPayload).toString();

        const res = await fetch(`/api/user/signup?${query}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accesstoken: "-",
          },
          body: JSON.stringify(signupPayload),
        });

        const data = await res.json();

        if (res.ok) {
          // ── Check for duplicate user — some APIs return HTTP 200 with no token ──
          if (!data.authenticationToken) {
            setToastConfig({ isVisible: true, message: data.message || "Username or email already exists", type: "error" });
            return;
          }

          // ── 3. Update device token (web device) ─────────────────────────
          // deviceId=0, deviceType=2 (web), deviceToken=0, version=-
          const token = data.authenticationToken || "";
          if (token) {
            localStorage.setItem("token", token);
            if (data.id) {
              localStorage.setItem("id", data.id);
              localStorage.setItem("fk_user_id", data.id);
            }
            // Ensure OTP pops up on homepage
            localStorage.removeItem("cat_confirmEmailPopupTs");
            
            try {
              const deviceParams = new URLSearchParams({
                deviceId:    "0",
                deviceType:  "2",
                deviceToken: "0",
                version:     "-",
              }).toString();

              await fetch(`/api/user/updatedevicetoken?${deviceParams}`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Accesstoken: token,
                },
              });
            } catch (deviceErr) {
              // Non-fatal – signup already succeeded
              console.warn("updatedevicetoken failed (non-fatal):", deviceErr?.message || deviceErr);
            }
          }

          setToastConfig({ isVisible: true, message: data.message || "Signup successful", type: "success" });
          navigate("/homepage", { replace: true });
        } else {
          setToastConfig({ isVisible: true, message: data.message || "Signup failed", type: "error" });
        }
      } catch (err) {
        console.error("Signup failed:", err?.message || err);
        setToastConfig({ isVisible: true, message: "Signup failed", type: "error" });
      } finally {
        setLoading(false);
      }
    },
  });

  return (
    <div className="flex flex-col lg:flex-row min-h-screen font-dmsans bg-white">
      {/* Left Section (Slider) */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-6 pb-0 lg:pb-10 lg:p-10 text-center">
        <img src={Logo} alt="Categorizr Logo" className="w-60 mb-4 lg:mb-6" />
        <Slider {...sliderSettings} className="w-full max-w-6xl">
          <div className="p-5 pb-0 lg:p-12 text-blue-800">
            <h1 className="text-4xl lg:text-6xl font-black mb-3">Track Expenses</h1>
            <p className="text-xl">Keep project spending under control</p>
          </div>
          <div className="p-5 pb-0 lg:p-12 text-blue-800">
            <h1 className="text-4xl lg:text-6xl font-bold mb-3">Organize Receipts</h1>
            <p className="text-xl">AI-Based Sorting</p>
          </div>
          <div className="p-5 pb-0 lg:p-12 text-blue-800">
            <h1 className="text-4xl lg:text-6xl font-bold mb-3">Visual Reports</h1>
            <p className="text-xl">See where your money goes</p>
          </div>
          <div className="p-5 pb-0 lg:p-12 text-blue-800">
            <h1 className="text-4xl lg:text-6xl font-bold mb-3">Maximize Tax Deductions</h1>
            <p className="text-xl">Never Lose another Receipt</p>
          </div>
          <div className="p-5 pb-0 lg:p-12 text-blue-800">
            <h1 className="text-4xl lg:text-6xl font-bold mb-3">Create Reports</h1>
            <p className="text-xl">Run Summary and Detailed Reports</p>
          </div>
        </Slider>
      </div>

      {/* Right Section (Form) */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6">
        <form
          onSubmit={formik.handleSubmit}
          className="bg-blue-800 text-white px-6 lg:px-10 py-8 lg:py-16 w-full max-w-2xl rounded-3xl shadow-xl"
        >
          <img
            src={FontLogo}
            alt="Categorizr"
            className="w-60 mb-6"
            style={{ top: "-24px" }}
          />

          <h2 className="text-3xl font-bold mb-3 lg:mb-6">Sign Up</h2>

          {/* Username */}
          <div className="mb-4">
            <input
              type="text"
              name="userName"
              placeholder="Username"
              autoComplete="username"
              value={formik.values.userName}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              className="w-full px-4 py-2 rounded-md text-black m-0"
            />
            {formik.touched.userName && formik.errors.userName && (
              <div className="text-red-400 text-sm mt-0">{formik.errors.userName}</div>
            )}
          </div>

          {/* Email */}
          <div className="mb-4">
            <input
              type="email"
              name="emailAddress"
              placeholder="Email Address"
              value={formik.values.emailAddress}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              className="w-full px-4 py-2 rounded-md text-black my-0"
            />
            {formik.touched.emailAddress && formik.errors.emailAddress && (
              <div className="text-red-400 text-sm mt-0">{formik.errors.emailAddress}</div>
            )}
          </div>

          {/* Password */}
          <div className="mb-0">
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                placeholder="Enter Password"
                autoComplete="new-password"
                value={formik.values.password}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                className="w-full px-4 py-2 pr-10 rounded-md text-black m-0"
              />
              <span
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-blue-800 cursor-pointer"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setShowPassword((s) => !s);
                }}
              >
                {showPassword ? <Eye size={20} strokeWidth={3} /> : <EyeOff size={20} strokeWidth={3} />}
              </span>
            </div>
            {formik.touched.password && formik.errors.password && (
              <div className="text-red-400 text-sm mt-0">{formik.errors.password}</div>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 py-3 mt-6 rounded-md font-medium"
          >
            <b>Sign Up</b>
          </button>

          <div className="my-1 lg:my-4 text-center font-semibold">or</div>

          <button
            type="button"
            onClick={() => navigate("/login")}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 py-3 rounded-md font-medium"
          >
            <b>Sign In</b>
          </button>

          <div className="text-sm mt-6 text-center">
            <p>
              Having trouble signing in?{" "}
              <span
                onClick={() => window.open("https://categorizr.com/#contactus")}
                className="underline cursor-pointer font-bold"
              >
                Contact Customer Care
              </span>
            </p>
            <br />
            <p>
              By continuing, you agree to our{" "}
              <span
                onClick={() => window.open("https://categorizr.com/privacy-policy/")}
                className="underline cursor-pointer font-bold"
              >
                Privacy Policy
              </span>
            </p>
          </div>
        </form>
      </div>
      <Toast 
        isVisible={toastConfig.isVisible} 
        message={toastConfig.message} 
        type={toastConfig.type} 
        onClose={() => setToastConfig((prev) => ({ ...prev, isVisible: false }))} 
      />
    </div>
  );
};

export default Signup;
