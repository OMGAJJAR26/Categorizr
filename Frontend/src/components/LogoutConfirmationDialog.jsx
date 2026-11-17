import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";

const LogoutConfirmationDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title = "Logout",
  message = "Are you sure you want to logout?",
  cancelLabel = "No",
  confirmLabel = "Yes",
  // The default confirm button is red (logging out is destructive); pass false for a
  // neutral blue button.
  danger = true,
  // While `loading` the popup stays up with a spinner on the confirm button and nothing
  // in it can be pressed (used while the browser is leaving for another site).
  loading = false,
  loadingLabel = "Please wait…",
}) => {
  if (!isOpen) return null;

  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.2 } },
  };

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: { duration: 0.2, ease: "easeOut" },
    },
  };

  return (
    <AnimatePresence>
      <motion.div
        initial="hidden"
        animate="visible"
        exit="hidden"
        variants={backdropVariants}
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget && !loading) {
            onClose();
          }
        }}
      >
        <motion.div
          variants={modalVariants}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6 text-center">
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              {title}
            </h2>
            <p className="text-gray-600">
              {message}
            </p>
          </div>

          <div className="flex border-t border-gray-200">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-3 text-gray-600 font-semibold hover:bg-gray-50 transition-colors border-r border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              aria-busy={loading}
              className={`flex-1 px-4 py-3 font-semibold transition-colors disabled:cursor-wait ${
                danger
                  ? "text-red-600 hover:bg-red-50"
                  : "text-blue-600 hover:bg-blue-50"
              }`}
            >
              {loading ? (
                <span role="status" className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  {loadingLabel}
                </span>
              ) : (
                confirmLabel
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default LogoutConfirmationDialog;
