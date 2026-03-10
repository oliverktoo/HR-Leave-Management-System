# Netlify Deployment Guide

## Prerequisites
- Netlify account (sign up at https://netlify.com)
- GitHub repository (optional but recommended)
- Supabase credentials (already configured in `.env`)

## Deployment Steps

### Option 1: Deploy via Netlify CLI (Recommended for Quick Deploy)

1. **Install Netlify CLI** (if not already installed):
   ```powershell
   npm install -g netlify-cli
   ```

2. **Login to Netlify**:
   ```powershell
   netlify login
   ```

3. **Deploy from frontend folder**:
   ```powershell
   cd E:\HR\HR\frontend
   netlify deploy --prod
   ```

4. **Follow prompts**:
   - Create & configure a new site
   - Use default build directory: `dist`
   - Authorize publishing

5. **Set environment variables**:
   ```powershell
   netlify env:set VITE_SUPABASE_URL "https://nmvdagfduojwbsxgqkjw.supabase.co"
   netlify env:set VITE_SUPABASE_ANON_KEY "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdmRhZ2ZkdW9qd2JzeGdxa2p3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMxNzUxNzMsImV4cCI6MjA3ODc1MTE3M30.kfHFaNYGzSEVl7TgTdIj43Iw67hUZu7LwESX77vxJWA"
   ```

### Option 2: Deploy via Netlify Dashboard (Drag & Drop)

1. **Build the project**:
   ```powershell
   cd E:\HR\HR\frontend
   npm run build
   ```

2. **Go to Netlify Dashboard**:
   - Visit https://app.netlify.com/drop
   - Drag and drop the `dist` folder

3. **Configure environment variables**:
   - Go to Site settings → Build & deploy → Environment
   - Add:
     - `VITE_SUPABASE_URL`: `https://nmvdagfduojwbsxgqkjw.supabase.co`
     - `VITE_SUPABASE_ANON_KEY`: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (from `.env`)

4. **Redeploy** after setting environment variables

### Option 3: Deploy via GitHub (Continuous Deployment)

1. **Push code to GitHub**:
   ```powershell
   cd E:\HR\HR
   git add .
   git commit -m "Complete TypeScript migration and build configuration"
   git push origin main
   ```

2. **Connect to Netlify**:
   - Go to https://app.netlify.com
   - Click "Add new site" → "Import an existing project"
   - Choose GitHub and select your repository

3. **Configure build settings**:
   - Base directory: `frontend`
   - Build command: `npm run build`
   - Publish directory: `frontend/dist`

4. **Add environment variables** (same as Option 1/2):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

5. **Deploy site**

## Post-Deployment Checklist

### 1. Verify Deployment
- [ ] Site loads successfully
- [ ] No console errors in browser DevTools
- [ ] Login page renders correctly

### 2. Test Authentication
- [ ] Login with existing user works
- [ ] Password reset flow works
- [ ] Session persists on page refresh

### 3. Test Core Features
- [ ] Employee dashboard loads with leave balances
- [ ] Leave request form calculates working days correctly
- [ ] Leave history displays past requests
- [ ] Manager can see pending approvals
- [ ] Team calendar shows leave data

### 4. Test Admin Features (if HR admin)
- [ ] User management CRUD operations
- [ ] Leave type configuration
- [ ] Holiday management
- [ ] Reports and analytics load
- [ ] Policy settings save correctly
- [ ] Bulk operations work

### 5. Configure Supabase (if needed)
- [ ] Add Netlify domain to Supabase allowed redirect URLs:
  - Go to Supabase Dashboard → Authentication → URL Configuration
  - Add: `https://your-site-name.netlify.app`
  - Add: `https://your-site-name.netlify.app/**`

## Build Information

**Build Status**: ✅ Production build successful  
**Build Time**: 3.02s  
**Bundle Size**: 
- Main JS: 1,023.91 KB
- CSS: 73.38 KB  
- Total: ~1.47 MB (includes React 19, Supabase, PDF generation, charting libraries)

**Optimization Note**: Bundle size warning is expected for feature-rich React apps. Consider code-splitting if needed in the future.

## Troubleshooting

### Issue: Blank page after deployment
**Solution**: Check browser console for errors. Verify environment variables are set correctly.

### Issue: Login fails
**Solution**: 
1. Verify Supabase credentials in Netlify environment variables
2. Add Netlify URL to Supabase allowed redirect URLs
3. Check browser console for CORS errors

### Issue: 404 on page refresh
**Solution**: Verify `_redirects` file exists in `public/` folder with content: `/*    /index.html   200`

### Issue: Environment variables not working
**Solution**: 
1. Ensure variable names start with `VITE_` prefix
2. Rebuild site after adding variables
3. Clear browser cache

## Security Notes

- ✅ Supabase anon key is safe to expose (public-facing)
- ✅ RLS policies enforce data security at database level
- ⚠️ Never commit `.env` file to Git
- ⚠️ Use Netlify environment variables for production secrets

## Next Steps

After successful deployment:
1. Get custom domain (optional)
2. Enable HTTPS (automatic with Netlify)
3. Set up form submissions (if needed)
4. Configure custom headers (if needed)
5. Set up deploy notifications
6. Monitor site analytics

## Support

- Netlify Docs: https://docs.netlify.com
- Supabase Docs: https://supabase.com/docs
- Vite Docs: https://vite.dev
