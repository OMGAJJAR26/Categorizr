import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { BrowserRouter } from "react-router-dom";
import "./styles.css";
import { LoaderProvider } from "./context/LoaderContext";
import { CurrencyProvider } from "./context/CurrencyContext";
// import { ThemeProvider } from "./context/ThemeContext";

// Overwrite global fetch to ensure updatedevicetoken is called before every API call
const originalFetch = window.fetch;
let tokenUpdatePromise = null;

window.fetch = async (...args) => {
  const [resource] = args;
  const url = typeof resource === 'string' ? resource : (resource instanceof Request ? resource.url : '');
  
  const isApiCall = url && (url.includes('/api/') || url.includes('categorizr.com/'));
  const isExcluded = url && (
    url.includes('/api/user/updatedevicetoken') || 
    url.includes('/api/user/login') || 
    url.includes('/api/user/signup') ||
    url.includes('/api/user/forgotpassword') ||
    url.includes('/api/user/forgotusername') ||
    url.includes('ipapi.co')
  );

  if (isApiCall && !isExcluded) {
    const token = localStorage.getItem('token');
    if (token) {
      if (!tokenUpdatePromise) {
        const deviceParams = new URLSearchParams({
          deviceId:    "0",
          deviceType:  "2",
          deviceToken: "0",
          version:     "-",
        }).toString();
        
        tokenUpdatePromise = originalFetch(`/api/user/updatedevicetoken?${deviceParams}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accesstoken: token,
          },
        }).catch(err => {
          console.warn("Global device token update failed:", err);
        }).finally(() => {
          tokenUpdatePromise = null;
        });
      }
      
      try {
        await tokenUpdatePromise;
      } catch (e) {
        // ignore
      }
    }
  }

  return originalFetch(...args);
};


ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <LoaderProvider>
        {/* <ThemeProvider> */}
          <CurrencyProvider>
            <App />
          </CurrencyProvider>
        {/* </ThemeProvider> */}
      </LoaderProvider>
    </BrowserRouter>
  </React.StrictMode>
);
