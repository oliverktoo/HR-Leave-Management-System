# Email Notifications - Complete Setup Guide

## Overview
Email notifications automatically notify users about leave request events:
- **Employee submits** → Email to HOD/Manager
- **HOD approves** → Email to Employee
- **HOD rejects** → Email to Employee

## Architecture

### Two-Tier System
1. **In-App Notifications** - Immediate notifications in the UI
2. **Email Queue** - Reliable email delivery with retry logic

### Components
- **Database Triggers** - Auto-create notifications on events
- **Email Queue Table** - Stores pending emails
- **Email Templates** - Reusable HTML templates
- **Edge Function** - Sends actual emails (optional)
- **Worker Process** - Processes email queue (future)

## Setup Instructions

### Step 1: Run Database Setup

1. **Navigate to Supabase SQL Editor**
   - Go to https://supabase.com/dashboard
   - Select your project
   - Click "SQL Editor" → "New query"

2. **Run Email Setup Script**
   ```sql
   -- Copy and paste content from:
   -- supabase/setup_email_notifications.sql
   ```

3. **Verify Tables Created**
   ```sql
   -- Check if all tables exist
   SELECT table_name 
   FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name IN ('email_queue', 'email_templates', 'notifications');
   
   -- Should return 3 rows
   ```

### Step 2: Configure Email Service (Choose One)

#### Option A: Resend (Recommended - Free tier available)

1. **Create Resend Account**
   - Go to https://resend.com
   - Sign up for free account
   - Verify your domain (or use resend.dev for testing)

2. **Get API Key**
   - Dashboard → API Keys
   - Create new API key
   - Copy key (starts with `re_`)

3. **Add to Supabase**
   - Supabase Dashboard → Project Settings → Edge Functions
   - Add secret: `RESEND_API_KEY = re_xxxxx`

#### Option B: SendGrid

1. **Create SendGrid Account**
   - Go to https://sendgrid.com
   - Sign up (free tier: 100 emails/day)

2. **Create API Key**
   - Settings → API Keys
   - Create API Key
   - Copy key (starts with `SG.`)

3. **Add to Supabase**
   - Add secret: `SENDGRID_API_KEY = SG.xxxxx`

#### Option C: Gmail SMTP (Testing Only)

1. **Enable App Password**
   - Google Account → Security → 2-Step Verification
   - App passwords → Generate
   - Copy 16-character password

2. **Add to Supabase**
   ```
   SMTP_HOST = smtp.gmail.com
   SMTP_PORT = 587
   SMTP_USER = your-email@gmail.com
   SMTP_PASS = your-app-password
   ```

### Step 3: Update Edge Function (Optional)

If using Edge Functions for email sending:

