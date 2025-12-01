# Supabase CLI Configuration Guide

## Method 1: Get Personal Access Token (Recommended)

1. **Go to Supabase Dashboard**: https://supabase.com/dashboard/account/tokens
2. **Create a new token**:
   - Name: "HR System CLI"
   - Scope: Full access (or minimum required permissions)
3. **Copy the token** (it will only be shown once)
4. **Set environment variable** in your terminal:

### Windows PowerShell:
```powershell
$env:SUPABASE_ACCESS_TOKEN="your_token_here"
```

### Windows CMD:
```cmd
set SUPABASE_ACCESS_TOKEN=your_token_here
```

### Then test the connection:
```bash
cd "d:\FKF HQ\HR\sys"
npx supabase projects list
npx supabase link --project-ref nmvdagfduojwbsxgqkjw
```

## Method 2: Direct Database Connection (Alternative)

If CLI doesn't work, we can work directly with your existing database:

### Your Database Details:
- **URL**: https://nmvdagfduojwbsxgqkjw.supabase.co
- **Project Ref**: nmvdagfduojwbsxgqkjw
- **Frontend**: Already configured and working
- **Database**: Accessible via Supabase Dashboard

### Steps:
1. Go to: https://supabase.com/dashboard/project/nmvdagfduojwbsxgqkjw/sql
2. Run our check script to see existing structure
3. Create admin user if needed
4. Test the application

## Method 3: Check Current Status

Let's see what's working without CLI:
- ✅ Frontend running: http://localhost:5181
- ✅ Supabase config: .env file configured
- ✅ Database exists: nmvdagfduojwbsxgqkjw.supabase.co
- ❓ CLI authentication: Needs token or direct dashboard access

## Recommended Next Steps:
1. Try Method 1 with access token
2. If that fails, use Method 2 (dashboard direct access)
3. Test the application functionality