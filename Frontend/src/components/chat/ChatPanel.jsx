import { motion, AnimatePresence } from "framer-motion";
import ChatHeader from "./ChatHeader";
import ChatMessages from "./ChatMessages";
import ChatInput from "./ChatInput";
import ChatSuggestions from "./ChatSuggestions";

/**
 * Main chat panel container
 * Slides in from the right side
 */
const ChatPanel = ({
  isOpen,
  onClose,
  messages,
  isLoading,
  onSendMessage,
  onClearHistory,
  onReceiptClick,
}) => {
  const handleSuggestionClick = (suggestion) => {
    onSendMessage(suggestion);
  };

  // Show suggestions only when there are no messages
  const showSuggestions = messages.length === 0 && !isLoading;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop - closes chat when clicked (works on both mobile and desktop) */}
          <motion.div
            className="fixed inset-0 bg-black/20 z-[55]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Chat panel */}
          <motion.div
            className="fixed bottom-0 right-0 w-full md:w-[400px] h-[80vh] md:h-[600px] max-h-[700px] bg-white rounded-t-2xl md:rounded-2xl shadow-2xl z-[60] md:bottom-24 md:right-6 flex flex-col overflow-hidden border border-gray-200"
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{
              type: "spring",
              damping: 25,
              stiffness: 300,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex-shrink-0 rounded-t-2xl overflow-hidden">
              <ChatHeader onClose={onClose} onClearHistory={onClearHistory} />
            </div>

            {/* Messages area - scrollable */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              <ChatMessages
                messages={messages}
                isLoading={isLoading}
                onReceiptClick={onReceiptClick}
              />
            </div>

            {/* Suggestions (only when empty) */}
            {showSuggestions && (
              <div className="flex-shrink-0">
                <ChatSuggestions
                  visible={showSuggestions}
                  onSuggestionClick={handleSuggestionClick}
                />
              </div>
            )}

            {/* Input */}
            <div className="flex-shrink-0">
              <ChatInput onSend={onSendMessage} isLoading={isLoading} />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ChatPanel;
