# Year-End Carryforward Setup Guide

## Overview
The `process-carryforward` Edge Function automates the year-end leave balance carryforward process. It:
1. Calculates unused leave days from current year
2. Applies carryforward limits based on leave type policies
3. Creates next year's balances with carryforward days
4. Resets all counters (used_days and pending_days to 0)

## Deployment Status
✅ **Edge Function Deployed**: `process-carryforward` is live on Supabase

**Function URL**: 
```
https://nmvdagfduojwbsxgqkjw.supabase.co/functions/v1/process-carryforward
```

## Scheduling Options

### Option 1: Supabase Dashboard Cron (Recommended)
**Available on**: Pro plan and above

1. Go to **Supabase Dashboard** → **Database** → **Cron Jobs**
2. Click **"Create a new cron job"**
3. Configure:
   - **Name**: `year-end-carryforward`
   - **Schedule**: `0 2 1 1 *` (2:00 AM on January 1st)
   - **SQL Command**:
   ```sql
   SELECT net.http_post(
     url := 'https://nmvdagfduojwbsxgqkjw.supabase.co/functions/v1/process-carryforward',
     headers := '{"Content-Type": "application/json"}'::jsonb,
     body := '{}'::jsonb
   );
   ```
4. Click **"Save"**

### Option 2: External Cron Service (Free Plan Compatible)
Use services like **GitHub Actions**, **Vercel Cron**, or **cron-job.org**

#### GitHub Actions Example
Create `.github/workflows/carryforward.yml`:

```yaml
name: Year-End Carryforward

on:
  schedule:
    # Runs at 2:00 AM UTC on January 1st
    - cron: '0 2 1 1 *'
  workflow_dispatch: # Allow manual trigger

jobs:
  carryforward:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Carryforward
        run: |
          curl -X POST \
            https://nmvdagfduojwbsxgqkjw.supabase.co/functions/v1/process-carryforward \
            -H "Content-Type: application/json" \
            -d '{}'
```

Add to repository and enable in GitHub Actions settings.

#### cron-job.org Setup
1. Go to https://cron-job.org
2. Create free account
3. Add new cron job:
   - **Title**: Year-End Carryforward
   - **URL**: `https://nmvdagfduojwbsxgqkjw.supabase.co/functions/v1/process-carryforward`
   - **Schedule**: `0 2 1 1 *` (January 1, 2:00 AM)
   - **Request Method**: POST
   - **Request Headers**: `Content-Type: application/json`
   - **Request Body**: `{}`

### Option 3: Manual pg_cron (Advanced)
**Requires**: Supabase Pro plan with pg_cron enabled

Run the SQL script: `supabase/setup_carryforward_cron.sql`

⚠️ **Note**: Requires configuring `app.settings.service_role_key` in database settings.

## Manual Testing

### Test via curl (Windows PowerShell):
```powershell
Invoke-WebRequest -Uri "https://nmvdagfduojwbsxgqkjw.supabase.co/functions/v1/process-carryforward" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body "{}"
```

### Test via Supabase SQL Editor:
```sql
SELECT net.http_post(
  url := 'https://nmvdagfduojwbsxgqkjw.supabase.co/functions/v1/process-carryforward',
  headers := '{"Content-Type": "application/json"}'::jsonb,
  body := '{}'::jsonb
);
```

### Expected Response:
```json
{
  "success": true,
  "processed": 30,
  "errors": null,
  "message": "Successfully processed 30 balances for year 2026"
}
```

## How It Works

### Edge Function Logic (`process-carryforward/index.ts`):

1. **Fetch Active Users**: Get all users with `is_active = true`
2. **Fetch Leave Types**: Get all leave types with carryforward settings
3. **For Each User + Leave Type**:
   - Fetch current year balance
   - Calculate unused days: `annual_allocation + carryforward_days - used_days`
   - Calculate carryforward: `MIN(unused_days, max_carryforward_days)` (if `allow_carryforward = true`)
   - Upsert next year's balance:
     ```sql
     INSERT INTO leave_balances (user_id, leave_type_id, year, annual_allocation, carryforward_days)
     VALUES (user_id, leave_type_id, next_year, max_days_per_year, carryforward_days)
     ON CONFLICT (user_id, leave_type_id, year) DO UPDATE SET ...
     ```
