import { X, Trash2 } from "lucide-react";

const ChatHeader = ({ onClose, onClearHistory }) => {
  return (
    <div className="w-full bg-blue-600 text-white px-3 py-3 rounded-t-2xl relative">
      <div className="flex items-center justify-between relative">

        {/* Close */}
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center hover:bg-blue-500 rounded-lg transition-colors relative m-0"
          style={{ position: "relative", top: 0, left: 0 }}
        >
          <X
            size={26}
            className="text-white"
            style={{ position: "static" }}
          />
        </button>

        {/* Title */}
        <h2 className="absolute left-1/2 -translate-x-1/2 font-semibold text-lg">
          Receipt Assistant
        </h2>

        {/* Trash */}
        <button
          onClick={onClearHistory}
          className="w-10 h-10 flex items-center justify-center hover:bg-blue-500 rounded-lg transition-colors relative m-0"
          style={{ position: "relative", top: 0, left: 0 }}
        >
          <Trash2 size={22} className="text-white" style={{ position: "static" }} />
        </button>
      </div>
    </div>
  );
};

export default ChatHeader;
