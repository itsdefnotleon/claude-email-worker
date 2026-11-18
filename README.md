# claude-email-worker

A Cloudflare Worker that lets you email Claude a task and get a reply.

## How it works

1. You email `leonclaude@atomicmail.ai`
2. Atomic Mail fires a webhook to this Worker
3. Worker sends the email body to the Claude API
4. Claude's reply is sent back to you via Atomic Mail

## Setup

### 1. Deploy the Worker

```bash
wrangler deploy
```

### 2. Set secrets

```bash
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put ATOMIC_MAIL_TOKEN
wrangler secret put ATOMIC_MAIL_ACCOUNT_ID
wrangler secret put ATOMIC_MAIL_SENT_MAILBOX_ID
wrangler secret put WEBHOOK_SECRET
wrangler secret put ALLOWED_SENDERS  # e.g. leonmehmeti34@gmail.com,itsdefnotleon@proton.me
```

### 3. Set up Atomic Mail webhook

In Atomic Mail dashboard, add a webhook pointing to:
`https://claude-email-worker.<your-subdomain>.workers.dev`

Set the secret header `X-Webhook-Secret` to match your `WEBHOOK_SECRET`.

## Finding your ATOMIC_MAIL_ACCOUNT_ID and SENT_MAILBOX_ID

Call the JMAP session endpoint:
```
GET https://api.atomicmail.ai/jmap/session
Authorization: Bearer <your token>
```

The account ID and mailbox IDs are in the response.
