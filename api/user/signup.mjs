import { handleAuthRequest } from "../../Frontend/api/_lib/forwardAuth.js";

export default function handler(req, res) {
  return handleAuthRequest(req, res, "/api/user/signup");
}