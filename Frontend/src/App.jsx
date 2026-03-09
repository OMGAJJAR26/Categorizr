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
            <Route path="/homepage" element={<HomePage />} />
            <Route path="/receipt/:id" element={<ReceiptDetail />} />
            <Route path="/summary-report" element={<SummaryReport />} />
            <Route path="/tax-report" element={<TaxTypePopup />} />
          </Routes>
        </DataProvider>
      </SessionManager>
    </>
  );
};

export default App;
