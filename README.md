# ReturnGate

Merchant-controlled, pre-label, capped keep-it partial refund workflow with AI-assisted evidence triage, built on PayPal Orders v2 and Payments v2 (sandbox) for the PayPal AI Hackathon 2026.

May reduce avoidable return costs (hypothesis).

## Prerequisites
- Node.js 20+
- pnpm 11+
- PayPal Developer Sandbox account (US)

## Setup
1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd returngate
   ```
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```
4. Populate `.env` with your PayPal sandbox credentials and Neon Postgres DATABASE_URL. Never commit `.env`.

## Development Commands
- `pnpm dev`: Starts Next.js development server
- `pnpm build`: Creates production build
- `pnpm test`: Runs Vitest test suites
- `pnpm lint`: Runs ESLint checks
- `pnpm spike`: Executes the PayPal sandbox spike (OAuth -> create order -> capture -> partial refund -> idempotent replay)

## Deployment to Render
ReturnGate is configured for deployment as a Render Web Service via `render.yaml`. A publicly reachable webhook URL is required to receive PayPal sandbox webhook notifications.

### Steps to Deploy:
1. Connect your GitHub repository to Render (Blueprints or Web Service).
2. Render detects `render.yaml` automatically.
3. In the Render Dashboard, navigate to the Environment tab of the web service and set the following non-synced variables:
   - `PAYPAL_CLIENT_ID`: Your PayPal sandbox client ID
   - `PAYPAL_CLIENT_SECRET`: Your PayPal sandbox client secret
   - `PAYPAL_WEBHOOK_ID`: Webhook ID registered in PayPal Developer dashboard pointing to `https://<your-render-domain>/api/webhooks/paypal`
   - `DATABASE_URL`: Neon PostgreSQL connection string
   - `GEMINI_API_KEY`: Google Gemini API key
   - `GEMINI_MODEL`: Model identifier string for Gemini Flash
   - `APP_BASE_URL`: Public URL of your deployed Render app (e.g. `https://returngate.onrender.com`)
   - `SESSION_SECRET`: Random 32+ character string for signed cookie session workspaces
   - `NEXT_PUBLIC_SANDBOX_BUYER_EMAIL`: Sandbox buyer email for demo judges
   - `NEXT_PUBLIC_SANDBOX_BUYER_PASSWORD`: Sandbox buyer password for demo judges
4. Trigger manual deploy. Once deployed, register `https://<your-render-domain>/api/webhooks/paypal` in your PayPal developer app to receive `PAYMENT.CAPTURE.REFUNDED` and `PAYMENT.CAPTURE.COMPLETED` events.