1. **Update send-email/index.ts**
   ```typescript
   // Uncomment and configure your email service
   const resendApiKey = Deno.env.get('RESEND_API_KEY');
   
   const response = await fetch('https://api.resend.com/emails', {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${resendApiKey}`,
       'Content-Type': 'application/json',
     },
     body: JSON.stringify({
       from: 'FKF HR <noreply@yourcompany.com>',
       to: [emailData.to],
       subject: emailData.subject,
       html: emailData.html,
     }),
   });
   ```

2. **Deploy Edge Function**
   ```powershell
   # Using Supabase CLI
   supabase functions deploy send-email
   ```

### Step 4: Frontend Integration (Current Approach)

Since Edge Functions require additional setup, we're using frontend-triggered emails:

1. **Already Implemented**: Notifications table populated by triggers
2. **Frontend displays** in-app notifications
3. **Email queue** stores pending emails
4. **Future**: Background worker processes email queue

### Step 5: Test Email Notifications

1. **Trigger Test Events**
   ```sql
   -- Manually insert test notification
   INSERT INTO email_queue (
     recipient_email,
     recipient_name,
     subject,
     html_body,
     template_name,
     template_data,
     related_entity_type,
     related_entity_id,
     status
   ) VALUES (
     'test@example.com',
     'Test User',
     'Test Email - FKF HR System',
     '<h2>Test Email</h2><p>This is a test email from FKF HR System.</p>',
     'leave_request_submitted',
     '{"employee_name": "Test Employee"}',
     'leave_request',
     gen_random_uuid(),
     'pending'
   );
   ```

2. **Check Queue**
   ```sql
   SELECT * FROM email_queue 
   WHERE status = 'pending' 
   ORDER BY created_at DESC;
   ```

3. **Submit Leave Request**
   - Login as employee
   - Submit leave request
   - Check `email_queue` table - should have new entry
   - Check `notifications` table - manager should have notification

4. **Approve/Reject Request**
   - Login as HOD/Manager
   - Approve or reject request
   - Check `email_queue` - employee should have email queued
   - Check `notifications` - employee should have notification

## Email Templates

### Default Templates Included

1. **leave_request_submitted**
   - Sent to: Manager/HOD
   - When: Employee submits leave request
   - Action: Review request button

2. **leave_request_approved**
   - Sent to: Employee
   - When: Manager approves request
   - Action: View leave history button

3. **leave_request_rejected**
   - Sent to: Employee
   - When: Manager rejects request
   - Action: View leave history button

### Customize Templates

```sql
-- Update template
UPDATE email_templates
SET 
  html_body = '<your new HTML here>',
  subject = 'New subject line'
WHERE name = 'leave_request_submitted';

-- Add new template
INSERT INTO email_templates (name, subject, html_body, variables)
VALUES (
  'custom_template',
  'Custom Subject',
  '<h1>Custom Email</h1><p>{{variable_name}}</p>',
  '{"variable_name"}'::jsonb
);
```

### Template Variables

Available variables (use {{variable_name}} in templates):
- `{{employee_name}}` - Full name of employee
- `{{manager_name}}` - Full name of manager
- `{{leave_type}}` - Type of leave (Annual, Sick, etc.)
- `{{start_date}}` - Leave start date (formatted)
- `{{end_date}}` - Leave end date (formatted)
- `{{total_days}}` - Number of days
- `{{reason}}` - Employee's reason
- `{{reviewer_name}}` - Name of approver
- `{{reviewer_comments}}` - Approval/rejection comments
- `{{app_url}}` - Link to application

## Notification Center (In-App)

### Already Implemented
- ✅ `notifications` table created
- ✅ Triggers populate notifications
- ✅ RLS policies for user access

### To Display in UI (Future Enhancement)

1. **Create Notifications Component**
   ```jsx
   // frontend/src/components/notifications/NotificationCenter.jsx
   const NotificationCenter = () => {
     const [notifications, setNotifications] = useState([]);
     
     useEffect(() => {
       loadNotifications();
       
       // Subscribe to realtime updates
       const subscription = supabase
         .channel('notifications')
         .on('postgres_changes', {
           event: 'INSERT',
           schema: 'public',
           table: 'notifications',
           filter: `user_id=eq.${user.id}`
         }, (payload) => {
           setNotifications(prev => [payload.new, ...prev]);
         })
         .subscribe();
         
       return () => subscription.unsubscribe();
     }, []);
     
     // ... render notification list
   };
   ```

2. **Add to Navigation**
   - Bell icon with unread count badge
   - Dropdown showing recent notifications
   - Mark as read functionality

3. **Query Notifications**
   ```javascript
   const { data, error } = await supabase
     .from('notifications')
     .select('*')
     .eq('user_id', user.id)
     .order('created_at', { ascending: false })
     .limit(20);
   ```

## Email Sending Options

### Option 1: Frontend Direct (Simple, Not Recommended)
- Process `email_queue` from frontend
- Call email API directly
- Issues: Security, reliability

### Option 2: Edge Functions (Recommended)
- Triggers call Edge Function
- Edge Function sends email
- Secure, serverless
- Requires Supabase CLI

### Option 3: External Worker (Production)
- Separate Node.js/Python service
- Polls `email_queue` table
- Processes and sends emails
- Handles retries and failures
- Best for high volume

### Option 4: Supabase Webhooks (Future)
- Database webhook on INSERT to `email_queue`
- Calls external API
- Simple setup
- Limited control

## Processing Email Queue (Worker Example)

### Node.js Worker Script

```javascript
// workers/email-worker.js
import { createClient } from '@supabase/supabase-js';
import Resend from 'resend';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

