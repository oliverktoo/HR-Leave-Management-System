# TypeScript Conversion Guide

## Overview
This guide provides step-by-step instructions for converting the Leave Management System from JavaScript to TypeScript.

## Prerequisites
✅ **Completed**:
- TypeScript installed (`npm install --save-dev typescript @types/node`)
- `tsconfig.json` created
- `tsconfig.node.json` created
- `src/types/index.ts` created with all application types

## Conversion Strategy

### Phase 1: Core Infrastructure (Priority: CRITICAL)
**Order**: Bottom-up (dependencies first)

1. **Supabase Client** (`lib/supabaseClient.js` → `lib/supabaseClient.ts`)
2. **Service Layer** (`services/*.js` → `services/*.ts`)
3. **Hooks** (`hooks/useAuth.jsx` → `hooks/useAuth.tsx`)

### Phase 2: Utility Components (Priority: HIGH)
4. **Error Handling** (`ErrorBoundary.jsx` → `ErrorBoundary.tsx`)
5. **Loading States** (`LoadingFallback.jsx` → `LoadingFallback.tsx`)
6. **Route Protection** (`ProtectedRoute.jsx` → `ProtectedRoute.tsx`)

### Phase 3: Page Components (Priority: HIGH)
7. **Authentication** (`auth/*.jsx` → `auth/*.tsx`)
8. **Dashboard** (`dashboard/Dashboard.jsx` → `dashboard/Dashboard.tsx`)
9. **Leave Management** (`leave/*.jsx` → `leave/*.tsx`)
10. **Approvals** (`approvals/Approvals.jsx` → `approvals/Approvals.tsx`)
11. **Calendar** (`calendar/TeamCalendar.jsx` → `calendar/TeamCalendar.tsx`)
12. **Notifications** (`notifications/*.jsx` → `notifications/*.tsx`)

### Phase 4: Admin Components (Priority: MEDIUM)
13. **Admin Dashboard** (`admin/AdminDashboard.jsx` → `admin/AdminDashboard.tsx`)
14. **User Management** (`admin/UserManagement.jsx` → `admin/UserManagement.tsx`)
15. **Leave Types** (`admin/LeaveTypeManagement.jsx` → `admin/LeaveTypeManagement.tsx`)
16. **Reports** (`admin/ReportsAnalytics.jsx` → `admin/ReportsAnalytics.tsx`)
17. **Holidays** (`admin/HolidayManagement.jsx` → `admin/HolidayManagement.tsx`)
18. **Settings** (`admin/PolicySettings.jsx` → `admin/PolicySettings.tsx`)
19. **Bulk Operations** (`admin/BulkOperations.jsx` → `admin/BulkOperations.tsx`)
20. **Analytics** (`admin/AnalyticsDashboard.jsx` → `admin/AnalyticsDashboard.tsx`)

### Phase 5: App Entry (Priority: CRITICAL)
21. **Main App** (`App.jsx` → `App.tsx`)
22. **Main Entry** (`main.jsx` → `main.tsx`)

## Detailed Conversion Steps

### Step 1: Convert `lib/supabaseClient.js` → `lib/supabaseClient.ts`

**Before**:
```javascript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

**After**:
```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey
);
```

**Actions**:
1. Rename file: `supabaseClient.js` → `supabaseClient.ts`
2. Import `Database` type
3. Add type assertions for environment variables
4. Add validation check
5. Type the `supabase` export

### Step 2: Convert `services/authService.js` → `services/authService.ts`

**Key Changes**:
```typescript
import { supabase } from '../lib/supabaseClient';
import type { 
  UserProfile, 
  ServiceResponse, 
  LoginFormData, 
  SignUpFormData 
} from '../types';

export const signIn = async (
  email: string, 
  password: string
): Promise<ServiceResponse<UserProfile>> => {
  try {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) return { data: null, error: authError };

    const { data: profile, error: profileError } = await supabase
      .from('users_profile')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError) return { data: null, error: profileError };

    return { data: profile as UserProfile, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
};

// Apply same pattern to all other functions
export const signUp = async (userData: SignUpFormData): Promise<ServiceResponse<UserProfile>> => {
  // ...
};

export const signOut = async (): Promise<ServiceResponse<null>> => {
  // ...
};

export const getUserProfile = async (userId: string): Promise<ServiceResponse<UserProfile>> => {
  // ...
};
```

**Actions**:
1. Rename file
2. Import types from `../types`
3. Add parameter types
4. Add return type annotations
5. Type cast responses where needed

### Step 3: Convert `services/leaveService.js` → `services/leaveService.ts`

**This is the LARGEST file (~600 lines)**. Key pattern:

```typescript
import { supabase } from '../lib/supabaseClient';
import type {
  LeaveBalance,
  LeaveRequest,
  LeaveRequestFormData,
  LeaveRequestFilters,
  LeaveRequestStatus,
  PublicHoliday,
  Notification,
  NotificationFilter,
  ServiceResponse,
} from '../types';

