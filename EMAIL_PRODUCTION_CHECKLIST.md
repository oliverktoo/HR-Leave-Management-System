# Email Notifications - Production Deployment Checklist

## Current Status
✅ Email system is fully functional
✅ Edge Function deployed and working
✅ Database triggers firing correctly
✅ In-app notifications being created

⚠️ **LIMITATION**: Currently using Resend free tier which only allows sending to `oliverktoo@gmail.com`

## Before Production Deployment

### 1. Verify Domain with Resend
- Go to https://resend.com/domains
- Add your organization's domain (e.g., `fkf.co.ke` or `notifications.fkf.co.ke`)
- Add the required DNS records (TXT, MX, DKIM)
- Wait for verification (usually takes a few minutes)

### 2. Update Edge Function Email Address
Edit `supabase/functions/send-email/index.ts` line ~111:
```typescript
// Change from:
from: 'FKF Leave Management <onboarding@resend.dev>',

// To your verified domain:
from: 'FKF Leave Management <noreply@your-domain.com>',
```

### 3. Redeploy Edge Function
```bash
supabase functions deploy send-email --no-verify-jwt
```

### 4. Reset User Emails to Real Addresses
Run this SQL to restore actual email addresses:
```sql
-- Update users with their real email addresses
UPDATE users_profile 
SET email = 'oliverkiptook@gmail.com'
WHERE first_name = 'Oliver' AND last_name = 'Kiptook';

UPDATE users_profile 
SET email = 'oliverktoo@gmail.com'
WHERE first_name = 'Oliver' AND last_name = 'Ktoo';
```

### 5. Test Email Flow with Real Addresses
1. Submit a leave request as employee
2. Verify HOD receives email
3. Approve/reject the request as HOD
4. Verify employee receives email

## Email Templates
All three email types are implemented:
- ✅ `request_submitted` - Sent to HOD when employee submits request
- ✅ `request_approved` - Sent to employee when HOD approves
- ✅ `request_rejected` - Sent to employee when HOD rejects

## Files Modified for Email System
- `supabase/functions/send-email/index.ts` - Edge Function (fixed foreign key relationships)
- `supabase/setup_email_simple.sql` - Database triggers
- `supabase/enable_email_sending.sql` - HTTP extension and Edge Function caller
- `supabase/fix_email_logging.sql` - Enhanced logging for debugging

## Testing Files (Can be deleted after production)
- `supabase/test_email_manually.sql`
- `supabase/test_http_call_direct.sql`
- `supabase/verify_email_setup.sql`
- `supabase/test_direct_email_call.sql`
- `supabase/temp_set_same_email.sql`
