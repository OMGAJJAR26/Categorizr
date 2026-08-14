import { useMemo, useState, useEffect } from "react";
import { X, Loader2, Network, Send, Search } from "lucide-react";
import {
  getMyNetwork,
  getNetworkMemberUser,
  getNetworkMemberUserId,
  getUserDisplayName,
} from "../../api/networkApi";
import { forwardReceiptToUser } from "../../api/receiptForwardApi";
import { useData } from "../../context/DataContext";

const UserAvatar = ({ name }) => (
  <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
    {(name || "?")[0].toUpperCase()}
  </div>
);

const ForwardReceiptModal = ({ receipt, onClose, onSuccess }) => {
  const { user } = useData();
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [forwardingId, setForwardingId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const result = await getMyNetwork();
      if (cancelled) return;
      if (result.ok) {
        setMembers(result.data);
      } else {
        setError(result.error || "Could not load your network.");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleForward = async (member) => {
    const memberId = getNetworkMemberUserId(
      member,
      user?.id ?? localStorage.getItem("fk_user_id")
    );
    if (!memberId) {
      setError("Could not resolve network member. Please refresh and try again.");
      return;
    }

    setForwardingId(memberId);
    setError("");

    const result = await forwardReceiptToUser(receipt, memberId, user);

    if (result.ok) {
      // Close the modal first; the parent (ReceiptDetail) shows the success toast
      // so we don't show a duplicate green banner here.
      try {
        // Pass memberId (resolved recipient user ID) so the parent can look up the new receipt
        await onSuccess?.(memberId, result.data);
      } finally {
        setForwardingId(null);
        onClose();
      }
      return;
    }

    setError(result.error || "Failed to forward receipt.");
    setForwardingId(null);
  };

  const getMemberUsername = (member) => {
    const u = getNetworkMemberUser(member);
    return (u?.userName || u?.emailAddress || "").trim();
  };

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((member) => {
      const u = getNetworkMemberUser(member);
      const fields = [
        getUserDisplayName(member),
        u?.userName,
        u?.fullName,
        u?.firstName,
        u?.lastName,
        u?.emailAddress,
      ]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase());
      return fields.some((field) => field.includes(q));
    });
  }, [members, search]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Forward Receipt</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Send to someone in your network
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cancel"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pt-4">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              className="w-full bg-white border border-slate-200 text-sm text-slate-900 rounded-xl pl-8 pr-8 py-2.5 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
              placeholder="Search your network…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-4 text-sm px-4 py-2.5 rounded-xl border bg-red-50 text-red-800 border-red-200">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-slate-500 text-sm">
              <Loader2 size={16} className="animate-spin" />
              Loading network…
            </div>
          ) : members.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                <Network size={24} className="text-slate-300" />
              </div>
              <p className="text-sm font-medium text-slate-600">No one in your network yet</p>
              <p className="text-xs text-slate-400">
                Add connections in Settings → My Network first.
              </p>
            </div>
          ) : filteredMembers.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">
              No matching connections.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredMembers.map((member) => {
                const memberKey =
                  getNetworkMemberUserId(
                    member,
                    user?.id ?? localStorage.getItem("fk_user_id")
                  ) ?? member.id;
                return (
                <div
                  key={memberKey}
                  className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-3 py-3"
                >
                  <UserAvatar name={getUserDisplayName(member)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {getUserDisplayName(member)}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      {getMemberUsername(member) || "—"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleForward(member)}
                    disabled={forwardingId === memberKey}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {forwardingId === memberKey ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        Sending…
                      </>
                    ) : (
                      <>
                        <Send size={12} />
                        Forward
                      </>
                    )}
                  </button>
                </div>
              );
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="w-full px-3 py-2.5 bg-gray-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default ForwardReceiptModal;
