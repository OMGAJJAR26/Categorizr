import { motion, AnimatePresence } from "framer-motion";

const LogoutConfirmationDialog = ({ isOpen, onClose, onConfirm }) => {
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
          if (e.target === e.currentTarget) {
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
              Logout
            </h2>
            <p className="text-gray-600">
              Are you sure you want to logout?
            </p>
          </div>

          <div className="flex border-t border-gray-200">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 text-gray-600 font-semibold hover:bg-gray-50 transition-colors border-r border-gray-200"
            >
              No
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-3 text-red-600 font-semibold hover:bg-red-50 transition-colors"
            >
              Yes
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default LogoutConfirmationDialog;
