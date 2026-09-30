import { handleAuthRequest } from "../_lib/forwardAuth.js";

export default function handler(req, res) {
  return handleAuthRequest(req, res, "/api/user/login");
}
