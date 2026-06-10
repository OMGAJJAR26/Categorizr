const BASE_URL = "/api";

const getToken = () => localStorage.getItem("token");

const authHeaders = () => ({
  "Content-Type": "application/json",
  Accesstoken: getToken(),
});

const isUserRecord = (data) =>
  data &&
  typeof data === "object" &&
  !Array.isArray(data) &&
  "id" in data &&
  ("fullName" in data || "userName" in data || "emailAddress" in data);

const isEmptyResultResponse = (data) =>
  data &&
  typeof data === "object" &&
  !Array.isArray(data) &&
  !isUserRecord(data) &&
  (
    data.code === "001" ||
    /no network found|no pending request|not found|no users? found/i.test(data.message || "")
  );

const isSuccessMessageResponse = (data) =>
  data &&
  typeof data === "object" &&
  !Array.isArray(data) &&
  typeof data.message === "string" &&
  /success|updated|accepted|declined|deleted|removed/i.test(data.message);

const isCountResponse = (data) =>
  data &&
  typeof data === "object" &&
  !Array.isArray(data) &&
  "countPendingRequest" in data;

const isApiErrorBody = (data) =>
  data &&
  typeof data === "object" &&
  !Array.isArray(data) &&
  !isUserRecord(data) &&
  !isCountResponse(data) &&
  ("code" in data || "message" in data) &&
  !isEmptyResultResponse(data) &&
  !isSuccessMessageResponse(data);

const parseApiError = async (res) => {
  try {
    const body = await res.json();
    if (body?.message) return body.message;
    if (body?.fields) return String(body.fields);
    return `Request failed with status ${res.status}`;
  } catch {
    return `Request failed with status ${res.status}`;
  }
};

const apiGet = async (path) => {
  const token = getToken();
  if (!token) return { ok: false, data: null, error: "Missing token" };

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "GET",
      headers: authHeaders(),
    });

    if (!res.ok) {
      return { ok: false, data: null, error: await parseApiError(res) };
    }

    const data = await res.json();
    if (isEmptyResultResponse(data)) {
      return { ok: true, data: [], error: null };
    }
    if (isApiErrorBody(data)) {
      return { ok: false, data: null, error: data.message || "Request failed" };
    }
    return { ok: true, data, error: null };
  } catch (e) {
    return { ok: false, data: null, error: e.message || "Request failed" };
  }
};

const apiPost = async (path, body) => {
  const token = getToken();
  if (!token) return { ok: false, data: null, error: "Missing token" };

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return { ok: false, data: null, error: await parseApiError(res) };
    }

    let data = null;
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (isEmptyResultResponse(data)) {
      return { ok: true, data: [], error: null };
    }
    if (isSuccessMessageResponse(data)) {
      return { ok: true, data, error: null };
    }
    if (isApiErrorBody(data)) {
      return { ok: false, data: null, error: data.message || "Request failed" };
    }
    return { ok: true, data, error: null };
  } catch (e) {
    return { ok: false, data: null, error: e.message || "Request failed" };
  }
};

const apiDelete = async (path) => {
  const token = getToken();
  if (!token) return { ok: false, data: null, error: "Missing token" };

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    if (!res.ok) {
      return { ok: false, data: null, error: await parseApiError(res) };
    }

    let data = null;
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (isEmptyResultResponse(data)) {
      return { ok: true, data: null, error: null };
    }
    if (isSuccessMessageResponse(data) || data === "response ok" || /ok/i.test(String(data))) {
      return { ok: true, data, error: null };
    }
    if (isApiErrorBody(data)) {
      return { ok: false, data: null, error: data.message || "Request failed" };
    }
    return { ok: true, data, error: null };
  } catch (e) {
    return { ok: false, data: null, error: e.message || "Request failed" };
  }
};

const apiPut = async (path) => {
  const token = getToken();
  if (!token) return { ok: false, data: null, error: "Missing token" };

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "PUT",
      headers: authHeaders(),
    });

    if (!res.ok) {
      return { ok: false, data: null, error: await parseApiError(res) };
    }

    let data = null;
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (isEmptyResultResponse(data)) {
      return { ok: true, data: null, error: null };
    }
    if (isSuccessMessageResponse(data)) {
      return { ok: true, data, error: null };
    }
    if (isApiErrorBody(data)) {
      return { ok: false, data: null, error: data.message || "Request failed" };
    }
    return { ok: true, data, error: null };
  } catch (e) {
    return { ok: false, data: null, error: e.message || "Request failed" };
  }
};

const toNetworkSearchItem = (user, networkItem = null) => {
  if (networkItem) {
    const itemUser =
      networkItem.userinfo ||
      networkItem.fk_user_id_2_user ||
      networkItem.fk_user_id_1_user;
    return {
      ...networkItem,
      userinfo: itemUser || user,
    };
  }
  return {
    id: user.id,
    fk_user_id_2: String(user.id),
    userinfo: user,
  };
};

const getItemUserId = (item) => {
  const user =
    item?.userinfo ||
    item?.fk_user_id_2_user ||
    item?.fk_user_id_1_user ||
    item;
  return user?.id != null ? String(user.id) : null;
};

