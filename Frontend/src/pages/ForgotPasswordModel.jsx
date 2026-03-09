import { useState } from "react";
import { useLoader } from "../context/LoaderContext";
import { PropagateLoader } from "react-spinners";
import FontLogo from "../assets/categorizrFontLogo.png";
 
const ForgotPasswordModal = ({ onClose }) => {
  const [email, setEmail] = useState("");
  const { loading, setLoading } = useLoader();
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    const query = new URLSearchParams({ recoveryEmail : email }).toString();
    setMessage("");

    try {
      const res = await fetch(`/api/user/forgotpassword?${query}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accesstoken: "-",
        },
        body: JSON.stringify({ recoveryEmail : email }),
      });

    
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new Error(`Server error ${res.status}: ${errBody || "Request failed"}`);
      }

      const data = await res.json().catch(() => ({}));
      setMessage(data.message || "Recovery email sent!");
    } catch (err) {
      setMessage("Failed to send email.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 backdrop-blur-sm flex items-center justify-center z-50">
      <div
        className="bg-blue-800 rounded-2xl shadow-2xl p-10 w-full max-w-md"
        style={{
          minHeight: "325px",
          display: "inline-flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          minWidth: "90px"
        }}
      >
        {/* Logo */}
        <img src={FontLogo} alt="FontLogo" className="w-40 mb-4" />

        <h2 className="text-xl font-semibold text-white text-center mb-4 py-2 px-6">
          Forgot Your Password?
        </h2>

        <p className="text-center text-white mb-6 text-md px-1 ">
          Enter your username and we will send you instructions to reset
          your password.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-md text-white font-medium">
            Enter Username or Email
          </label>
          <input
            type="text"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter Username"
            className="w-full border border-blue-500 rounded-md py-2 focus:outline-none focus:ring-2 focus:ring-purple-600 text-gray-800"
            style={{marginRight: "88px"}}
          />

          {loading ? (
            <div className="flex justify-center">
              <PropagateLoader color="#7f56d9" size={10} />
            </div>
          ) : (
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-900 text-white font-semibold py-2 rounded-md transition"
              style={{marginTop: "25px"}}
            >
              Continue
            </button>
          )}

          {message && (
            <p className="text-center text-sm text-green-600 mt-2">{message}</p>
          )}

          <p
            onClick={onClose}
            className="text-sm text-center text-white cursor-pointer mt-4"
            style={{marginTop: "25px"}}
          >
             Login
          </p>
        </form>
      </div>
    </div>
  );
};

export default ForgotPasswordModal;
