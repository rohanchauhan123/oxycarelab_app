# oxycarelab_app

Oxycare Diagnostics - Department Operations Suite & Laboratory Information System (LIS).

## Features
- **Department Operations Console**: Patient booking, slot management, test parameters & diagnostic profiles.
- **Role-Based Workspaces**:
  - `SUPER_ADMIN`: Dushyant pandat (`dushyant@oxycare.in`) - User management, audit logs, system-wide department broadcasts.
  - `DOCTOR`: Referring doctor ledger, custom test pricing, patient appointment queue.
  - `AGENT`: Collection partner bookings, incentive tracking, passbook ledger.
  - `FRONTDESK`: Appointment intake, payment collection options (Collected by Partner / Collected by Oxycare).
- **Live Targeted Notifications**: Super Admin can broadcast to All Accounts, Specific Roles, or Specific User Accounts.
- **Universal Modal Portal**: Top-level viewport rendering with dark backdrop, pinned headers/footers, and scrollable content bodies.

## Tech Stack
- **Frontend**: React 19, Vite, Tailwind CSS, Lucide Icons, Radix UI.
- **Backend**: Express 5, Pino Logger, Drizzle ORM.
- **Database**: PostgreSQL (with in-memory fallback).
- **Deployment**: Docker, Docker Compose, Dokploy.

## Quick Start (Local)

```bash
# Install dependencies
pnpm install

# Start development servers
pnpm run dev
```

App opens at `http://localhost:5173` with API on port `5001`.

## Production Build & Run

```bash
# Build frontend and backend
pnpm run build

# Start production server
node artifacts/api-server/dist/index.mjs
```

## Docker & Dokploy Deployment

```bash
# Build and run with Docker Compose
docker compose up -d --build
```
