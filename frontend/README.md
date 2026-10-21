# PondokPay frontend

React, Vite, and Tailwind CSS frontend for the PondokPay API.

## Run locally

1. Start the backend API on port `3000`.
2. In this directory, install dependencies and start Vite:

   ```powershell
   npm install
   npm run dev
   ```

3. Open the local URL printed by Vite (normally `http://localhost:5173`).

Vite proxies `/api` requests to `http://localhost:3000`. To use another backend while developing, set `VITE_API_PROXY_TARGET` in a local `.env` file based on `.env.example`.

## Production build

```powershell
npm run build
npm run preview
```

Format all admin, cashier, and parent component files with:

```powershell
npm run format
```

When hosting frontend and API on different origins, set `VITE_API_BASE_URL` to the API base path (for example `https://api.example.com/api`) at build time and configure the API host with a strict CORS allowlist for the frontend origin. Do not place API secrets in Vite environment variables; values prefixed with `VITE_` are public in the browser bundle.

## Included screens

- Admin: dashboard, santri, saldo operations, credentials, canteens/cashiers, parent accounts, transactions, users, financial approvals, and audit log.
- Cashier: assigned canteen selection, purchase amount entry, student verification by RFID/fingerprint ID, payment confirmation, account, and canteen history.
- Parent/guardian: linked children, balance and daily-limit overview, transaction history, and daily-limit updates.
- Admin/cashier login includes the API's TOTP MFA enrollment and verification flow.

## Frontend structure

- `src/components/admin/` contains one module for each admin menu, plus `shared.jsx` for reusable admin tables, forms, and santri search.
- `src/components/admin/index.js` exports admin screens for route wiring in `App.jsx`.
- `src/components/cashier/` contains separate transaction, history, and account screens, with shared cashier form elements in `shared.jsx`.
- `src/components/parent/` contains separate home, history, and daily-limit screens, with shared parent helpers in `shared.jsx`.
- Each role folder has an `index.js` entry point for route wiring; shared application layout and UI primitives live in `src/ui.jsx`.

Access tokens are held in `sessionStorage` for the current browser tab and removed when the user logs out. Financial transactions submit an idempotency key to prevent duplicate balance changes on retries.
