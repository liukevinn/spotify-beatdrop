import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireUser } from "@/lib/auth/requireUser";
import { hashToken } from "@/lib/crypto";

vi.mock("@/lib/auth/session", () => ({ getSessionUserId: vi.fn() }));
vi.mock("@/lib/db/tokens", () => ({ touchActiveToken: vi.fn() }));
vi.mock("@/lib/db/users", () => ({ getUserById: vi.fn() }));

const session = await import("@/lib/auth/session");
const tokens = await import("@/lib/db/tokens");
const users = await import("@/lib/db/users");

const VALID = "valid-token";
const user = (id: string, needsReauth = false) => ({
  id,
  spotify_user_id: `s-${id}`,
  display_name: `User ${id}`,
  refresh_token_enc: "x",
  access_token: null,
  access_token_expires_at: null,
  needs_reauth: needsReauth,
});

function req(bearer?: string) {
  return new Request("http://127.0.0.1:3000/api/x", {
    method: "POST",
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(session.getSessionUserId).mockResolvedValue(null);
  // Only the valid token's hash resolves; revoked tokens are filtered out by the query.
  vi.mocked(tokens.touchActiveToken).mockImplementation(async (hash) =>
    hash === hashToken(VALID) ? { userId: "bearer-user" } : null,
  );
  vi.mocked(users.getUserById).mockImplementation(async (id) => user(id));
});

describe("requireUser", () => {
  it("accepts a valid bearer token on allowed routes", async () => {
    await expect(requireUser(req(VALID), { allowBearer: true })).resolves.toMatchObject({
      userId: "bearer-user",
      source: "bearer",
    });
    expect(tokens.touchActiveToken).toHaveBeenCalledWith(hashToken(VALID));
  });

  it("ignores bearer tokens on cookie-only routes", async () => {
    await expect(requireUser(req(VALID))).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
    expect(tokens.touchActiveToken).not.toHaveBeenCalled();
  });

  it("rejects revoked or unknown tokens without falling back to the cookie", async () => {
    vi.mocked(session.getSessionUserId).mockResolvedValue("cookie-user");
    await expect(requireUser(req("revoked-token"), { allowBearer: true })).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("falls back to the session cookie", async () => {
    vi.mocked(session.getSessionUserId).mockResolvedValue("cookie-user");
    await expect(requireUser(req(), { allowBearer: true })).resolves.toMatchObject({
      userId: "cookie-user",
      source: "cookie",
    });
  });

  it("returns 401 with neither", async () => {
    await expect(requireUser(req())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects users who need to re-auth unless allowed", async () => {
    vi.mocked(session.getSessionUserId).mockResolvedValue("stale");
    vi.mocked(users.getUserById).mockResolvedValue(user("stale", true));
    await expect(requireUser(req())).rejects.toMatchObject({
      code: "REAUTH_REQUIRED",
      message: "Log in to DropSet again.",
    });
    await expect(requireUser(req(), { allowNeedsReauth: true })).resolves.toMatchObject({ needsReauth: true });
  });
});
