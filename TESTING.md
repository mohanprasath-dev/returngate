# ReturnGate 90-Second Cold-Tester Walkthrough

Welcome to ReturnGate. This guide is written for a judge or first-time tester to evaluate the live demo in under 90 seconds.

ReturnGate is a merchant-controlled keep-it partial refund engine built on PayPal Orders v2 and Payments v2. It allows sellers to pre-approve bounded partial refunds for minor cosmetic issues before a return shipping label is issued.

---

## 90-Second Fast Path

### 1. Open the Hosted Demo (0:00 - 0:15)
- Navigate to the hosted app root `/`.
- Observe the top Judge Bar displaying:
  - US Sandbox Buyer Credentials: `sb-buyer@business.example.com`
  - Workspace status (per-session isolated with 60-minute expiry)
  - One-click "Reset" button to restore clean sandbox seed data at any time.

### 2. Pick a Pre-Captured Order (0:15 - 0:25)
- Under "Select a Captured Order", pick the first item:
  - Example: "Wireless Noise-Cancelling Headphones" ($85.00 capture).
- Click "Start Keep-It Return".

### 3. Nonce Liveness Challenge & Evidence (0:25 - 0:45)
- You are directed to `/case/{caseId}`.
- Notice Step 1: A 6-digit single-use nonce code is issued with a 10-minute countdown.
  - In production, the buyer writes this code on paper next to the item to prevent photo reuse.
- In Step 2, under "Judge Demo: One-Click Test Presets", click:
  - "Minor Cosmetic Scratch" (Tests normal auto-approval flow).
- The Gemini vision pipeline and deterministic offer engine evaluate the evidence.
- Result: "Keep-It Offer Pre-Approved" appears with a calculated refund of $17.00.
  - Notice the "Deterministic Engine Calculation" box breaking down the unit economics:
    $85.00 * 20% = $17.00 (bounded below merchant cap of $25.00 and avoided costs).

### 4. Accept Partial Refund (0:45 - 1:05)
- Click "Accept Partial Refund".
- The server computes a deterministic idempotency key (UUIDv5) and issues a partial refund on the PayPal capture.
- The screen updates to "PayPal Refund Confirmed" displaying the PayPal Refund ID and idempotency key.

### 5. Inspect the Immutable Ledger (1:05 - 1:20)
- Click "View in Merchant Audit Ledger" (or open `/ledger` in navigation).
- Confirm the case is recorded with:
  - Original Capture ID
  - Decision: AUTO_OFFER
  - PayPal Refund ID
  - Deterministic Idempotency Key
  - Webhook Verified Badge: CONFIRMED

### 6. Negative Test / Resilience Check (1:20 - 1:30)
- Click "Simulate 422" in the top Judge Bar (activates simulated PayPal failure).
- Pick another order and attempt an offer accept.
- Observe: The system cleanly rejects the call with an explanatory 422 message without creating a phantom refund or corrupting the ledger. The case remains retryable.
- Click "Reset" in the Judge Bar to restore all seed orders to a pristine state.

---

## Adversarial Test Scenarios (Optional Extra Testing)

On Step 2 of any return case, click the adversarial test presets to verify our hard security guards:
1. "Photo of Computer Screen" -> Routes to MANUAL_REVIEW (anti-spoof protection; zero auto-offer).
2. "Prompt Injection Paper" -> Routes to MANUAL_REVIEW (prompt injection defense; zero auto-offer).
3. "Major Structural Damage" -> Routes to FULL_RETURN_ONLY (unit economics do not apply; zero auto-offer).
