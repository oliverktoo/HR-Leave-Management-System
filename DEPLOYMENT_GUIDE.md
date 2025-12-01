# Deployment Guide - FKF HR Leave Management System

## 🚀 Production Build Complete

### Build Summary
- **Total Build Size**: 1.45MB (20 files)
- **Largest Chunks**:
  - pdfService: 416KB (133KB gzipped) - PDF generation
  - html2canvas: 198KB (45KB gzipped) - PDF rendering
  - index (main): 188KB (59KB gzipped)
  - supabase: 173KB (43KB gzipped)
  - admin components: 124KB (23KB gzipped)
  - react-vendor: 43KB (15KB gzipped)

### Optimizations Applied

#### 1. **Code Splitting & Lazy Loading**
- All routes lazy-loaded using React.lazy()
- Vendor code split into separate chunks
- Admin components bundled together
- Supabase client isolated

#### 2. **Loading Screen**
- FKF logo displayed during app initialization
- Animated loading indicator
- Smooth fade-in transitions

#### 3. **Mobile & Tablet Optimization**
- Touch-friendly 44px minimum tap targets
- Responsive grid layouts
- Mobile-first navigation
- Optimized viewport settings
- PWA-ready meta tags

#### 4. **Build Optimizations**
- Terser minification with console.log removal
- CSS minification and tree-shaking
- Image optimization
- Long-term asset caching

## 📱 Mobile Features
- ✅ Responsive design (mobile/tablet/desktop)
- ✅ Touch-friendly interactions
- ✅ Optimized scrolling
- ✅ Mobile navigation menu
- ✅ Accessible focus states
- ✅ PWA-ready

## 🌐 Netlify Deployment

### Prerequisites
1. Netlify account (free tier works)
2. Supabase project URL and anon key
3. GitHub repository (optional, for CI/CD)

### Option 1: Manual Deployment (Quick)

1. **Install Netlify CLI** (if not installed):
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

4. **Configure environment variables** in Netlify UI:
   - Go to Site Settings → Environment Variables
   - Add:
     - `VITE_SUPABASE_URL` = your Supabase project URL
     - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
     - `VITE_APP_URL` = your Netlify site URL
     - `VITE_ENVIRONMENT` = production

5. **Redeploy** after setting env vars:
   ```powershell
   netlify deploy --prod
   ```

### Option 2: GitHub Integration (Recommended for CI/CD)

1. **Push code to GitHub**:
   ```powershell
   git add .
   git commit -m "Production build ready"
   git push origin main
   ```

2. **Connect to Netlify**:
   - Go to https://app.netlify.com
   - Click "Add new site" → "Import an existing project"
   - Choose GitHub and select your repository
   - Configure build settings:
     - Base directory: `frontend`
     - Build command: `npm run build`
     - Publish directory: `frontend/dist`

3. **Add environment variables** in Netlify UI (same as Option 1)

4. **Deploy**:
   - Netlify will auto-deploy on every push to main branch
   - Or manually trigger deployment from Netlify UI

### Option 3: Drag & Drop (No CLI)

1. **Build locally**:
   ```powershell
   cd E:\HR\HR\frontend
   npm run build
   ```

2. **Go to Netlify**:
   - Visit https://app.netlify.com/drop
   - Drag the `frontend/dist` folder to upload
   - Configure environment variables in Site Settings

## 🔒 Environment Variables Required

Create these in Netlify UI (Site Settings → Environment Variables):

```
VITE_SUPABASE_URL=https://[your-project-ref].supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
VITE_APP_URL=https://[your-site].netlify.app
VITE_ENVIRONMENT=production
```

**Important Notes:**
- `VITE_APP_URL` **must** be your production URL (e.g., `https://fkf-hr.netlify.app`)
- This is used for password reset email links - if set to localhost, users won't be able to reset passwords in production
- For development, use `http://localhost:5177` (already set in `.env`)
- Update this value after deployment to match your Netlify site URL

## 📋 Pre-Deployment Checklist

- ✅ Production build completed (1.45MB)
- ✅ TypeScript compilation successful (0 errors)
- ✅ All optimizations applied
- ✅ Mobile responsiveness tested
- ✅ Loading screen with FKF logo
- ✅ Lazy loading implemented
- ✅ Security headers configured
- ✅ Asset caching configured
- ✅ SPA routing configured
- ⏳ Environment variables (configure in Netlify)
- ⏳ Custom domain (optional)
- ⏳ SSL certificate (automatic with Netlify)

## 🧪 Testing After Deployment

1. **Test all user roles**:
   - Employee login and features
   - HOD approvals
   - HR Admin management
   - Super Admin access

2. **Test responsive design**:
   - Mobile (< 768px)
   - Tablet (768px - 1024px)
   - Desktop (> 1024px)

3. **Test core features**:
   - Leave request submission
   - Balance tracking
   - Approvals workflow
   - Team calendar
   - User management
   - Reports generation

4. **Performance testing**:
   - Lighthouse score (aim for 90+)
   - Load time < 3 seconds
   - First Contentful Paint < 1.5s

## 🔧 Post-Deployment

### Custom Domain (Optional)
1. Go to Site Settings → Domain Management
2. Add custom domain
3. Configure DNS (Netlify provides instructions)
4. SSL auto-configured by Netlify

### Monitoring
- Netlify Analytics (optional paid feature)
- Check Supabase usage and quotas
- Monitor error logs in Netlify

### Updates
- Push to GitHub (if CI/CD enabled) or
- Run `netlify deploy --prod` for manual deployments

## 📊 Performance Metrics (Target)

- **Lighthouse Performance**: > 90
- **First Contentful Paint**: < 1.5s
- **Time to Interactive**: < 3s
- **Total Bundle Size**: 1.45MB (achieved)
- **Largest Component**: 416KB (pdfService)

## 🐛 Troubleshooting

### Build Fails
- Check Node.js version (>= 18)
- Run `npm install` in frontend folder
- Check environment variables

### Blank Page After Deploy
- Verify environment variables are set
- Check browser console for errors
- Ensure Supabase URL is correct

### Routing Issues
- Verify `_redirects` file exists
- Check `netlify.toml` configuration

### Slow Loading
- Check Supabase response times
- Verify CDN caching is working
- Review network tab in DevTools

## 📞 Support

- Netlify Docs: https://docs.netlify.com
- Supabase Docs: https://supabase.com/docs
- Vite Docs: https://vitejs.dev

## Next Steps

1. Deploy to Netlify using one of the methods above
2. Configure environment variables
3. Test thoroughly on production URL
4. Share URL with team for testing
5. Configure custom domain (optional)
6. Set up monitoring and analytics
