# PRD - ReturnGate

Status: draft v1 (Oct 22, 2026). Anything marked [NEEDS INPUT] or [VERIFY IN SANDBOX] is unresolved.

## 1. Problem and wedge
Small online sellers pay return shipping and handling for minor cosmetic issues where a small refund would settle things. ReturnGate lets the merchant pre-approve a capped "keep it" partial refund so a qualifying buyer gets an instant PayPal partial refund before any return label exists.

Wedge: the decision happens before a return label exists, the offer is bounded by deterministic unit economics, and the merchant sets the rules once. This is not dispute handling and not an autonomous full-refund agent.

Savings are a hypothesis until measured with real sellers. [NEEDS INPUT: seller validation results]

## 2. Users
- Merchant: small online seller with a PayPal business account (sandbox in this project).
- Buyer: someone who received an item with a minor defect and wants a quick resolution.
- Judge: reviews the hosted demo with no login and no AI keys.

## 3. Non-goals
No dispute or chargeback handling. No fraud detection claims. No identity verification. No proof of item condition. No autonomous full refunds. No payouts, escrow or custody. No shipping label generation. No PayPal SDK.

## 4. Core flow (keep-it path)
1. Merchant sets policy once (cap, severity percent, cost inputs, min confidence).
2. Buyer opens a case for a captured order. Server issues a single-use nonce (10 minute expiry).
3. Buyer uploads a photo of the item with the nonce visible.
4. Vision returns evidence flags only (see section 7).
5. Deterministic engine decides: AUTO_OFFER, MANUAL_REVIEW, or FULL_RETURN_ONLY.
6. AUTO_OFFER: buyer accepts, server calls PayPal partial refund with deterministic PayPal-Request-Id.
7. Signed webhook confirms the refund. Ledger shows the verified state.
8. MANUAL_REVIEW: case enters the merchant queue. Merchant approves, edits within cap, or rejects.

## 5. Deterministic decision rules (src/lib/engine)
Inputs: capturedCents, remainingRefundableCents, policy, vision flags.

AUTO_OFFER only if ALL are true:
- nonce valid, unexpired, unused, bound to this case
- vision.nonce_visible, vision.sku_match
- not vision.screen_capture_suspected, not vision.injected_text_detected
- vision.defect_class == COSMETIC_MINOR
- vision.confidence >= policy.minConfidence
- no prior keep-it refund on this capture beyond policy limit

Offer amount (cents):
```
severityCents  = floor(capturedCents * policy.minorPercent / 100)
avoidedCost    = capturedCents - policy.salvageCents + policy.returnShippingCents + policy.handlingCents
offerCents     = min(severityCents, policy.capCents, remainingRefundableCents, avoidedCost - policy.minSavingsCents)
```
If offerCents <= 0, route to FULL_RETURN_ONLY. The avoidedCost formula must be confirmed with the first 3 sellers. [NEEDS INPUT: seller confirmation of formula]

Any other defect class (COSMETIC_MAJOR, FUNCTIONAL, UNCLEAR, NONE) or any failed guard goes to MANUAL_REVIEW or FULL_RETURN_ONLY. Never auto-offer on uncertainty.

## 6. Data model (Prisma)
- Workspace: id, createdAt, expiresAt
- MerchantPolicy: workspaceId, capCents, minorPercent, salvageCents, returnShippingCents, handlingCents, minSavingsCents, minConfidence, enabled
- Order: id, workspaceId, paypalOrderId, captureId, amountCents, currency, status
- ReturnCase: id, orderId, nonce, nonceExpiresAt, nonceUsedAt, status, imageSha256, visionJson, decision, offerCents, decidedBy
- Refund: id, caseId, idempotencyKey (unique), paypalRefundId, amountCents, status
- WebhookEvent: eventId (unique), type, signatureVerified, payload, receivedAt
- VisionCache: imageSha256 (pk), resultJson
- UsageCounter: key, windowStart, count

## 7. Vision contract (Zod, strict)
```
{ nonce_visible: boolean,
  sku_match: boolean,
  screen_capture_suspected: boolean,
  injected_text_detected: boolean,
  defect_class: "NONE" | "COSMETIC_MINOR" | "COSMETIC_MAJOR" | "FUNCTIONAL" | "UNCLEAR",
  confidence: number (0..1),
  notes: string (max 200 chars, display only, never parsed) }
```
No amount fields. Extra fields are rejected.

## 8. PayPal surface
Proven in sandbox before building on them:
- POST /v1/oauth2/token
- POST /v2/checkout/orders (intent CAPTURE), approve as sandbox buyer, POST .../capture
- POST /v2/payments/captures/{id}/refund with amount and PayPal-Request-Id
- POST /v1/notifications/verify-webhook-signature
- Webhook events: PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.REFUNDED
Optional (phase P5b, cut if late): POST /v2/checkout/orders/{id}/track on the full-return branch only.
Use PayPal-Mock-Response for negative tests. [VERIFY IN SANDBOX: header behavior and error codes]
Sandbox accounts must be US. Simulator webhooks cannot pass verification; use real events.

## 9. Judge access and cost control
- Hosted, no login. Signed-cookie session workspace, auto-reset after 60 minutes.
- Sandbox buyer credentials shown on screen for the PayPal approval step.
- Refund pool risk: captured demo orders can only be partially refunded up to their total. Plan: a pool of pre-captured orders plus a per-workspace refund cap. [NEEDS INPUT: how many pre-captured orders to seed]
- Vision caps: per-IP hourly and global daily caps from env. When capped, fall back to MANUAL_REVIEW, never to auto-offer.
- Demo must stay live and free until Dec 15, 2026.

## 10. Validation plan
- 15 outreach messages to small online sellers; target 3 testers by Oct 29.
- Collect: their return policy, typical return cost inputs, 5+ real defect photos if they will share.
- Adversarial vision set (about 10 images minimum): stock photo, photo of a screen, wrong item, ambiguous scratch, missing nonce, injected text, blurry image, major damage.
- Pass bar: zero auto-offers on any adversarial or ambiguous case.

## 11. Gates
See AGENT.md. Gate 1 is the sandbox loop. Fallback is chosen after Gate 1 results, not before.

## 12. Demo script (target 2:50, hard limit 3:00)
- 0:00-0:30: buyer with a captured order, small scratch, nonce in photo. Offer appears. Accept. Real sandbox partial refund fires.
- 0:30-1:10: adversarial block. Screen photo and injected-text packing note both land in manual review with no PayPal call.
- 1:10-1:50: merchant policy and the deterministic math inspector showing cap and avoided-cost logic.
- 1:50-2:30: signed webhook verified, event ID shown, replayed request produces no duplicate refund.
- 2:30-2:50: honest limits (photo is evidence for triage, not proof) and where PayPal is used.
No fabricated numbers on screen. Use only figures produced by the live app.

## 12b. Open items
- [NEEDS INPUT: Gemini Flash model string]
- [NEEDS INPUT: seller validation results and cost-formula confirmation]
- [NEEDS INPUT: pre-captured order pool size for judge demo]
- [NEEDS INPUT: license confirmation (MIT default)]
- [NEEDS INPUT: Render instance type for Nov 1 to Dec 15]
- AG Grid: skipped for now. Revisit only after verifying trial length.
