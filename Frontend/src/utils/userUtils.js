/** Unwrap getuserdetails / login responses that may be nested. */
export const normalizeUserResponse = (data) => {
  if (!data || typeof data !== "object") return null;
  if (data.user && typeof data.user === "object") return data.user;
  if (data.data && typeof data.data === "object" && !Array.isArray(data.data)) return data.data;
  return data;
};

/** True when recovery email OTP has been verified (matches PHP API: is_recovery_email_verified). */
export const isRecoveryEmailVerified = (user) => {
  if (!user) return false;
  const raw =
    user.isRecoveryEmailVerified ??
    user.is_recovery_email_verified ??
    user.recoveryEmailVerified ??
    user.recovery_email_verified;

  if (raw === true || raw === 1 || raw === "1") return true;
  if (typeof raw === "string" && raw.toLowerCase() === "yes") return true;
  return false;
};
