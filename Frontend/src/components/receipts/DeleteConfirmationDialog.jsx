import { motion, AnimatePresence } from "framer-motion";

const DeleteConfirmationDialog = ({ isOpen, onClose, onConfirm, isDeleting }) => {
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
          if (e.target === e.currentTarget && !isDeleting) {
            onClose();
          }
        }}
      >
        <motion.div
          variants={modalVariants}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Content */}
          <div className="p-6 text-center">
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Confirmation
            </h2>
            <p className="text-gray-600 mb-1">
              Are you sure you want to delete this Receipt?
            </p>
            <p className="text-gray-500 text-sm">
              This action is irreversible.
            </p>
          </div>

          {/* Footer */}
          <div className="flex border-t border-gray-200">
            <button
              onClick={onClose}
              disabled={isDeleting}
              className="flex-1 px-4 py-3 text-blue-600 font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50 border-r border-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isDeleting}
              className="flex-1 px-4 py-3 text-blue-600 font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default DeleteConfirmationDialog;