export const getLeaveBalances = async (
  userId: string,
  year: number
): Promise<ServiceResponse<LeaveBalance[]>> => {
  try {
    const { data, error } = await supabase
      .from('leave_balances')
      .select(`
        *,
        leave_types (
          id, name, description, max_days_per_year, 
          allow_carryforward, max_carryforward_days, 
          requires_documentation, color_code
        )
      `)
      .eq('user_id', userId)
      .eq('year', year)
      .order('leave_types(name)');

    if (error) return { data: null, error };
    return { data: data as LeaveBalance[], error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
};

// Repeat pattern for all 20+ functions in this file
```

**Critical Functions to Convert**:
- `getLeaveBalances(userId, year)`
- `getLeaveRequests(userId, filters)`
- `submitLeaveRequest(requestData)`
- `cancelLeaveRequest(requestId)`
- `getPendingRequestsForApproval(userId)`
- `updateRequestStatus(requestId, status, reviewerId, comments)`
- `calculateWorkingDays(startDate, endDate, publicHolidays)`
- `getPublicHolidays()`
- `getNotifications(userId, filter)`
- `getUnreadCount(userId)`
- `markNotificationAsRead(notificationId)`
- `markAllNotificationsAsRead(userId)`
- `deleteNotification(notificationId)`

### Step 4: Convert `services/pdfService.js` → `services/pdfService.ts`

```typescript
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { 
  LeaveRequest, 
  UserProfile, 
  PDFFilters, 
  PDFSummary 
} from '../types';

export const generateLeaveCertificate = (
  leaveRequest: LeaveRequest,
  userProfile: UserProfile
): void => {
  const doc = new jsPDF();
  
  // ... rest of implementation (no changes needed, just type annotations)
  
  doc.save(`Leave_Certificate_${userProfile.first_name}_${userProfile.last_name}.pdf`);
};

export const generateLeaveReport = (
  leaveData: LeaveRequest[],
  filters: PDFFilters = {},
  summary: PDFSummary = {}
): void => {
  // ...
};

export const generateDepartmentSummary = (
  departmentData: any[], // TODO: Create DepartmentData type
  departmentName: string
): void => {
  // ...
};

export const generateLeaveBalanceReport = (
  balanceData: any[], // TODO: Create BalanceData type
  year: number
): void => {
  // ...
};
```

### Step 5: Convert `hooks/useAuth.jsx` → `hooks/useAuth.tsx`

```typescript
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import type { UserProfile, UserRole, AuthContextType } from '../types';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          loadUserProfile(session.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const loadUserProfile = async (userId: string): Promise<void> => {
    try {
      const { data, error } = await supabase
        .from('users_profile')
        .select(`
          *,
          department:departments (
            id, name, description, is_active
          )
        `)
        .eq('id', userId)
        .single();

      if (error) throw error;
      setProfile(data as UserProfile);
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async (): Promise<void> => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  const value: AuthContextType = {
    user,
    profile,
    role: (profile?.role as UserRole) ?? null,
    loading,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
```

### Step 6: Convert Utility Components

**ProtectedRoute.tsx**:
```typescript
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LoadingFallback } from './LoadingFallback';
import type { ProtectedRouteProps } from '../types';

export const ProtectedRoute = ({ 
  children, 
  allowedRoles 
}: ProtectedRouteProps) => {
  const { user, profile, role, loading } = useAuth();

  if (loading) {
    return <LoadingFallback />;
  }

  if (!user || !profile) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
};
```

**ErrorBoundary.tsx**:
```typescript
import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="error-container">
          <h1>Something went wrong</h1>
          <p>{this.state.error?.message}</p>
          <button onClick={() => window.location.reload()}>
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

**LoadingFallback.tsx**:
```typescript
export const LoadingFallback = () => {
  return (
    <div className="loading-fallback">
      <div className="loading-spinner"></div>
      <p>Loading...</p>
    </div>
  );
};
```

### Step 7: Convert Page Components (Example: Dashboard.tsx)

```typescript
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { getLeaveBalances } from '../../services/leaveService';
import type { LeaveBalance, DashboardStats } from '../../types';

export const Dashboard = () => {
  const { user, profile, role } = useAuth();
  const navigate = useNavigate();
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [stats, setStats] = useState<DashboardStats>({
    pending: 0,
    approved: 0,
    rejected: 0,
    availableDays: 0,
  });

  useEffect(() => {
    if (user?.id) {
      loadBalances();
    }
  }, [user?.id]);

  const loadBalances = async (): Promise<void> => {
    if (!user?.id) return;

    setLoading(true);
    const currentYear = new Date().getFullYear();
    const { data, error } = await getLeaveBalances(user.id, currentYear);

    if (error) {
      console.error('Error loading balances:', error);
    }

    if (data) {
      setBalances(data);
      // Calculate stats...
    }
    setLoading(false);
  };

  // ... rest of component
};
```

## Common Patterns

### 1. useState with Type
```typescript
const [loading, setLoading] = useState<boolean>(false);
const [user, setUser] = useState<UserProfile | null>(null);
const [requests, setRequests] = useState<LeaveRequest[]>([]);
```

### 2. Event Handlers
```typescript
const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
  e.preventDefault();
  // ...
};

const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
  const { name, value } = e.target;
  // ...
};

const handleClick = (e: React.MouseEvent<HTMLButtonElement>): void => {
  e.stopPropagation();
  // ...
};
```

### 3. Async Functions
```typescript
const loadData = async (): Promise<void> => {
  try {
    const { data, error } = await someService();
    if (error) throw error;
    setData(data);
  } catch (error) {
    console.error(error);
  }
};
```

### 4. Props Interface
```typescript
interface ComponentProps {
  title: string;
  onClose: () => void;
  optional?: boolean;
  children?: React.ReactNode;
}

export const Component = ({ title, onClose, optional, children }: ComponentProps) => {
  // ...
};
```

## Vite Configuration Update

Update `vite.config.js` → `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
```

## Update index.html

Change script reference:
```html
<script type="module" src="/src/main.tsx"></script>
```

## Testing Checklist

After each conversion:
- [ ] File compiles without errors
- [ ] No TypeScript warnings
- [ ] Component renders correctly
- [ ] All functionality works as before
- [ ] Props are properly typed
- [ ] Event handlers work correctly

## Common Issues & Solutions

### Issue 1: "Cannot find module"
**Solution**: Update import paths to use correct extensions (`.ts` or `.tsx`)

### Issue 2: "Type 'X' is not assignable to type 'Y'"
**Solution**: Add proper type assertions or update the type definition

### Issue 3: "Object is possibly 'null'"
**Solution**: Use optional chaining (`?.`) or null checks

### Issue 4: "Property 'X' does not exist on type 'Y'"
**Solution**: Add the property to the interface or use type assertion

### Issue 5: Supabase query types
**Solution**: Cast Supabase responses:
```typescript
const { data } = await supabase.from('table').select('*');
return data as MyType[];
```

## Automated Conversion Script

For bulk file renaming:
```powershell
# PowerShell script to rename all .jsx files to .tsx
Get-ChildItem -Path "src" -Filter "*.jsx" -Recurse | ForEach-Object {
    $newName = $_.FullName -replace '\.jsx$', '.tsx'
    Rename-Item $_.FullName $newName
}

# Rename .js service files to .ts
Get-ChildItem -Path "src/services" -Filter "*.js" | ForEach-Object {
    $newName = $_.FullName -replace '\.js$', '.ts'
    Rename-Item $_.FullName $newName
}
```

## Estimated Timeline

- **Phase 1 (Core)**: 2-3 hours
- **Phase 2 (Utilities)**: 1 hour
- **Phase 3 (Pages)**: 4-6 hours
- **Phase 4 (Admin)**: 4-5 hours
- **Phase 5 (App Entry)**: 30 minutes
- **Testing & Fixes**: 2-3 hours

**Total**: 14-18 hours

## Recommendation

Due to the scope (30+ files, 8000+ lines of code), consider:

1. **Incremental Approach**: Convert and test one section at a time
2. **Start with Services**: Get the foundation right first
3. **Keep JavaScript Running**: Enable `allowJs: true` in tsconfig.json during conversion
4. **Test Frequently**: Don't convert everything before testing

## Next Steps

1. ✅ Install TypeScript dependencies (DONE)
2. ✅ Create tsconfig.json (DONE)
3. ✅ Create types/index.ts (DONE)
4. 🚀 Start with Phase 1 (Core Infrastructure)
5. Continue through phases systematically
6. Fix any TypeScript errors as they appear
7. Test thoroughly before production deployment

This conversion improves:
- **Type Safety**: Catch errors at compile-time
- **Developer Experience**: Better autocomplete and IntelliSense
- **Code Quality**: Enforced interfaces and contracts
- **Maintainability**: Self-documenting code with types
- **Refactoring**: Safer code changes with type checking
