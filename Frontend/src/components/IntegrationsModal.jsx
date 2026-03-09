import { useState, useEffect } from "react";
import { NODE_API_URL } from "../api/Axios";

const QB_APP_URL = "https://app.qbo.intuit.com/app/homepage";
const SAGE_APP_URL = "https://www.sageone.com/";
const XERO_APP_URL = "https://go.xero.com/";

const providers = [
  {
    id: "quickbooks",
    name: "QuickBooks Online",
    description: "Small business accounting software.",
    connectable: true,
  },
  {
    id: "sage-bc",
    name: "Sage",
    description: "Sage Business Cloud Accounting.",
    connectable: true,
  },
  {
    id: "xero",
    name: "Xero",
    description: "Beautiful accounting software.",
    connectable: true,
  },
  {
    id: "sage-intacct",
    name: "Sage Intacct (admin only)",
    description: "Requires server configuration (env vars).",
    connectable: false,
  },
  {
    id: "freshbooks-classic",
    name: "FreshBooks Classic",
    description: "Accounting made for you.",
    connectable: true,
  },
];

const getConnectUrl = (id) => {
  switch (id) {
    case "quickbooks":
      return `${NODE_API_URL}/api/integrations/quickbooks/connect`;
    case "xero":
      return `${NODE_API_URL}/api/integrations/xero/connect`;
    case "sage-bc":
      // For now, open Sage directly instead of a backend OAuth route
      return SAGE_APP_URL;
    case "freshbooks-classic":
      return `${NODE_API_URL}/api/integrations/freshbooks-classic/connect`;
    default:
      return "#";
  }
};

const IntegrationsModal = ({ open, onClose }) => {
  const [quickbooksConnected, setQuickbooksConnected] = useState(false);
  const [quickbooksRealmId, setQuickbooksRealmId] = useState(null);
  const [quickbooksLoading, setQuickbooksLoading] = useState(false);
  const [xeroConnected, setXeroConnected] = useState(false);
  const [xeroLoading, setXeroLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const fetchQuickBooksStatus = async () => {
      setQuickbooksLoading(true);
      try {
        const res = await fetch(`${NODE_API_URL}/api/integrations/quickbooks/status`);
        const data = await res.json();
        if (data.success && data.connected) {
          setQuickbooksConnected(true);
          setQuickbooksRealmId(data.realmId || null);
        } else {
          setQuickbooksConnected(false);
          setQuickbooksRealmId(null);
        }
      } catch {
        setQuickbooksConnected(false);
        setQuickbooksRealmId(null);
      } finally {
        setQuickbooksLoading(false);
      }
    };
    const fetchXeroStatus = async () => {
      setXeroLoading(true);
      try {
        const res = await fetch(`${NODE_API_URL}/api/integrations/xero/status`);
        const data = await res.json();
        if (data.success && data.connected) {
          setXeroConnected(true);
        } else {
          setXeroConnected(false);
        }
      } catch {
        setXeroConnected(false);
      } finally {
        setXeroLoading(false);
      }
    };
    fetchQuickBooksStatus();
    fetchXeroStatus();
  }, [open]);

  const handleConnect = (provider) => {
    if (!provider.connectable) return;
    const url = getConnectUrl(provider.id);
      if (url && url !== "#") {
      // For OAuth-based integrations (QuickBooks, Xero, FreshBooks), redirect
      // the current tab so that the callback returns to the same Categorizr tab.
      if (url.includes("/api/integrations/")) {
        window.location.href = url;
      } else {
        // For pure external links like Sage UI, keep opening a new tab.
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }
  };

  const handleOpenQuickBooks = () => {
    window.open(QB_APP_URL, "_blank", "noopener,noreferrer");
  };

  const handleOpenXero = () => {
    window.open(XERO_APP_URL, "_blank", "noopener,noreferrer");
  };

  const handleDisconnectQuickBooks = async () => {
    if (!window.confirm("Are you sure you want to disconnect QuickBooks? You can reconnect anytime.")) {
      return;
    }
    
    setQuickbooksLoading(true);
    try {
      const url = quickbooksRealmId
        ? `${NODE_API_URL}/api/integrations/quickbooks/disconnect?realmId=${encodeURIComponent(quickbooksRealmId)}`
        : `${NODE_API_URL}/api/integrations/quickbooks/disconnect`;
      const res = await fetch(url, { method: "DELETE" });
      const data = await res.json();
      
      if (data.success) {
        setQuickbooksConnected(false);
        setQuickbooksRealmId(null);
        // Optionally show a toast notification
      } else {
        alert(data.error || "Failed to disconnect QuickBooks");
      }
    } catch (err) {
      console.error("Disconnect error:", err);
      alert("Failed to disconnect QuickBooks. Please try again.");
    } finally {
      setQuickbooksLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-3xl bg-[#f5f4ef] shadow-xl">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-2 text-2xl leading-none text-gray-600 hover:bg-gray-200 w-auto"
          >
            ‹
          </button>
          <h2 className="text-2xl font-semibold text-slate-900">Integrations</h2>
        </div>

        {/* Section label */}
        <div className="px-4 pb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Business Accounting
          </p>
        </div>

        {/* Providers list */}
        <div className="px-4 pb-5 space-y-2">
          {providers.map((provider) => {
            const isQuickBooks = provider.id === "quickbooks";
            const isXero = provider.id === "xero";
            const isQBConnected = isQuickBooks && quickbooksConnected;
            const isXeroConnected = isXero && xeroConnected;
            const isLoading = (isQuickBooks && quickbooksLoading) || (isXero && xeroLoading);

            return (
              <div
                key={provider.id}
                className="flex flex-col gap-2 rounded-2xl bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <p className="text-sm font-semibold text-slate-900">
                      {provider.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {provider.description}
                    </p>
                  </div>
                  {isLoading ? (
                    <span className="text-xs text-gray-400">Checking...</span>
                  ) : isQBConnected || isXeroConnected ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                      Connected
                    </span>
                  ) : (
                    <span className="text-lg text-gray-400">›</span>
                  )}
                </div>
                {isQuickBooks && quickbooksConnected && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleOpenQuickBooks}
                      className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      Open QuickBooks
                    </button>
                    <button
                      type="button"
                      onClick={handleDisconnectQuickBooks}
                      disabled={quickbooksLoading}
                      className="flex-1 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {quickbooksLoading ? "Disconnecting..." : "Disconnect"}
                    </button>
                  </div>
                )}
                {isXero && xeroConnected && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleOpenXero}
                      className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      Open Xero
                    </button>
                  </div>
                )}
                {!isQBConnected && !isXeroConnected && provider.connectable && (
                  <button
                    type="button"
                    onClick={() => handleConnect(provider)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-gray-50"
                  >
                    Connect
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default IntegrationsModal;