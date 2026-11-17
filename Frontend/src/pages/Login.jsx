import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AuthPageLayout from "../components/auth/AuthPageLayout";
import {
  AuthFormCard,
  AuthPrimaryButton,
  AuthSecondaryButton,
  AuthDivider,
  AuthFooter,
  AuthPasswordToggle,
  authInputClass,
  authLinkClass,
  authErrorClass,
} from "../components/auth/AuthFormCard";
import { Formik, Form, Field, ErrorMessage } from "formik";
import * as Yup from "yup";
import { useLoader } from "../context/LoaderContext";
import { useData } from "../context/DataContext";
import { clearLocalDataForUserSwitch } from "../utils/authStorage";
import ForgotPasswordModal from "./ForgotPasswordModel";
import ForgotUsernameModal from "./ForgotUsernameModel";

const Login = () => {
  // Combined server-side auth error, shown as a single red banner at the top of
  // the form (security best practice: never reveal which field was wrong).
  const [authError, setAuthError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [showUsernameModel, setShowUsernameModel] = useState(false);
  const navigate = useNavigate();
  const { setLoading } = useLoader();
  const { refreshDataAfterAuth } = useData();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      navigate("/homepage", { replace: true });
    }
  }, [navigate]);

  // Client-side checks are reserved strictly for empty fields. No password-length
  // or email-syntax rule here: the first field accepts a username OR a recovery
  // email, and a legacy password may be shorter than 8 chars — anything else is
  // decided by the server and surfaced via the combined red banner.
  const validationSchema = Yup.object({
    userName: Yup.string().trim().required("Please enter Username or Email."),
    password: Yup.string().required("Please enter Password."),
  });

  const handleLogin = async (values) => {
    setAuthError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/user/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accesstoken: "-",
        },
        body: JSON.stringify({
          // The user may type a username or their recovery email here; the server
          // resolves either to the account.
          userName: values.userName.trim(),
          password: values.password,
        }),
      });
      const data = await res.json();
      if (res.ok && data.authenticationToken) {
        // If a DIFFERENT user is signing in on a device a prior user used, wipe all
        // prior local data first so nothing (tax types, merchants, payment methods,
        // expense categories, filters, etc.) leaks across accounts. The user id is
        // nested under data.user (top-level data.id is undefined).
        const newId = String(data.user?.id ?? data.id ?? "");
        const prevId = String(
          localStorage.getItem("fk_user_id") || localStorage.getItem("id") || ""
        );
        // Only treat as a different user when we can positively identify a new id
        // that differs — never wipe when the id is unknown.
        const isDifferentUser = !!prevId && !!newId && prevId !== newId;
        if (isDifferentUser) {
          clearLocalDataForUserSwitch();
        }

        localStorage.setItem("token", data.authenticationToken);
        localStorage.setItem("id", newId || data.id);
        localStorage.setItem("fk_user_id", newId || data.id);
        // Register device once per login — fire and forget, non-blocking
        const deviceParams = new URLSearchParams({
          deviceId: "0", deviceType: "2", deviceToken: "0", version: "-",
        }).toString();
        fetch(`/api/user/updatedevicetoken?${deviceParams}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accesstoken: data.authenticationToken },
        }).catch(() => {});
        if (isDifferentUser) {
          // Hard reload so every in-memory cache and localStorage-seeded state
          // re-initializes clean for the new user (no stale prior-user data).
          window.location.replace("/homepage");
          return;
        }
        // Load user + receipts before navigating so header/receipts render immediately
        await refreshDataAfterAuth();
        navigate("/homepage", { replace: true });
      } else {
        // Any wrong username / email / password combination → one generic banner.
        setAuthError({
          title: "Incorrect Username, Email, or Password.",
          subtitle: "Please try again.",
        });
      }
    } catch {
      setAuthError({
        title: "Something went wrong. Please try again.",
        subtitle: null,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPageLayout>
      <Formik
        initialValues={{ userName: "", password: "" }}
        validationSchema={validationSchema}
        onSubmit={handleLogin}
      >
        {() => (
          <Form className="w-full flex justify-center">
            <AuthFormCard title="Login">
              {authError && (
                <div
                  role="alert"
                  className="mb-6 rounded-xl bg-red-500 text-white px-4 py-3 shadow-lg text-center"
                >
                  <p className="font-bold text-sm">{authError.title}</p>
                  {authError.subtitle && (
                    <p className="text-sm text-red-50/95 mt-0.5">
                      {authError.subtitle}
                    </p>
                  )}
                </div>
              )}

              <div>
                <Field
                  name="userName"
                  type="text"
                  placeholder="Enter Username or Email"
                  autoComplete="username"
                  className={authInputClass}
                />
                <ErrorMessage
                  name="userName"
                  component="div"
                  className={authErrorClass}
                />
                <span
                  onClick={() => setShowUsernameModel(true)}
                  className={`${authLinkClass} text-right`}
                >
                  Forgot Username?
                </span>
              </div>

              <div className="mt-5">
                <div className="relative">
                  <Field
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter Password"
                    autoComplete="current-password"
                    className={`${authInputClass} pr-12`}
                  />
                  <AuthPasswordToggle
                    showPassword={showPassword}
                    onToggle={() => setShowPassword(!showPassword)}
                  />
                </div>
                <ErrorMessage
                  name="password"
                  component="div"
                  className={authErrorClass}
                />
                <span
                  onClick={() => setShowForgotModal(true)}
                  className={`${authLinkClass} text-right`}
                >
                  Forgot Password?
                </span>
              </div>

              <AuthPrimaryButton>
                <b>Sign In</b>
              </AuthPrimaryButton>

              <AuthDivider />

              <AuthSecondaryButton onClick={() => navigate("/signup")}>
                <b>Sign Up</b>
              </AuthSecondaryButton>

              <AuthFooter />
            </AuthFormCard>
          </Form>
        )}
      </Formik>

      {showForgotModal && (
        <ForgotPasswordModal onClose={() => setShowForgotModal(false)} />
      )}
      {showUsernameModel && (
        <ForgotUsernameModal onClose={() => setShowUsernameModel(false)} />
      )}
    </AuthPageLayout>
  );
};

export default Login;
