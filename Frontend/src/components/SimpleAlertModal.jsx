/**
 * SimpleAlertModal
 * Drop-in replacement for browser alert().
 * Usage:
 *   const [alertMsg, setAlertMsg] = useState(null);
 *   setAlertMsg("Your message here");   // ← replaces alert("…")
 *   {alertMsg && <SimpleAlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
 */
const SimpleAlertModal = ({ message, title, onClose }) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs mx-auto p-6 text-center">
      <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
        {/* Inline info-circle SVG — no extra import needed */}
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="text-amber-500">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      {title && <h3 className="text-base font-bold text-slate-900 mb-2">{title}</h3>}
      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{message}</p>
      <button
        onClick={onClose}
        className="mt-5 w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition-colors"
      >
        OK
      </button>
    </div>
  </div>
);

export default SimpleAlertModal;
