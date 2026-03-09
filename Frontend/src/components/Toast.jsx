import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, XCircle, AlertCircle, X } from "lucide-react";

const Toast = ({ message, type = "success", isVisible, onClose, duration = 3000, actionUrl, actionLabel }) => {
  useEffect(() => {
    if (isVisible && duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  const icons = {
    success: <CheckCircle size={20} className="text-green-500" />,
    error: <XCircle size={20} className="text-red-500" />,
    warning: <AlertCircle size={20} className="text-yellow-500" />,
    info: <AlertCircle size={20} className="text-blue-500" />,
  };

  const bgColors = {
    success: "bg-green-50 border-green-200",
    error: "bg-red-50 border-red-200",
    warning: "bg-yellow-50 border-yellow-200",
    info: "bg-blue-50 border-blue-200",
  };

  const textColors = {
    success: "text-green-800",
    error: "text-red-800",
    warning: "text-yellow-800",
    info: "text-blue-800",
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -50, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          exit={{ opacity: 0, y: -50, x: "-50%" }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className={`fixed top-20 left-1/2 z-[100] flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg ${bgColors[type]}`}
        >
          {icons[type]}
          <div className="flex flex-col gap-1">
            <span className={`font-medium text-sm ${textColors[type]}`}>{message}</span>
            {actionUrl && actionLabel && (
              <a
                href={actionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-xs underline font-semibold ${textColors[type]} hover:opacity-80`}
                onClick={(e) => e.stopPropagation()}
              >
                {actionLabel}
              </a>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-2 p-1 hover:bg-black/5 rounded-full transition-colors"
          >
            <X size={16} className="text-gray-500" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Toast;
