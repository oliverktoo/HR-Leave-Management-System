# Leave Management System

A modern serverless leave management system built with React, Supabase, and Netlify.

## Tech Stack

- **Frontend**: React 19 + Vite
- **Backend**: Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **Deployment**: Netlify
- **Routing**: React Router v6
- **Styling**: Tailwind CSS (to be added)

## Project Structure

```
/frontend          - React application
  /src
    /components    - React components
    /hooks         - Custom React hooks
    /services      - API service layers
    /lib           - Utilities and configurations
/supabase          - Database and backend
  /migrations      - Database schema migrations
  /functions       - Supabase Edge Functions
  /seed.sql        - Initial data
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Supabase account
- Git

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd HR
```

2. Install frontend dependencies
```bash
cd frontend
npm install
```

3. Set up environment variables
```bash
cp .env.example .env
```

Edit `.env` and add your Supabase credentials:
- `VITE_SUPABASE_URL`: Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Your Supabase anon/public key

### Running the Application

#### Start Development Server
```bash
cd frontend
npm run dev
```

The application will be available at `http://localhost:5173`

#### Run Database Migrations

First, install Supabase CLI:
```bash
npm install -g supabase
```

Then run migrations:
```bash
supabase db push
```

Or apply directly via Supabase Dashboard SQL Editor.

### Database Setup

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Run the migration files in order:
   - `001_initial_schema.sql`
   - `002_triggers_and_rls.sql`
4. Run `seed.sql` to populate initial data

## Features

### Phase 1 (Current)
- ✅ User authentication (login/logout)
- ✅ Protected routes with role-based access
- ✅ Database schema with RLS policies
- ✅ Automated balance management via triggers
- ✅ Basic dashboard UI

### Phase 2 (Upcoming)
- 🔄 Leave request submission
- 🔄 Approval workflow for HODs
- 🔄 Email notifications
- 🔄 Team calendar view
- 🔄 Leave balance tracking

### Phase 3 (Planned)
- 📋 HR admin panel
- 📋 Reports and analytics
- 📋 User management
- 📋 Policy configuration

## User Roles

- **Employee**: Submit requests, view own data
- **HOD (Head of Department)**: Approve/reject team requests
- **HR Admin**: Full system access and configuration

## Development

### Project Commands

```bash
# Development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

## Deployment

### Netlify Deployment

1. Connect repository to Netlify
2. Configure build settings:
   - Build command: `cd frontend && npm run build`
   - Publish directory: `frontend/dist`
3. Add environment variables in Netlify dashboard
4. Deploy!

## Documentation

For complete technical documentation, see:
- `Leave SYS/leave_mgmt_doc.md` - Complete system documentation
- `.github/copilot-instructions.md` - AI coding guidelines

## Security

- Row Level Security (RLS) enabled on all tables
- Authentication required for all routes
- Role-based access control
- Audit logging for sensitive operations

## Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## License

Proprietary - FKF HQ
