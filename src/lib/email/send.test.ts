import { afterEach, describe, expect, test, vi } from "vitest";

import { mailboxMessages } from "./mailbox";
import { sendEmail } from "./send";
import { otpEmail } from "./templates";

const email = { to: "Ana@Example.com", ...otpEmail("042917") };

describe(sendEmail, () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("without a Resend key, the e2e build keeps mail in the mailbox for its recipient", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_MAILBOX", "1");

    const { id } = await sendEmail(email);

    expect(mailboxMessages("ana@example.com")[0]).toMatchObject({
      id,
      subject: "042917 es tu código para entrar a OWU",
    });
  });

  test("with neither a key nor the mailbox it fails instead of dropping the email", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_MAILBOX", "");

    await expect(sendEmail(email)).rejects.toThrow("RESEND_API_KEY is not set");
  });

  test("with a key it posts to Resend, idempotently", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ id: "resend-id" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendEmail(email, "otp:1")).resolves.toStrictEqual({ id: "resend-id" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer re_test", "Idempotency-Key": "otp:1" }),
        body: expect.stringContaining('"to":["Ana@Example.com"]'),
      })
    );
  });

  test("a Resend error fails the send", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubGlobal("fetch", async () => new Response("rate limited", { status: 429 }));

    await expect(sendEmail(email)).rejects.toThrow("Resend answered 429");
  });
});

describe(otpEmail, () => {
  test("escapes what it prints", () => {
    expect(otpEmail("<b>1</b>").html).toContain("&lt;b&gt;1&lt;/b&gt;");
  });
});
