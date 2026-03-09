import { motion } from "framer-motion";
import {
  DollarSign,
  PieChart,
  CreditCard,
  TrendingUp,
} from "lucide-react";

/**
 * Quick suggestion chips component
 * Displays common queries users can click to quickly ask
 */
const ChatSuggestions = ({ onSuggestionClick, visible = true }) => {
  const suggestions = [
    {
      text: "How much did I spend this month?",
      icon: DollarSign,
      color: "bg-green-50 text-green-700 hover:bg-green-100",
    },
    {
      text: "Show spending by category",
      icon: PieChart,
      color: "bg-purple-50 text-purple-700 hover:bg-purple-100",
    },
    {
      text: "Which payment method do I use most?",
      icon: CreditCard,
      color: "bg-blue-50 text-blue-700 hover:bg-blue-100",
    },
    {
      text: "What's my average transaction?",
      icon: TrendingUp,
      color: "bg-orange-50 text-orange-700 hover:bg-orange-100",
    },
  ];

  if (!visible) return null;

  return (
    <div className="flex-shrink-0 px-4 py-3 bg-gray-50">
      <p className="text-xs text-gray-500 mb-3 text-center font-medium">
        Quick questions
      </p>
      <div className="grid grid-cols-2 gap-2">
        {suggestions.map((suggestion, index) => {
          const Icon = suggestion.icon;
          return (
            <motion.button
              key={index}
              onClick={() => onSuggestionClick(suggestion.text)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors shadow-sm ${suggestion.color}`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Icon size={14} className="flex-shrink-0" />
              <span className="text-left line-clamp-2">{suggestion.text}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default ChatSuggestions;