4. **Return Summary**: Total processed balances and any errors

### Example Calculation:
**Current Year (2025)**:
- Annual Allocation: 21 days
- Used Days: 10 days
- Carryforward from 2024: 5 days
- **Unused**: (21 + 5) - 10 = **16 days**

**Next Year (2026)** (assuming `max_carryforward_days = 5`):
- Annual Allocation: 21 days
- Carryforward: MIN(16, 5) = **5 days**
- Used Days: 0
- Pending Days: 0
- **Total Available**: 21 + 5 = **26 days**

## Leave Type Policies (from seed.sql)

| Leave Type | Max Days/Year | Allow Carryforward | Max Carryforward |
|------------|---------------|-------------------|------------------|
| Annual Leave | 21 | ✅ Yes | 5 days |
| Sick Leave | 14 | ❌ No | 0 days |
| Maternity Leave | 90 | ❌ No | 0 days |
| Paternity Leave | 14 | ❌ No | 0 days |
| Compassionate Leave | 5 | ❌ No | 0 days |
| Study Leave | 10 | ❌ No | 0 days |

**Only Annual Leave carries forward** (max 5 days).

## Admin UI Integration (Future Enhancement)

### Add to BulkOperations.jsx:
```jsx
const handleManualCarryforward = async () => {
  setLoading(true);
  try {
    const response = await fetch(
      'https://nmvdagfduojwbsxgqkjw.supabase.co/functions/v1/process-carryforward',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
    );
    const result = await response.json();
    alert(`Carryforward complete: ${result.message}`);
  } catch (error) {
    alert('Failed to run carryforward: ' + error.message);
  }
  setLoading(false);
};

// UI Button:
<button onClick={handleManualCarryforward} className="btn btn-primary">
  Run Year-End Carryforward (Manual)
</button>
```

This allows HR admins to manually trigger carryforward at any time (useful for testing or early year-end processing).

## Monitoring & Logs

### View Function Logs:
1. **Supabase Dashboard** → **Edge Functions** → **process-carryforward** → **Logs**
2. Look for successful executions around January 1st, 2:00 AM

### Check Cron Job History (if using pg_cron):
```sql
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'year-end-carryforward')
ORDER BY start_time DESC
LIMIT 10;
```

### Verify Balances Created:
```sql
-- Check 2026 balances after carryforward runs
SELECT 
  up.first_name, up.last_name, 
  lt.name as leave_type,
  lb.annual_allocation, lb.carryforward_days, lb.used_days
FROM leave_balances lb
JOIN users_profile up ON lb.user_id = up.id
JOIN leave_types lt ON lb.leave_type_id = lt.id
WHERE lb.year = 2026
ORDER BY up.last_name, lt.name;
```

## Troubleshooting

### Issue: Function not running on schedule
**Check**:
- Verify cron job is active: `SELECT * FROM cron.job WHERE jobname = 'year-end-carryforward'`
- Check function logs for errors
- Ensure `net.http_post` extension is enabled: `CREATE EXTENSION IF NOT EXISTS http`

### Issue: Some balances not created
**Check**:
- Verify users have `is_active = true`
- Check current year balances exist
- Review function response for `errors` array

### Issue: Carryforward days incorrect
**Check**:
- Verify leave type policies: `SELECT * FROM leave_types WHERE allow_carryforward = true`
- Manually calculate: unused = (annual + carryforward) - used
- Check `max_carryforward_days` setting

## Recommendation
✅ **Use Option 2 (External Cron Service)** for now since we're on Supabase Free Plan.

**Best Choice**: GitHub Actions (no additional account needed, runs reliably, free for public repos)

## Next Steps
1. Choose scheduling option (GitHub Actions recommended)
2. Configure cron job
3. Test manually before January 1st
4. Add manual trigger button in BulkOperations.jsx (optional)
5. Monitor first automatic run on January 1, 2026
