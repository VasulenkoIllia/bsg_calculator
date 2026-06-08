/**
 * Integration tests for TOTP 2FA (Phase 8 Stage 2).
 *
 * Drives the real otplib authenticator to generate valid codes, then
 * exercises the full lifecycle: setup → confirm → two-step login →
 * verify (TOTP + backup code consumption) → trusted-device skip →
 * disable → super-admin force-disable, plus the error paths.
 */

import { describe, expect, it } from "vitest";
import request from "supertest";
import { authenticator } from "otplib";
import { app, createTestUser, loginAsToken } from "./test-helpers";
import { encryptTotpSecret, decryptTotpSecret } from "../shared/totp-crypto";

/** Pull a named cookie's value from a Set-Cookie header. */
function getCookie(
  setCookie: string | string[] | undefined,
  name: string
): string {
  const arr = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const hit = arr.find(c => c.startsWith(`${name}=`));
  return hit ? hit.split(";")[0].slice(name.length + 1) : "";
}

/** Enrol `email` in 2FA; returns the TOTP secret + backup codes. */
async function enable2fa(
  email: string,
  password: string
): Promise<{ token: string; secret: string; backupCodes: string[] }> {
  const token = await loginAsToken(email, password);
  const setup = await request(app)
    .post("/api/v1/auth/me/2fa/setup")
    .set("Authorization", `Bearer ${token}`);
  expect(setup.status).toBe(200);
  const secret: string = setup.body.manualKey;
  const confirm = await request(app)
    .post("/api/v1/auth/me/2fa/confirm")
    .set("Authorization", `Bearer ${token}`)
    .send({ code: authenticator.generate(secret) });
  expect(confirm.status).toBe(200);
  expect(confirm.body.backupCodes).toHaveLength(10);
  return { token, secret, backupCodes: confirm.body.backupCodes };
}

describe("totp-crypto", () => {
  it("encrypt → decrypt round-trips and detects tampering", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const enc = encryptTotpSecret(secret);
    expect(decryptTotpSecret(enc)).toBe(secret);
    // Different nonce each call → different ciphertext.
    expect(encryptTotpSecret(secret)).not.toBe(enc);
    // Tampered tag → throws.
    expect(() => decryptTotpSecret(enc.slice(0, -2) + "00")).toThrow();
  });
});

