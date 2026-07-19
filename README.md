# VenuxPay API

Node.js + Express + TypeScript backend for VenuxPay, using Drizzle ORM on Postgres.

## Architecture highlights

- **Wallet ledger** (`src/modules/wallet/ledger.service.ts`): balances are never
  stored directly — always derived from an append-only ledger, with row-level
  locking (`SELECT ... FOR UPDATE`) so concurrent requests can't cause a lost
  update or double-spend.
- **VTU provider adapter** (`src/modules/services/providers/`): all purchase
  logic talks to a `VtuProvider` interface, never a specific provider's SDK.
  Swapping VTpass/Clubkonnect/etc. in later means writing one adapter class
  and registering it in `registry.ts` — no changes anywhere else.
- **Purchase flow** (`src/modules/services/purchase.service.ts`): debit →
  call provider → confirm or auto-reverse. A user is never left charged for
  a service they didn't receive.
- **Admin settings** (`src/modules/admin/admin-settings.routes.ts`): provider
  API keys are AES-256-GCM encrypted at rest (`src/lib/crypto.ts`) and never
  returned in plaintext by any endpoint.
- **Every admin action is audited** (`audit_logs` table) — wallet adjustments,
  provider changes, pricing changes, suspensions, all traceable to an admin.

## Local setup

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY
npm run db:generate    # generate SQL migration from schema
npm run db:migrate     # apply it to your database
npm run db:seed        # creates the first SUPER_ADMIN (set SEED_ADMIN_EMAIL/PASSWORD in .env first)
npm run dev
```

API runs on `http://localhost:4000`. Health check: `GET /health`.

## Deploying to Render

1. Push this backend to its own GitHub repo.
2. In Render: **New > Blueprint**, point it at the repo — `render.yaml` sets
   up the web service and a managed Postgres database automatically.
3. After first deploy, set `CORS_ORIGIN` in the Render dashboard to your
   deployed frontend URL.
4. Run the seed script once via the Render Shell tab:
   `SEED_ADMIN_EMAIL=you@venuxpay.com SEED_ADMIN_PASSWORD=... npm run db:seed`
5. In the admin panel, go to **Settings > Providers** and add your real VTU
   provider and Paystack/Monnify credentials — nothing is hardcoded.

## API overview

| Area | Base path |
|---|---|
| User auth | `/api/auth` |
| Wallet (balance, transfer, withdraw, history) | `/api/wallet` |
| Services (airtime, data, cable, electricity, education) | `/api/services` |
| Payment webhooks | `/webhooks/paystack`, `/webhooks/monnify` |
| Admin auth | `/api/admin/auth` |
| Admin dashboard stats | `/api/admin/dashboard` |
| Admin user management | `/api/admin/users` |
| Admin transaction management | `/api/admin/transactions` |
| Admin provider/pricing/service settings | `/api/admin/settings` |
| Admin audit logs & admin accounts | `/api/admin/audit-logs`, `/api/admin/admins` |

## What's still a placeholder

- **VTU provider**: `MockProvider` simulates a real provider (~95% success
  rate, realistic latency) so the full flow works end-to-end today. Swap in
  a real adapter once you've picked a provider (VTpass/Clubkonnect/etc.).
- **Bank withdrawal payout**: debit + transaction record are real; the actual
  dispatch to Paystack/Monnify Transfers API is a `TODO` in
  `wallet.service.ts` pending your gateway credentials.
- **SMS/Email dispatch for OTPs**: currently returned in the API response in
  non-production only (`devOtp`). Wire up Termii/Africa's Talking before
  going live.
