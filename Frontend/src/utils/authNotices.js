// Messages shown on the login page after the app has had to sign the user out. They are
// handed over through the router (navigate("/login", { state: { notice } })) and shown
// once by <AuthNotice />.
export const NOTICE_SESSION_ENDED = {
  title: "You have been signed out",
  subtitle: "Your session is no longer valid. Please log in again.",
};

export const NOTICE_ACCOUNT_GONE = {
  title: "This account is no longer available",
  subtitle: "It may have been deleted. If you think this is a mistake, please contact Customer Care.",
};

export const NOTICE_ACCOUNT_DELETED = {
  title: "Your account has been deleted",
  subtitle: "Thank you for using Categorizr.",
};

// Pick the notice for a classifyAuthFailure() result.
export const noticeForAuthFailure = (kind) =>
  kind === "gone" ? NOTICE_ACCOUNT_GONE : NOTICE_SESSION_ENDED;
