# AGENT.md - ReturnGate

Antigravity project config. Read this file first, then RULES.md, then PRD.md, then phases.json.

## One-liner
ReturnGate is a merchant-controlled, pre-label "keep it" partial refund workflow with AI-assisted evidence triage, built on PayPal Orders v2 and Payments v2 (sandbox) for the PayPal AI Hackathon (deadline Nov 12, 12:00 PT).

It is NOT an AI refund agent, a dispute tool, or a fraud detector. Do not describe it that way in code comments, UI copy, README or the video script.

## Stack (approved, do not swap without asking)
- Next.js 15 App Router, TypeScript (strict), Tailwind, shadcn/ui
- PayPal: direct REST calls with fetch, typed in src/lib/paypal. No PayPal SDK.
- DB: Neon Postgres + Prisma
- Money: integer cents only, plain TypeScript. No floats, no AI-computed amounts.
- Vision: Gemini Flash, structured JSON output, validated with Zod. Model string comes from GEMINI_MODEL env var. [NEEDS INPUT: confirm current Flash model string in console]
- Tests: Vitest
- Hosting: Render web service + Neon. Public webhook URL is required.
- No auth library. Judges get signed-cookie session workspaces.
- No MCP servers, no connectors.

## Repo layout
```
src/app/(buyer)/case/[id]/        buyer flow: nonce, photo, offer
src/app/(merchant)/policy/        merchant policy form
src/app/(merchant)/queue/         manual review queue
src/app/(merchant)/ledger/        refunds + webhook ledger
src/app/api/paypal/               create-order, capture, refund
src/app/api/webhooks/paypal/route.ts   raw body, Node runtime
src/lib/paypal/                   client, orders, refunds, webhooks
src/lib/engine/                   offer.ts, units.ts, nonce.ts (deterministic)
src/lib/vision/                   gemini.ts, schema.ts, guards.ts, cache.ts
src/lib/limits.ts                 per-IP and global caps (Postgres)
prisma/schema.prisma
tests/                            vitest suites
eval/                             adversarial images + expected.json
scripts/spike.ts                  sandbox spike (gate 1)
```

## Commands
```
pnpm dev
pnpm test
pnpm spike            # order -> capture -> partial refund -> webhook check
pnpm eval:vision      # runs eval/ set, prints pass/fail table
pnpm prisma migrate dev
```

## Model policy
- Default: Gemini Flash.
- Escalate to Claude Sonnet on a failure loop (two failed attempts).
- Opus only for: offer engine, webhook signature verification, idempotency logic.

## Workflow (Antigravity-first)
1. One phase per chat. One task prompt at a time from phases.json.
2. After each task: run tests, then screenshot-verify the real running app.
3. Never trust the agent walkthrough ("build passes" is not "feature works"). Verify the critical step yourself.
4. Do not start the next task until the current acceptance check passes.
5. Unknown value or missing input: write [NEEDS INPUT: ...] and stop. Do not guess.

## Gates (IST)
- Gate 1, Oct 24 18:00: real sandbox order -> capture -> partial refund -> one verified signed webhook.
- Gate 2, Oct 29 18:00: vision eval passes (zero unsafe auto-offers) and 3 real sellers tested.
- Gate 3, Nov 6 18:00: cold tester completes the hosted flow in under 90 seconds.
- Gate 4, Nov 11 20:00: submitted (repo, video under 3:00, live demo).
If Gate 1 fails, stop and choose the fallback with the owner. Do not preselect one.
