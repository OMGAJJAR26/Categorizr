import { useState, useEffect, useCallback } from "react";
import { Search, X, Network, Loader2, UserMinus } from "lucide-react";
import {
  searchUsersForNetwork,
  getMyNetwork,
  getPendingRequests,
  getPendingRequestCount,
  addUserNetwork,
  updateNetworkStatus,
  deleteNetwork,
  buildInvitePayload,
  getUserDisplayName,
  getUserEmail,
} from "../../api/networkApi";

const NETWORK_STATUS = {
  NO_REQUEST: 0,
  PENDING: 1,
  SENT: 2,
  IN_NETWORK: 3,
};

const SUCCESS_MSG = "User network updated successfully";

const UserAvatar = ({ name }) => {
  const initial = (name || "?")[0].toUpperCase();
  return (
    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
      {initial}
    </div>
  );
};

const SectionHeader = ({ title, count, badgeVariant = "default" }) => (
  <div className="flex items-center justify-between mb-3">
    <h3 className="text-xs uppercase tracking-[0.12em] text-slate-500 font-semibold">
      {title}
    </h3>
    {count > 0 && (
      <span
        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
          badgeVariant === "alert"
            ? "bg-red-500 text-white border-red-500 min-w-[20px] text-center"
            : "bg-slate-100 text-slate-600 border-slate-200"
        }`}
      >
        {count}
      </span>
    )}
  </div>
);

const NetworkUserRow = ({ user, action, subtitle }) => (
  <div className="flex items-center gap-3 bg-white border border-slate-200/80 rounded-xl px-3 py-3 hover:bg-slate-50">
    <UserAvatar name={getUserDisplayName(user)} />
    <div className="flex-1 min-w-0">
      <p className="text-sm font-semibold text-slate-900 truncate">
        {getUserDisplayName(user)}
      </p>
      <p className="text-xs text-slate-400 truncate">
        {subtitle || getUserEmail(user) || getUserDisplayName(user) || "—"}
      </p>
    </div>
    {action && <div className="flex-shrink-0">{action}</div>}
  </div>
);

const getSearchItemUser = (item) =>
  item?.userinfo ||
  item?.fk_user_id_2_user ||
  item?.fk_user_id_1_user ||
  item;

const getSearchItemStatus = (item) => {
  const user = getSearchItemUser(item);
  return user?.networkRequestStatus ?? NETWORK_STATUS.NO_REQUEST;
};

const getSuccessMessage = (data, fallback) => {
  if (data && typeof data === "object" && data.message) return data.message;
  return fallback;
};

const SearchAction = ({ status, loading, onInvite }) => {
  if (status === NETWORK_STATUS.IN_NETWORK) {
    return (
      <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
        Connected
      </span>
    );
  }
  if (status === NETWORK_STATUS.SENT) {
    return (
      <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
        Request Sent
      </span>
    );
  }
  if (status === NETWORK_STATUS.PENDING) {
    return (
      <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
        Pending
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onInvite}
      disabled={loading}
      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? "Sending…" : "Invite Network"}
    </button>
  );
};

const MyNetworkPanel = ({ user, onPendingCountChange }) => {
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [myNetwork, setMyNetwork] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loadingNetwork, setLoadingNetwork] = useState(true);
  const [loadingPending, setLoadingPending] = useState(true);
  const [searching, setSearching] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [message, setMessage] = useState(null);

  const currentUserId = user?.id;

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3500);
  };

  const syncPendingCount = useCallback(
    async (listLength) => {
      const countRes = await getPendingRequestCount();
      const count = countRes.ok ? countRes.data : listLength ?? 0;
      setPendingCount(count);
      onPendingCountChange?.(count);
      return count;
    },
    [onPendingCountChange]
  );

  const refreshLists = useCallback(async () => {
    setLoadingNetwork(true);
    setLoadingPending(true);

    const [networkRes, pendingRes, countRes] = await Promise.all([
      getMyNetwork(),
      getPendingRequests(),
      getPendingRequestCount(),
    ]);

    if (networkRes.ok) {
      setMyNetwork(networkRes.data);
    } else if (networkRes.error) {
      showMessage("error", networkRes.error);
    }

    if (pendingRes.ok) {
      setPendingRequests(pendingRes.data);
    } else if (pendingRes.error) {
      showMessage("error", pendingRes.error);
    }

    const count = countRes.ok
      ? countRes.data
      : pendingRes.ok
        ? pendingRes.data.length
        : 0;
    setPendingCount(count);
    onPendingCountChange?.(count);

    setLoadingNetwork(false);
    setLoadingPending(false);
  }, [onPendingCountChange]);

  useEffect(() => {
    refreshLists();
  }, [refreshLists]);

  useEffect(() => {
    const term = search.trim();
    if (term.length < 1) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timer = setTimeout(async () => {
      const result = await searchUsersForNetwork(term);
      if (result.ok) {
        const filtered = result.data.filter((item) => {
          const itemUser = getSearchItemUser(item);
          return String(itemUser?.id) !== String(currentUserId);
        });
        setSearchResults(filtered);
      } else {
        setSearchResults([]);
        if (result.error && !/no network found|not found/i.test(result.error)) {
          showMessage("error", result.error);
        }
      }
      setSearching(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [search, currentUserId]);

  const handleInvite = async (item) => {
    if (!user?.id) {
      showMessage("error", "Please log in again.");
      return;
    }

    const itemUser = getSearchItemUser(item);
    const loadingKey = `invite-${itemUser?.id}`;
    setActionLoadingId(loadingKey);

    const payload = buildInvitePayload(user, item);
    const result = await addUserNetwork(payload);

    if (result.ok) {
      showMessage("success", getSuccessMessage(result.data, "Network invite sent."));
      setSearchResults((prev) =>
        prev.map((row) => {
          const rowUser = getSearchItemUser(row);
          if (String(rowUser?.id) !== String(itemUser?.id)) return row;
          const updatedUser = { ...rowUser, networkRequestStatus: NETWORK_STATUS.SENT };
          return {
            ...row,
            userinfo: row.userinfo ? updatedUser : row.userinfo,
            fk_user_id_2_user: row.fk_user_id_2_user ? updatedUser : row.fk_user_id_2_user,
            fk_user_id_1_user: row.fk_user_id_1_user ? updatedUser : row.fk_user_id_1_user,
          };
        })
      );
      await refreshLists();
    } else {
      showMessage("error", result.error || "Failed to send invite.");
    }

    setActionLoadingId(null);
  };

  const handleResponse = async (sender, status) => {
    if (!user?.id) {
      showMessage("error", "Please log in again.");
      return;
    }

    const loadingKey = `response-${sender.id}-${status}`;
    setActionLoadingId(loadingKey);

    const result = await updateNetworkStatus(sender.id, status);

    if (result.ok) {
      const successText = getSuccessMessage(result.data, SUCCESS_MSG);
      showMessage("success", successText);

      if (status === "Accepted") {
        setPendingRequests((prev) => prev.filter((p) => p.id !== sender.id));
        setMyNetwork((prev) => {
          if (prev.some((m) => m.id === sender.id)) return prev;
          return [...prev, { ...sender, networkRequestStatus: NETWORK_STATUS.IN_NETWORK }];
        });
      } else {
        setPendingRequests((prev) => prev.filter((p) => p.id !== sender.id));
      }

      await syncPendingCount();
      await refreshLists();
    } else {
      showMessage("error", result.error || "Action failed.");
    }

    setActionLoadingId(null);
  };

  const handleRemove = async (member) => {
    if (!member?.id) return;

    const loadingKey = `remove-${member.id}`;
    setActionLoadingId(loadingKey);

    const result = await deleteNetwork(member.id);

    if (result.ok) {
      showMessage("success", getSuccessMessage(result.data, SUCCESS_MSG));
      setMyNetwork((prev) => prev.filter((m) => m.id !== member.id));
      await refreshLists();
    } else {
      showMessage("error", result.error || "Failed to remove from network.");
    }

    setActionLoadingId(null);
  };

  const hasActiveSearch = search.trim().length >= 1;
  const displayPendingCount = pendingCount > 0 ? pendingCount : pendingRequests.length;

  return (
    <div className="max-w-lg flex flex-col gap-6">
      {message && (
        <div
          className={`text-sm px-4 py-2.5 rounded-xl border ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-red-50 text-red-800 border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Search */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            className="w-full bg-white border border-slate-200 text-sm text-slate-900 rounded-xl pl-8 pr-8 py-2.5 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 shadow-sm"
            placeholder="Search by name or email…"
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

        {hasActiveSearch && (
          <div className="flex flex-col gap-2">
            {searching ? (
              <div className="flex items-center gap-2 text-sm text-slate-500 py-4 justify-center">
                <Loader2 size={14} className="animate-spin" />
                Searching…
              </div>
            ) : searchResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center bg-slate-50 border border-slate-200 rounded-2xl">
                <p className="text-sm font-medium text-slate-600">No users found.</p>
                <p className="text-xs text-slate-400">Try a different name or email.</p>
              </div>
            ) : (
              searchResults.map((item) => {
                const itemUser = getSearchItemUser(item);
                const status = getSearchItemStatus(item);
                const key = item.id ?? itemUser?.id ?? getUserDisplayName(itemUser);
                return (
                  <NetworkUserRow
                    key={key}
                    user={itemUser}
                    action={
                      <SearchAction
                        status={status}
                        loading={actionLoadingId === `invite-${itemUser?.id}`}
                        onInvite={() => handleInvite(item)}
                      />
                    }
                  />
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Pending Requests */}
      <div>
        <SectionHeader
          title="Pending Requests"
          count={displayPendingCount}
          badgeVariant="alert"
        />
        {loadingPending ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
            <Loader2 size={14} className="animate-spin" />
            Loading…
          </div>
        ) : pendingRequests.length === 0 ? (
          <div className="text-sm text-slate-400 py-3 px-1">No pending requests.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {pendingRequests.map((sender) => (
              <NetworkUserRow
                key={sender.id}
                user={sender}
                action={
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleResponse(sender, "Accepted")}
                      disabled={actionLoadingId === `response-${sender.id}-Accepted`}
                      className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResponse(sender, "Declined")}
                      disabled={actionLoadingId === `response-${sender.id}-Declined`}
                      className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* My Network */}
      <div>
        <SectionHeader title="My Network" count={myNetwork.length} />
        {loadingNetwork ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
            <Loader2 size={14} className="animate-spin" />
            Loading…
          </div>
        ) : myNetwork.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center bg-slate-50 border border-slate-200 rounded-2xl">
            <div className="w-14 h-14 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm">
              <Network size={24} className="text-slate-300" />
            </div>
            <p className="text-sm font-medium text-slate-600">
              You don&apos;t have anyone in your network yet
            </p>
            <p className="text-xs text-slate-400">Search above to invite people.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {myNetwork.map((member) => (
              <NetworkUserRow
                key={member.id}
                user={member}
                action={
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Connected
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemove(member)}
                      disabled={actionLoadingId === `remove-${member.id}`}
                      title="Remove from network"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <UserMinus size={14} />
                    </button>
                  </div>
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyNetworkPanel;
