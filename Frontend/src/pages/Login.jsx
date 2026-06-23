import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  authLinkClass,
  authErrorClass,
} from "../components/auth/AuthFormCard";
import { Formik, Form, Field, ErrorMessage } from "formik";
import * as Yup from "yup";
import { useLoader } from "../context/LoaderContext";
import { useData } from "../context/DataContext";
import ForgotPasswordModal from "./ForgotPasswordModel";
import ForgotUsernameModal from "./ForgotUsernameModel";

const Login = () => {
  const [alertMsg, setAlertMsg] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [showUsernameModel, setShowUsernameModel] = useState(false);
  const navigate = useNavigate();
  const { setLoading } = useLoader();
  const { refreshData } = useData();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      navigate("/homepage", { replace: true });
    }
  }, [navigate]);

  const validationSchema = Yup.object({
    userName: Yup.string().required("Username is required"),
    password: Yup.string()
      .min(8, "Minimum 8 characters")
      .required("Password is required"),
  });

  const handleLogin = async (values) => {
    setLoading(true);
    const query = new URLSearchParams({
      userName: values.userName,
      password: values.password,
    }).toString();
    try {
      const res = await fetch(`/api/user/login?${query}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accesstoken: "-",
        },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (res.ok && data.authenticationToken) {
        localStorage.setItem("token", data.authenticationToken);
        localStorage.setItem("id", data.id);
        localStorage.setItem("fk_user_id", data.id);
        // Register device once per login — fire and forget, non-blocking
        const deviceParams = new URLSearchParams({
          deviceId: "0", deviceType: "2", deviceToken: "0", version: "-",
        }).toString();
        fetch(`/api/user/updatedevicetoken?${deviceParams}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accesstoken: data.authenticationToken },
        }).catch(() => {});
        // Kick off data fetch immediately so receipts are ready when homepage renders
        refreshData();
        navigate("/homepage", { replace: true });
      } else {
        setAlertMsg(data.message || "Login failed");
      }
    } catch (err) {
      setAlertMsg("Login failed: " + err.message);
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
              <div>
                <Field
                  name="userName"
                  type="text"
                  placeholder="Username"
                  autoComplete="username"
                  className={authInputClass}
                />
                <span
                  onClick={() => setShowUsernameModel(true)}
                  className={authLinkClass}
                >
                  Forgot Username?
                </span>
                <ErrorMessage
                  name="userName"
                  component="span"
                  className={authErrorClass}
                />
              </div>

              <div className="mt-5">
                <div className="relative">
                  <Field
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    autoComplete="current-password"
                    className={`${authInputClass} pr-12`}
                  />
                  <AuthPasswordToggle
                    showPassword={showPassword}
                    onToggle={() => setShowPassword(!showPassword)}
                  />
                </div>
                <span
                  onClick={() => setShowForgotModal(true)}
                  className={authLinkClass}
                >
                  Forgot Password?
                </span>
                <ErrorMessage
                  name="password"
                  component="div"
                  className={authErrorClass}
                />
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
      {alertMsg && (
        <SimpleAlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />
      )}
    </AuthPageLayout>
  );
};

export default Login;
