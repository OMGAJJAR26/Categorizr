import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Toast from "../components/Toast";
import SimpleAlertModal from "../components/SimpleAlertModal";
import AuthPageLayout from "../components/auth/AuthPageLayout";
import {
  AuthFormCard,
  AuthPrimaryButton,
  AuthSecondaryButton,
  AuthDivider,
  AuthFooter,
  AuthPasswordToggle,
  authInputClass,
  authErrorClass,
} from "../components/auth/AuthFormCard";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useLoader } from "../context/LoaderContext";

const getBrowserCountry = async () => {
  try {
    const res = await fetch("https://ipapi.co/json/", {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json();
      return (data.country_name || data.country || "").trim();
    }
  } catch {
    /* ignore network errors */
  }

  try {
    const locale = navigator.language || "";
    const parts = locale.split("-");
    if (parts.length >= 2) {
      const regionCode = parts[parts.length - 1].toUpperCase();
      const display = new Intl.DisplayNames(["en"], { type: "region" });
      return display.of(regionCode) || "";
    }
  } catch {
    /* ignore */
  }

  return "";
};

const USERNAME_PATTERN = /^[a-zA-Z0-9.]*$/;

const isValidEmailAddress = (email) => {
  if (!email || typeof email !== "string") return false;

  const trimmed = email.trim();
  const match = trimmed.match(/^([a-zA-Z0-9._%+-]+)@(.+)$/);
  if (!match) return false;

  const domain = match[2];
  const parts = domain.split(".");
  if (parts.length < 2) return false;
  if (parts.some((part) => !part.length)) return false;

  const tld = parts[parts.length - 1];
  if (!/^[a-zA-Z]{2,}$/.test(tld)) return false;

  return parts.slice(0, -1).every((part) =>
    /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(part)
  );
};

const Signup = () => {
  const [toastConfig, setToastConfig] = useState({
    isVisible: false,
    message: "",
    type: "error",
  });
  const [alertMsg, setAlertMsg] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { setLoading } = useLoader();

  const formik = useFormik({
    initialValues: {
      userName: "",
      emailAddress: "",
      password: "",
    },
    validationSchema: Yup.object({
      userName: Yup.string()
        .required("Please enter a username")
        .matches(
          USERNAME_PATTERN,
          "Username can only contain letters, numbers, and periods. No spaces allowed."
        )
        .min(4, "Username must be between 4 and 30 characters")
        .max(30, "Username must be between 4 and 30 characters"),
      emailAddress: Yup.string()
        .required("Please enter your email address")
        .test(
          "valid-email",
          "Please enter a valid email address",
          (value) => !value || isValidEmailAddress(value)
        ),
      password: Yup.string()
        .required("Please enter a password")
        .min(8, "Password must be more than 8 characters"),
    }),
    onSubmit: async (values) => {
      setLoading(true);
      try {
        const country = await getBrowserCountry();

        const signupPayload = {
          userName: values.userName,
          emailAddress: values.userName,
          password: values.password,
          recoveryEmail: values.emailAddress,
          duplicate_eReciept_email: values.emailAddress,
          location: country,
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
          if (!data.authenticationToken) {
            setToastConfig({
              isVisible: true,
              message: data.message || "Username or email already exists",
              type: "error",
            });
            return;
          }

          const token = data.authenticationToken || "";
          if (token) {
            localStorage.setItem("token", token);
            if (data.id) {
              localStorage.setItem("id", data.id);
              localStorage.setItem("fk_user_id", data.id);
            }
            localStorage.removeItem("cat_confirmEmailPopupTs");

            try {
              const deviceParams = new URLSearchParams({
                deviceId: "0",
                deviceType: "2",
                deviceToken: "0",
                version: "-",
              }).toString();

              await fetch(`/api/user/updatedevicetoken?${deviceParams}`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Accesstoken: token,
                },
              });
            } catch (deviceErr) {
              console.warn(
                "updatedevicetoken failed (non-fatal):",
                deviceErr?.message || deviceErr
              );
            }
          }

          setToastConfig({
            isVisible: true,
            message: data.message || "Signup successful",
            type: "success",
          });
          navigate("/homepage", { replace: true });
        } else {
          setToastConfig({
            isVisible: true,
            message: data.message || "Signup failed",
            type: "error",
          });
        }
      } catch (err) {
        console.error("Signup failed:", err?.message || err);
        setToastConfig({
          isVisible: true,
          message: "Signup failed",
          type: "error",
        });
      } finally {
        setLoading(false);
      }
    },
  });

  const handleUsernameChange = (e) => {
    const { value } = e.target;
    if (!USERNAME_PATTERN.test(value)) {
      setAlertMsg(
        "Username can only contain letters, numbers, and periods. No spaces allowed."
      );
      formik.setFieldValue("userName", value.replace(/[^a-zA-Z0-9.]/g, ""));
      return;
    }
    formik.handleChange(e);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    const errors = await formik.validateForm();
    formik.setTouched({
      userName: true,
      emailAddress: true,
      password: true,
    });
    if (Object.keys(errors).length > 0) {
      setAlertMsg(
        errors.userName || errors.emailAddress || errors.password
      );
      return;
    }
    formik.submitForm();
  };

  return (
    <AuthPageLayout>
      <form
        onSubmit={handleFormSubmit}
        className="w-full flex justify-center"
      >
        <AuthFormCard title="Sign Up">
          <div className="mb-5">
            <input
              type="text"
              name="userName"
              placeholder="Username"
              autoComplete="username"
              value={formik.values.userName}
              onChange={handleUsernameChange}
              onBlur={formik.handleBlur}
              maxLength={30}
              className={authInputClass}
            />
            {formik.touched.userName && formik.errors.userName && (
              <div className={authErrorClass}>{formik.errors.userName}</div>
            )}
          </div>

          <div className="mb-5">
            <input
              type="email"
              name="emailAddress"
              placeholder="Email Address"
              value={formik.values.emailAddress}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              className={authInputClass}
            />
            {formik.touched.emailAddress && formik.errors.emailAddress && (
              <div className={authErrorClass}>{formik.errors.emailAddress}</div>
            )}
          </div>

          <div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                placeholder="Enter Password"
                autoComplete="new-password"
                value={formik.values.password}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                className={`${authInputClass} pr-12`}
              />
              <AuthPasswordToggle
                showPassword={showPassword}
                onToggle={() => setShowPassword((s) => !s)}
              />
            </div>
            {formik.touched.password && formik.errors.password && (
              <div className={authErrorClass}>{formik.errors.password}</div>
            )}
          </div>

          <AuthPrimaryButton>
            <b>Sign Up</b>
          </AuthPrimaryButton>

          <AuthDivider />

          <AuthSecondaryButton onClick={() => navigate("/login")}>
            <b>Sign In</b>
          </AuthSecondaryButton>

          <AuthFooter />
        </AuthFormCard>
      </form>

      <Toast
        isVisible={toastConfig.isVisible}
        message={toastConfig.message}
        type={toastConfig.type}
        onClose={() =>
          setToastConfig((prev) => ({ ...prev, isVisible: false }))
        }
      />

      {alertMsg && (
        <SimpleAlertModal
          message={alertMsg}
          onClose={() => setAlertMsg(null)}
        />
      )}
    </AuthPageLayout>
  );
};

export default Signup;
