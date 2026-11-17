import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// Shows the message the app hands over when it has had to sign the user out, e.g.
// navigate("/login", { state: { notice: { title, subtitle } } }) after a deleted account
// or an invalid session. It is read once and then removed from the history entry, so a
// refresh or a later visit to the page doesn't show it again.
const AuthNotice = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [notice] = useState(() => location.state?.notice ?? null);

  useEffect(() => {
    if (location.state?.notice) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  if (!notice?.title) return null;

  return (
    <div
      role="status"
      className="mb-6 rounded-xl border border-amber-300/50 bg-amber-300/15 px-4 py-3 text-center text-amber-50"
    >
      <p className="font-bold text-sm">{notice.title}</p>
      {notice.subtitle && (
        <p className="text-sm text-amber-50/90 mt-0.5">{notice.subtitle}</p>
      )}
    </div>
  );
};

export default AuthNotice;
