export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Verify webhook secret
    const secret = request.headers.get("X-Webhook-Secret");
    if (env.WEBHOOK_SECRET && secret !== env.WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    // Extract email fields from Atomic Mail webhook payload
    const from = payload.from?.email || payload.from || "unknown";
    const subject = payload.subject || "(no subject)";
    const body = payload.text || payload.body || payload.html || "";

    // Only process emails from Leon
    const allowedSenders = (env.ALLOWED_SENDERS || "").split(",").map(s => s.trim().toLowerCase());
    if (allowedSenders.length > 0 && !allowedSenders.includes(from.toLowerCase())) {
      return new Response("Sender not allowed", { status: 403 });
    }

    // Call Claude API
    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: `You are Claude, an AI assistant accessible via email. The user emails you tasks and you complete them and reply. Keep replies concise and useful. You are receiving an email from Leon (itsdefnotleon), who runs multiple internet radio stations. Sign your replies as "Claude".`,
        messages: [
          {
            role: "user",
            content: `Subject: ${subject}\n\n${body}`,
          },
        ],
      }),
    });

    if (!claudeResponse.ok) {
      const err = await claudeResponse.text();
      console.error("Claude API error:", err);
      return new Response("Claude API error", { status: 500 });
    }

    const claudeData = await claudeResponse.json();
    const replyText = claudeData.content?.[0]?.text || "Sorry, I couldn't generate a response.";

    // Send reply via Atomic Mail JMAP API
    const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;

    const jmapResponse = await fetch("https://api.atomicmail.ai/jmap", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.ATOMIC_MAIL_TOKEN}`,
      },
      body: JSON.stringify({
        using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail", "urn:ietf:params:jmap:submission"],
        methodCalls: [
          ["Email/set", {
            accountId: env.ATOMIC_MAIL_ACCOUNT_ID,
            create: {
              reply1: {
                mailboxIds: { [env.ATOMIC_MAIL_SENT_MAILBOX_ID]: true },
                from: [{ name: "Claude", email: env.ATOMIC_MAIL_EMAIL }],
                to: [{ email: from }],
                subject: replySubject,
                bodyValues: { body: { value: replyText, charset: "utf-8" } },
                textBody: [{ partId: "body", type: "text/plain" }],
              },
            },
          }, "c0"],
          ["EmailSubmission/set", {
            accountId: env.ATOMIC_MAIL_ACCOUNT_ID,
            create: {
              sub1: {
                emailId: "#reply1",
                envelope: {
                  mailFrom: { email: env.ATOMIC_MAIL_EMAIL },
                  rcptTo: [{ email: from }],
                },
              },
            },
          }, "c1"],
        ],
      }),
    });

    if (!jmapResponse.ok) {
      console.error("Atomic Mail error:", await jmapResponse.text());
      return new Response("Mail send error", { status: 500 });
    }

    return new Response("OK", { status: 200 });
  },
};
