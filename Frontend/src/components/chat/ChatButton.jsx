import { motion } from "framer-motion";
import { MessageCircle } from "lucide-react";

/**
 * Floating chat button component
 * Displays in the bottom-right corner of the screen
 */
const ChatButton = ({ onClick, hasUnread = false }) => {
  return (
    <motion.button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-40 flex items-center justify-center w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 hover:shadow-xl transition-all duration-200"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      aria-label="Open chat assistant"
    >
      <MessageCircle size={24} />

      {/* Unread indicator */}
      {hasUnread && (
        <motion.span
          className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      )}

      {/* Pulse animation ring */}
      <motion.span
        className="absolute inset-0 rounded-full bg-blue-600"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.5, 0, 0.5],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          repeatType: "loop",
        }}
      />
    </motion.button>
  );
};

export default ChatButton;