async function processEmailQueue() {
  // Get pending emails
  const { data: emails } = await supabase
    .from('email_queue')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .lt('attempts', 'max_attempts')
    .limit(10);
    
  for (const email of emails) {
    try {
      // Send email
      await resend.emails.send({
        from: 'FKF HR <noreply@fkf.ke>',
        to: email.recipient_email,
        subject: email.subject,
        html: email.html_body,
      });
      
      // Mark as sent
      await supabase
        .from('email_queue')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', email.id);
        
    } catch (error) {
      // Increment attempts
      await supabase
        .from('email_queue')
        .update({ 
          attempts: email.attempts + 1,
          error_message: error.message,
          status: email.attempts + 1 >= email.max_attempts ? 'failed' : 'pending'
        })
        .eq('id', email.id);
    }
  }
}

// Run every 30 seconds
setInterval(processEmailQueue, 30000);
```

## Monitoring & Troubleshooting

### Check Email Queue Status
```sql
-- Queue summary
SELECT 
  status,
  COUNT(*) as count,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM email_queue
GROUP BY status;

-- Failed emails
SELECT * FROM email_queue 
WHERE status = 'failed'
ORDER BY created_at DESC;

-- Retry failed emails
UPDATE email_queue
SET status = 'pending', attempts = 0, error_message = NULL
WHERE status = 'failed' AND created_at > NOW() - INTERVAL '1 hour';
```

### Check Notifications
```sql
-- Unread notifications
SELECT 
  u.full_name,
  COUNT(*) as unread_count
FROM notifications n
JOIN users_profile u ON n.user_id = u.id
WHERE n.is_read = false
GROUP BY u.full_name;

-- Recent notifications
SELECT 
  u.full_name,
  n.title,
  n.message,
  n.created_at
FROM notifications n
JOIN users_profile u ON n.user_id = u.id
ORDER BY n.created_at DESC
LIMIT 20;
```

### Common Issues

**Issue**: Emails not queued
- Check if trigger is active: `SELECT * FROM pg_trigger WHERE tgname LIKE '%notification%';`
- Check trigger function: Enable logging in `notify_leave_request_event_v2()`

**Issue**: Emails queued but not sent
- Verify email service API key in Supabase secrets
- Check `error_message` in `email_queue` table
- Test email service API directly

**Issue**: Wrong recipient
- Verify HOD assignment in `departments` table
- Check `send_leave_notification_v2()` function logic

## Next Steps

1. ✅ **Database setup** - Run SQL scripts
2. ⏳ **Choose email service** - Sign up for Resend/SendGrid
3. ⏳ **Configure API keys** - Add to Supabase
4. ⏳ **Deploy worker** - Set up email processing
5. ⏳ **Test thoroughly** - Submit and approve requests
6. ⏳ **Monitor queue** - Check for failed emails
7. ⏳ **Add notification UI** - Show in-app notifications

## Production Checklist

- [ ] Email service configured and tested
- [ ] Email templates reviewed and approved
- [ ] Proper sender domain configured (not @gmail.com)
- [ ] Unsubscribe links added (if required)
- [ ] Email logs and monitoring set up
- [ ] Rate limiting configured
- [ ] Bounce and complaint handling
- [ ] Email queue worker deployed
- [ ] Notification center added to UI
- [ ] User preferences for email notifications

---
**Status**: ✅ Database Setup Complete, Email Service Pending
**Last Updated**: 2025-01-16
**Next**: Configure email service API keys
