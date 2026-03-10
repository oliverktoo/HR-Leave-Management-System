# Leave Management System - AI Coding Instructions

## Big Picture
- Frontend lives in [frontend](frontend), built with React 19 + Vite and React Router; entry and routes are in [frontend/src/App.tsx](frontend/src/App.tsx).
- Backend is Supabase (PostgreSQL + Auth + RLS) with schema and policies in [supabase/migrations](supabase/migrations).
- The UI is role-gated via `ProtectedRoute`, but real security is enforced by RLS.

## Data Access Patterns
- Supabase client is created once in [frontend/src/lib/supabaseClient.ts](frontend/src/lib/supabaseClient.ts) using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- All DB calls go through service modules like [frontend/src/services/leaveService.ts](frontend/src/services/leaveService.ts) and [frontend/src/services/authService.ts](frontend/src/services/authService.ts); functions return `{ data, error }` and log on failure.
- Leave balances are updated by the `update_leave_balance()` trigger in [supabase/migrations/002_triggers_and_rls.sql](supabase/migrations/002_triggers_and_rls.sql); the app should only insert/update `leave_requests`.

## Auth + Routing
- `AuthProvider` in [frontend/src/hooks/useAuth.tsx](frontend/src/hooks/useAuth.tsx) listens to `onAuthStateChange`, then loads `users_profile`.
- `ProtectedRoute` in [frontend/src/components/ProtectedRoute.tsx](frontend/src/components/ProtectedRoute.tsx) redirects to `/login` or `/unauthorized` based on auth and role.

## Business Logic Conventions
- Working days are computed client-side in `calculateWorkingDays` in [frontend/src/services/leaveService.ts](frontend/src/services/leaveService.ts); fetch `public_holidays` before calculating.
- Supabase join patterns use nested `select()` and alias syntax in service functions (see leave service for examples).

## Dev Workflow (Frontend)
- Commands (from [frontend/package.json](frontend/package.json)): `npm run dev`, `npm run build`, `npm run preview`, `npm run lint`.
- Vite dev server is configured for port 5177 in [frontend/vite.config.js](frontend/vite.config.js).
- Environment variables are read via `import.meta.env` (not `process.env`); `VITE_APP_URL` is used for password reset redirects in [frontend/src/services/authService.ts](frontend/src/services/authService.ts).

## Database Setup Notes
- Run migrations in order: [supabase/migrations/001_initial_schema.sql](supabase/migrations/001_initial_schema.sql), then [supabase/migrations/002_triggers_and_rls.sql](supabase/migrations/002_triggers_and_rls.sql), then [supabase/seed.sql](supabase/seed.sql).
- There are ad-hoc SQL files in [supabase](supabase) outside the migrations folder; only run them intentionally to avoid duplicate policy or data errors.
- **Phase 2 summary**: `PHASE2_COMPLETE.md` (employee UI + approvals)
- **Quick start**: `README.md` (installation instructions)
- **CLI setup**: `CLI_SETUP_GUIDE.md` (Supabase CLI usage)
