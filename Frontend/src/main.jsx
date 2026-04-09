import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { BrowserRouter } from "react-router-dom";
import "./styles.css";
import { LoaderProvider } from "./context/LoaderContext";
import { CurrencyProvider } from "./context/CurrencyContext";
// import { ThemeProvider } from "./context/ThemeContext";

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
