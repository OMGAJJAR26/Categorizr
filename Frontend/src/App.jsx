// src/App.jsx
import { Suspense, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import GlobalLoader from "./components/GlobalLoader";
import SessionManager from "./components/SessionManager";
import { DataProvider } from "./context/DataContext";
import TaxTypePopup from "./components/filters/TaxTypePopup";
import { lazyWithReload } from "./utils/lazyWithReload";

// Login/Signup load with the app; everything after sign-in is split into its own
// chunk so the login screen no longer downloads PDF/OCR/spreadsheet libraries.
const loadHomePage = () => import("./pages/HomePage");
// lazyWithReload reloads once if a chunk was replaced by a newer deploy while this tab was open.
const HomePage = lazyWithReload(loadHomePage);
const ReceiptDetail = lazyWithReload(() => import("./pages/ReceiptDetail"));
const SummaryReport = lazyWithReload(() => import("./pages/SummaryReport"));
const Settings = lazyWithReload(() => import("./pages/Settings"));
const ReceiptGallery = lazyWithReload(() => import("./pages/ReceiptGallery"));

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center" role="status" aria-label="Loading">
    <div className="w-8 h-8 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
  </div>
);

const RequireAuth = ({ children }) => {
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/login" replace />;
  return children;
};

const App = () => {
  // Warm the home page chunk while the user is on the login screen so signing in
  // does not wait on a download.
  useEffect(() => {
    const id = setTimeout(() => { loadHomePage().catch(() => {}); }, 1500);
    return () => clearTimeout(id);
  }, []);

  return (
    <>
      <SessionManager>
        <GlobalLoader />
        <DataProvider>
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Navigate to="/login" />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/homepage" element={<RequireAuth><HomePage /></RequireAuth>} />
            <Route path="/receipt-gallery" element={<RequireAuth><ReceiptGallery /></RequireAuth>} />
            <Route path="/receipt/:id" element={<RequireAuth><ReceiptDetail /></RequireAuth>} />
            <Route path="/summary-report" element={<RequireAuth><SummaryReport /></RequireAuth>} />
            <Route path="/tax-report" element={<RequireAuth><TaxTypePopup /></RequireAuth>} />
            <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
          </Routes>
          </Suspense>
        </DataProvider>
      </SessionManager>
    </>
  );
};

export default App;
