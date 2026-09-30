// src/App.jsx
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import GlobalLoader from "./components/GlobalLoader";
import HomePage from "./pages/HomePage";
import SessionManager from "./components/SessionManager";
import ReceiptDetail from "./pages/ReceiptDetail";
import SummaryReport from "./pages/SummaryReport";
import { DataProvider } from "./context/DataContext";
import TaxTypePopup from "./components/filters/TaxTypePopup";
import Settings from "./pages/Settings";
import ReceiptGallery from "./pages/ReceiptGallery";

const RequireAuth = ({ children }) => {
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/login" replace />;
  return children;
};

const App = () => {
  return (
    <>
      <SessionManager>
        <GlobalLoader />
        <DataProvider>
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
        </DataProvider>
      </SessionManager>
    </>
  );
};

export default App;
