import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  plugins: [react()],
  server: {
    port: 5177,
    host: true
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'supabase': ['@supabase/supabase-js'],
          'admin': [
            './src/components/admin/AdminDashboard.tsx',
            './src/components/admin/UserManagement.tsx',
            './src/components/admin/LeaveTypeManagement.tsx',
            './src/components/admin/ReportsAnalytics.tsx',
            './src/components/admin/HolidayManagement.tsx',
            './src/components/admin/PolicySettings.tsx',
            './src/components/admin/BulkOperations.tsx',
            './src/components/admin/AnalyticsDashboard.tsx'
          ]
        }
      }
    },
    chunkSizeWarningLimit: 1000,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@supabase/supabase-js']
  }
})