const mergeSearchResults = (networkItems, userItems) => {
  const byId = new Map();

  (Array.isArray(userItems) ? userItems : []).forEach((user) => {
    if (!user?.id) return;
    byId.set(String(user.id), toNetworkSearchItem(user));
  });

  (Array.isArray(networkItems) ? networkItems : []).forEach((item) => {
    const id = getItemUserId(item);
    if (!id) return;
    const existing = byId.get(id);
    byId.set(id, toNetworkSearchItem(existing?.userinfo || item.userinfo || item, item));
  });

  return Array.from(byId.values());
};

const filterBySearchTerm = (items, term) => {
  const q = term.trim().toLowerCase();
  if (!q) return items;

  return items.filter((item) => {
    const user =
      item?.userinfo ||
      item?.fk_user_id_2_user ||
      item?.fk_user_id_1_user ||
      item;
    const fields = [
      user?.userName,
      user?.fullName,
      user?.firstName,
      user?.lastName,
      user?.emailAddress,
      user?.redirectionEmail,
    ]
      .filter(Boolean)
      .map((v) => String(v).toLowerCase());

    return fields.some((field) => field.includes(q) || field.startsWith(q));
  });
};

export const searchUsers = async (term) => {
  const result = await apiGet(
    `/user/searchuser?searchterm=${encodeURIComponent(term)}`
  );
  if (!result.ok) return result;
  const list = Array.isArray(result.data) ? result.data : [];
  return { ok: true, data: list, error: null };
};

export const searchNetwork = async (term) => {
  const result = await apiGet(
    `/usernetwork/searchNetwork?userid=${encodeURIComponent(term)}`
  );
  if (!result.ok) return result;
  const list = Array.isArray(result.data) ? result.data : [];
  return { ok: true, data: list, error: null };
};

/** Search users by name/username prefix — combines searchuser + searchNetwork for status */
export const searchUsersForNetwork = async (term) => {
  const [userRes, networkRes] = await Promise.all([
    searchUsers(term),
    searchNetwork(term),
  ]);

  if (!userRes.ok && !networkRes.ok) {
    return { ok: false, data: [], error: userRes.error || networkRes.error };
  }

  const merged = mergeSearchResults(
    networkRes.ok ? networkRes.data : [],
    userRes.ok ? userRes.data : []
  );

  const filtered = filterBySearchTerm(merged, term);

  return { ok: true, data: filtered, error: null };
};

export const getMyNetwork = async () => {
  const result = await apiGet("/usernetwork/getMyNetwork");
  if (!result.ok) return result;
  const list = Array.isArray(result.data) ? result.data : [];
  return { ok: true, data: list, error: null };
};

export const getPendingRequests = async () => {
  const result = await apiGet("/usernetwork/getPendingRequest");
  if (!result.ok) return result;
  const list = Array.isArray(result.data) ? result.data : [];
  return { ok: true, data: list, error: null };
};

export const getPendingRequestCount = async () => {
  const result = await apiGet("/usernetwork/getPendingRequestCount");
  if (!result.ok) return result;
  const count = Number(result.data?.countPendingRequest) || 0;
  return { ok: true, data: count, error: null };
};

export const deleteNetwork = async (userId) => {
  return apiDelete(
    `/usernetwork/deleteNetwork?userid=${encodeURIComponent(userId)}`
  );
};

export const addUserNetwork = async (payload) => {
  return apiPost("/usernetwork/addUserNetwork", payload);
};

export const updateNetworkStatus = async (networkUserId, status) => {
  return apiPut(
    `/usernetwork/updateNetworkStatus?networkUserId=${encodeURIComponent(networkUserId)}&status=${encodeURIComponent(status)}`
  );
};

export const buildInvitePayload = (currentUser, searchItem) => {
  const targetUser =
    searchItem?.userinfo ||
    searchItem?.fk_user_id_2_user ||
    searchItem?.fk_user_id_1_user ||
    searchItem;

  const targetId = targetUser?.id ?? searchItem?.fk_user_id_2 ?? searchItem?.fk_user_id_1;

  return {
    ...searchItem,
    fk_user_id_1: String(currentUser.id),
    fk_user_id_2: String(targetId),
    status: "sent",
    userinfo: targetUser,
  };
};

export const getNetworkMemberUser = (member) =>
  member?.userinfo ||
  member?.fk_user_id_2_user ||
  member?.fk_user_id_1_user ||
  member;

/** Resolve the connected user's id from a getMyNetwork row or flat user object. */
export const getNetworkMemberUserId = (member, currentUserId) => {
  if (!member) return null;
  const current = currentUserId != null ? String(currentUserId) : "";

  const nested = getNetworkMemberUser(member);
  if (nested?.id != null && String(nested.id) !== current) {
    return String(nested.id);
  }

  const id1 = member.fk_user_id_1 ?? member.fk_user_id_1_user?.id;
  const id2 = member.fk_user_id_2 ?? member.fk_user_id_2_user?.id;
  if (id1 != null && String(id1) !== current) return String(id1);
  if (id2 != null && String(id2) !== current) return String(id2);

  if (member.id != null) return String(member.id);
  if (member.user_id != null) return String(member.user_id);
  return null;
};

export const getUserDisplayName = (user) => {
  const u = getNetworkMemberUser(user);
  return u?.fullName || u?.userName || u?.firstName || u?.emailAddress || "User";
};

export const getUserEmail = (user) => {
  const u = getNetworkMemberUser(user);
  return u?.emailAddress || u?.redirectionEmail || u?.recoveryEmail || "";
};
