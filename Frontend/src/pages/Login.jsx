import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Logo from "../assets/categorizrLogoSimple.png";
import FontLogo from "../assets/categorizrFontLogo.png";
import { Eye, EyeOff } from "lucide-react";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { Formik, Form, Field, ErrorMessage } from "formik";
import * as Yup from "yup";
import { useLoader } from "../context/LoaderContext";
import ForgotPasswordModal from "./ForgotPasswordModel";
import ForgotUsernameModal from "./ForgotUsernameModel";
const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [showUsernameModel, setShowUsernameModel] = useState(false);
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
  // If user has valid token (e.g. swiped back from homepage), redirect to homepage
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
            Accesstoken : "-",
        },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (res.ok && data.authenticationToken) {
        localStorage.setItem("token", data.authenticationToken);
        localStorage.setItem("id", data.id);
        localStorage.setItem("fk_user_id", data.id);
        // Navigate and replace history to prevent back button issues
        navigate("/homepage", { replace: true });
      } else {
        alert(data.message || "Login failed");
      }
    } catch (err) {
      alert("Login failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="flex flex-col lg:flex-row min-h-screen font-dmsans bg-white">
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-6 pb-0 lg:pb-10 lg:p-10 text-center">
        <img src={Logo} alt="Categorizr Logo" className="w-368 h-40 lg:mb-9" />
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
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6">
        <Formik
          initialValues={{ userName: "", password: "" }}
          validationSchema={validationSchema}
          onSubmit={handleLogin}
        >
          {() => (
            <Form className="bg-blue-800 text-white px-6 lg:px-10  py-8 lg:py-16 w-full max-w-2xl rounded-3xl shadow-xl">
              <img src={FontLogo} alt="Categorizr" className="w-60 mb-4 lg:mb-6" />
              <h2 className="text-3xl font-bold mb-3 lg:mb-6">Login</h2>
              <div>
                <Field
                  name="userName"
                  type="text"
                  placeholder="Username"
                  autoComplete="username"
                  className="w-full px-4 py-2 rounded-md text-black m-0"
                />
                <span
                  onClick={() => setShowUsernameModel(true)}
                  className="cursor-pointer block mt-2"
                >
                  <b>Forgot Username?</b>
                </span>
                <ErrorMessage
                  name="userName"
                  component="span"
                  className="text-red-400 text-sm block"
                />
              </div>
              <div className="mt-4">
                <div className="relative">
                  <Field
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    autoComplete="current-password"
                    className="w-full px-4 py-2 rounded-md text-black m-0"
                  />
                  <span
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-blue-800 cursor-pointer"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <Eye size={20} /> : <EyeOff size={20} />}
                  </span>
                </div>
                <div>
                  <span
                    onClick={() => setShowForgotModal(true)}
                    className="cursor-pointer block mt-2"
                  >
                    <b>Forgot Password?</b>
                  </span>
                  <ErrorMessage
                    name="password"
                    component="div"
                    className="text-red-400 text-sm block"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded-md font-medium mt-4"
              >
                <b>Sign In</b>
              </button>
              <div className="my-1 lg:my-4 text-center font-semibold">or</div>
              <button
                type="button"
                onClick={() => navigate("/signup")}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 py-3 rounded-md font-medium"
              >
                <b>Sign Up</b>
              </button>
              <div className="text-sm mt-6 text-center">
                <p>
                  Having trouble signing in?{" "}
                  <span
                    onClick={() =>
                      window.open("https://categorizr.com/#contactus")
                    }
                    className="underline cursor-pointer font-bold"
                  >
                    Contact Customer Care
                  </span>
                </p>
                <br />
                <p>
                  By continuing, you agree to our{" "}
                  <span
                    onClick={() =>
                      window.open("https://categorizr.com/privacy-policy/")
                    }
                    className="underline cursor-pointer font-bold"
                  >
                    Privacy Policy
                  </span>
                </p>
              </div>
            </Form>
          )}
        </Formik>
      </div>
      {showForgotModal && (
        <ForgotPasswordModal onClose={() => setShowForgotModal(false)} />
      )}
      {showUsernameModel && (
        <ForgotUsernameModal onClose={() => setShowUsernameModel(false)} />
      )}
    </div>
  );
};
export default Login;