describe("2FA setup + confirm", () => {
  it("setup returns a QR + manual key; confirm enables + returns backup codes", async () => {
    await createTestUser({ email: "s@bsg.test", password: "correct123" });
    const token = await loginAsToken("s@bsg.test", "correct123");

    const setup = await request(app)
      .post("/api/v1/auth/me/2fa/setup")
      .set("Authorization", `Bearer ${token}`);
    expect(setup.status).toBe(200);
    expect(setup.body.qrCode).toMatch(/^data:image\/png;base64,/);
    expect(setup.body.manualKey).toEqual(expect.any(String));

    const confirm = await request(app)
      .post("/api/v1/auth/me/2fa/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: authenticator.generate(setup.body.manualKey) });
    expect(confirm.status).toBe(200);
    expect(confirm.body.backupCodes).toHaveLength(10);

    const status = await request(app)
      .get("/api/v1/auth/me/2fa")
      .set("Authorization", `Bearer ${token}`);
    expect(status.body).toEqual({ enabled: true, backupCodesRemaining: 10 });
  });

  it("rejects confirm with a wrong code", async () => {
    await createTestUser({ email: "s2@bsg.test", password: "correct123" });
    const token = await loginAsToken("s2@bsg.test", "correct123");
    await request(app)
      .post("/api/v1/auth/me/2fa/setup")
      .set("Authorization", `Bearer ${token}`);
    const confirm = await request(app)
      .post("/api/v1/auth/me/2fa/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: "000000" });
    expect(confirm.status).toBe(400);
  });

  it("requires Bearer auth for setup", async () => {
    const res = await request(app).post("/api/v1/auth/me/2fa/setup");
    expect(res.status).toBe(401);
  });
});

describe("two-step login + verify", () => {
  it("a 2FA user gets twoFactorRequired (no session) then verifies with TOTP", async () => {
    await createTestUser({ email: "v@bsg.test", password: "correct123" });
    const { secret } = await enable2fa("v@bsg.test", "correct123");

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: "v@bsg.test", password: "correct123" });
    expect(login.status).toBe(200);
    expect(login.body.twoFactorRequired).toBe(true);
    expect(login.body.tempToken).toEqual(expect.any(String));
    expect(login.body.accessToken).toBeUndefined();

    const verify = await request(app)
      .post("/api/v1/auth/2fa/verify")
      .send({ tempToken: login.body.tempToken, code: authenticator.generate(secret) });
    expect(verify.status).toBe(200);
    expect(verify.body.accessToken).toEqual(expect.any(String));
    expect(verify.body.user.twoFactorEnabled).toBe(true);
    expect(getCookie(verify.headers["set-cookie"], "bsg_refresh")).not.toBe("");
  });

  it("consumes a backup code exactly once", async () => {
    await createTestUser({ email: "b@bsg.test", password: "correct123" });
    const { backupCodes } = await enable2fa("b@bsg.test", "correct123");
    const code = backupCodes[0];

    const login1 = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: "b@bsg.test", password: "correct123" });
    const verify1 = await request(app)
      .post("/api/v1/auth/2fa/verify")
      .send({ tempToken: login1.body.tempToken, code });
    expect(verify1.status).toBe(200);

    // Same backup code on a fresh login → rejected (already used).
    const login2 = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: "b@bsg.test", password: "correct123" });
    const verify2 = await request(app)
      .post("/api/v1/auth/2fa/verify")
      .send({ tempToken: login2.body.tempToken, code });
    expect(verify2.status).toBe(400);
  });

  it("rejects an invalid temp token + a wrong code", async () => {
    await createTestUser({ email: "v2@bsg.test", password: "correct123" });
    const { secret } = await enable2fa("v2@bsg.test", "correct123");

    const bad = await request(app)
      .post("/api/v1/auth/2fa/verify")
      .send({ tempToken: "not-a-real-token", code: authenticator.generate(secret) });
    expect(bad.status).toBe(401);

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: "v2@bsg.test", password: "correct123" });
    const wrong = await request(app)
      .post("/api/v1/auth/2fa/verify")
      .send({ tempToken: login.body.tempToken, code: "000000" });
    expect(wrong.status).toBe(400);
  });

  it("trust-device skips the 2FA prompt on the next login", async () => {
    await createTestUser({ email: "t@bsg.test", password: "correct123" });
    const { secret } = await enable2fa("t@bsg.test", "correct123");

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: "t@bsg.test", password: "correct123" });
    const verify = await request(app)
      .post("/api/v1/auth/2fa/verify")
      .send({
        tempToken: login.body.tempToken,
        code: authenticator.generate(secret),
        trustDevice: true
      });
    const tdCookie = getCookie(verify.headers["set-cookie"], "bsg_td");
    expect(tdCookie).not.toBe("");

    // Next login carrying the trusted-device cookie → full session, no 2FA.
    const trustedLogin = await request(app)
      .post("/api/v1/auth/login")
      .set("Cookie", `bsg_td=${tdCookie}`)
      .send({ identifier: "t@bsg.test", password: "correct123" });
    expect(trustedLogin.status).toBe(200);
    expect(trustedLogin.body.twoFactorRequired).toBeUndefined();
    expect(trustedLogin.body.accessToken).toEqual(expect.any(String));
  });
});

describe("disable + force-disable", () => {
  it("disables with re-auth (password + code)", async () => {
    await createTestUser({ email: "d@bsg.test", password: "correct123" });
    const { token, secret } = await enable2fa("d@bsg.test", "correct123");

    const disable = await request(app)
      .post("/api/v1/auth/me/2fa/disable")
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "correct123", code: authenticator.generate(secret) });
    expect(disable.status).toBe(204);

    // Login no longer challenges.
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: "d@bsg.test", password: "correct123" });
    expect(login.body.twoFactorRequired).toBeUndefined();
    expect(login.body.accessToken).toEqual(expect.any(String));
  });

  it("rejects disable with a wrong password", async () => {
    await createTestUser({ email: "d2@bsg.test", password: "correct123" });
    const { token, secret } = await enable2fa("d2@bsg.test", "correct123");
    const res = await request(app)
      .post("/api/v1/auth/me/2fa/disable")
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "WRONG", code: authenticator.generate(secret) });
    expect(res.status).toBe(401);
  });

  it("super-admin force-disables another user's 2FA; plain user is forbidden", async () => {
    const target = await createTestUser({ email: "tgt@bsg.test", password: "correct123" });
    await enable2fa("tgt@bsg.test", "correct123");
    await createTestUser({
      email: "super@bsg.test",
      password: "superpass123",
      role: "super_admin"
    });
    await createTestUser({ email: "plain@bsg.test", password: "plainpass123", role: "user" });

    const superToken = await loginAsToken("super@bsg.test", "superpass123");
    const plainToken = await loginAsToken("plain@bsg.test", "plainpass123");

    const forbidden = await request(app)
      .post(`/api/v1/users/${target.id}/2fa/disable`)
      .set("Authorization", `Bearer ${plainToken}`);
    expect(forbidden.status).toBe(403);

    const ok = await request(app)
      .post(`/api/v1/users/${target.id}/2fa/disable`)
      .set("Authorization", `Bearer ${superToken}`);
    expect(ok.status).toBe(200);
    expect(ok.body.twoFactorEnabled).toBe(false);

    // Target now logs in without a 2FA challenge.
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: "tgt@bsg.test", password: "correct123" });
    expect(login.body.twoFactorRequired).toBeUndefined();
  });
});
