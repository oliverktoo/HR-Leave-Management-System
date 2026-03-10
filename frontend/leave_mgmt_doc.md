# Leave Management System
## Complete Technical & Business Documentation

---

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Overview](#system-overview)
3. [Technical Architecture](#technical-architecture)
4. [Database Design](#database-design)
5. [User Roles & Permissions](#user-roles--permissions)
6. [Core Features](#core-features)
7. [UI/UX Design](#uiux-design)
8. [Business Logic](#business-logic)
9. [Security & Compliance](#security--compliance)
10. [Deployment Strategy](#deployment-strategy)
11. [Implementation Roadmap](#implementation-roadmap)
12. [Appendices](#appendices)

---

## 1. Executive Summary

### 1.1 Purpose
A modern, automated leave management system designed to streamline leave requests, approvals, and balance tracking for organizations. The system replaces manual processes with a digital workflow that saves time, reduces errors, and improves employee satisfaction.

### 1.2 Key Benefits
- **For Employees**: Self-service portal, instant balance visibility, real-time status updates
- **For Managers**: Quick approval process, team calendar view, automated notifications
- **For HR**: Automated calculations, comprehensive reporting, policy enforcement
- **For Organization**: Cost savings, audit trails, compliance assurance

### 1.3 Technology Stack
- **Frontend**: React + Vite
- **Backend**: Supabase (PostgreSQL)
- **Hosting**: Netlify
- **Version Control**: GitHub
- **Email**: Supabase Edge Functions

### 1.4 Project Timeline
- **Phase 1-2**: 4 weeks (Foundation & Core Features)
- **Phase 3**: 2 weeks (Polish & Testing)
- **Phase 4**: 1 week (Deployment & Training)
- **Total**: 7 weeks to production

---

## 2. System Overview

### 2.1 Problem Statement
Organizations struggle with:
- Manual leave request processing via email/paper
- Difficulty tracking leave balances
- Delayed approvals affecting employee satisfaction
- Lack of centralized leave records
- Compliance and audit challenges
- Limited visibility into team availability

### 2.2 Solution
A cloud-based leave management system that:
- Automates the entire leave lifecycle
- Provides real-time balance tracking
- Enables instant approvals with notifications
- Maintains comprehensive audit trails
- Offers analytics and reporting capabilities
- Ensures mobile accessibility

### 2.3 System Capabilities

#### Core Functions
- Leave request submission and approval
- Balance calculation and tracking
- Email notifications
- Calendar management
- Document upload/storage
- Reporting and analytics

#### User Experience
- Intuitive interface requiring minimal training
- Mobile-responsive design
- Real-time updates
- Multi-language support (future)
- Dark mode option

#### Administration
- User management
- Policy configuration
- Department management
- System-wide settings

---

## 3. Technical Architecture

### 3.1 Architecture Pattern: Serverless JAMstack

```
┌─────────────┐
│   Browser   │
│  (User UI)  │
└──────┬──────┘
       │ HTTPS
       ▼
┌─────────────┐      ┌──────────────┐
│   Netlify   │      │    GitHub    │
│  (Hosting)  │◄─────┤ (CI/CD Repo) │
└──────┬──────┘      └──────────────┘
       │ API Calls
       ▼
┌─────────────────────────────────┐
│          Supabase               │
├─────────────────────────────────┤
│  • PostgreSQL Database          │
│  • Authentication (Auth.js)     │
│  • Storage (Documents)          │
│  • Edge Functions (Emails)      │
│  • Real-time Subscriptions      │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────┐
│Email Service│
│(SendGrid/   │
│ Resend)     │
└─────────────┘
```

### 3.2 Technology Justification

#### React + Vite
- **Fast Development**: Hot module replacement, instant feedback
- **Modern**: Supports latest JavaScript features
- **Optimized**: Tree-shaking, code splitting
- **Community**: Extensive ecosystem and libraries

#### Supabase
- **All-in-One**: Database, auth, storage, functions
- **PostgreSQL**: Robust, ACID-compliant database
- **Real-time**: Live updates without polling
- **Cost-Effective**: Generous free tier
- **Developer-Friendly**: Good documentation, SDKs

#### Netlify
- **Automatic Deployments**: Git-based workflow
- **CDN**: Global content delivery
- **SSL**: Free HTTPS certificates
- **Preview Deployments**: Test before production
- **Serverless Functions**: Additional compute when needed

#### GitHub
- **Version Control**: Complete code history
- **Collaboration**: Pull requests, code reviews
- **CI/CD**: Automated testing and deployment
- **Documentation**: Built-in wiki and issues

### 3.3 System Components

#### Frontend Components
```
/src
  /components
    /auth (Login, Register)
    /dashboard (Main dashboard)
    /leave-request (Request form wizard)
    /approvals (Approval interface)
    /calendar (Team calendar view)
    /reports (Analytics dashboards)
    /admin (Admin panels)
    /common (Buttons, cards, modals)
  /hooks (Custom React hooks)
  /utils (Helper functions)
  /services (API calls)
  /store (State management)
  /styles (CSS/Tailwind)
```

#### Backend Structure
```
/supabase
  /migrations (Database schema versions)
  /functions (Edge functions for emails)
  /seed (Sample data for testing)
```

---

### 10.3 Environment Configuration

#### Development Environment
```env
# .env.development
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_APP_URL=http://localhost:5173
VITE_ENVIRONMENT=development
```

#### Production Environment (Netlify)
```env
# Netlify Environment Variables
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_APP_URL=https://your-app.netlify.app
VITE_ENVIRONMENT=production
```

---

### 10.4 Deployment Checklist

#### Pre-Deployment
- [ ] All tests passing
- [ ] Code review completed
- [ ] Database migrations tested
- [ ] Environment variables configured
- [ ] SSL certificates valid
- [ ] Backup database
- [ ] Document deployment plan

#### Deployment Steps
1. **Database Migration**
   ```bash
   npx supabase db push
   ```

2. **Deploy Frontend**
   ```bash
   cd frontend
   npm run build
   netlify deploy --prod
   ```

3. **Deploy Edge Functions**
   ```bash
   npx supabase functions deploy send-email
   npx supabase functions deploy process-carryforward
   ```

4. **Verify Deployment**
   - [ ] Application accessible
   - [ ] Login functionality working
   - [ ] Database connections active
   - [ ] Email notifications sending

#### Post-Deployment
- [ ] Smoke test critical features
- [ ] Monitor error logs
- [ ] Check performance metrics
- [ ] Notify users of updates
- [ ] Update documentation

---

### 10.5 Rollback Strategy

#### Quick Rollback
```bash
# Rollback to previous Netlify deployment
netlify rollback

# Rollback database migration
npx supabase db reset
npx supabase db push --local
```

#### Recovery Plan
1. Identify issue
2. Stop incoming traffic (maintenance mode)
3. Rollback to last stable version
4. Restore database backup if needed
5. Verify system stability
6. Resume normal operations
7. Post-mortem analysis

---

### 10.6 Monitoring & Logging

#### Application Monitoring
```javascript
// Error tracking with Sentry (optional)
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.VITE_ENVIRONMENT,
  tracesSampleRate: 1.0,
});

// Log critical errors
function logError(error, context) {
  Sentry.captureException(error, {
    extra: context
  });
  console.error(error, context);
}
```

#### Performance Monitoring
```javascript
// Track page load times
window.addEventListener('load', () => {
  const timing = performance.timing;
  const pageLoadTime = timing.loadEventEnd - timing.navigationStart;
  
  // Log to analytics
  logMetric('page_load_time', pageLoadTime);
});

// Track API response times
async function apiCall(url, options) {
  const startTime = Date.now();
  
  try {
    const response = await fetch(url, options);
    const endTime = Date.now();
    
    logMetric('api_response_time', endTime - startTime, {
      endpoint: url,
      status: response.status
    });
    
    return response;
  } catch (error) {
    logError(error, { endpoint: url });
    throw error;
  }
}
```

#### Health Check Endpoint
```javascript
// Netlify Function: netlify/functions/health.js
export async function handler() {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: await checkDatabase(),
      storage: await checkStorage(),
      email: await checkEmail()
    }
  };
  
  const statusCode = health.services.database && 
                     health.services.storage && 
                     health.services.email ? 200 : 503;
  
  return {
    statusCode,
    body: JSON.stringify(health)
  };
}

async function checkDatabase() {
  try {
    const { data, error } = await supabase.from('users_profile').select('count');
    return !error;
  } catch {
    return false;
  }
}
```

---

## 11. Implementation Roadmap

### 11.1 Phase 1: Foundation (Weeks 1-2)

#### Week 1: Infrastructure Setup
**Day 1-2: Environment Setup**
- [ ] Create GitHub repository
- [ ] Initialize React + Vite project
- [ ] Setup Supabase project
- [ ] Configure Netlify deployment
- [ ] Create development branch structure

**Day 3-5: Database Implementation**
- [ ] Create database schema (users, departments, leave_types)
- [ ] Implement RLS policies
- [ ] Create database triggers
- [ ] Seed initial data (leave types, departments)
- [ ] Write migration files

**Day 6-7: Authentication**
- [ ] Setup Supabase Auth
- [ ] Create login/register pages
- [ ] Implement password reset
- [ ] Protected route wrapper
- [ ] User session management

**Deliverables:**
- Working authentication system
- Database fully configured
- CI/CD pipeline active

---

#### Week 2: Core Data Models
**Day 8-10: Leave Balance System**
- [ ] Leave balance table implementation
- [ ] Balance calculation functions
- [ ] Annual allocation logic
- [ ] Carryforward calculation
- [ ] Balance API endpoints

**Day 11-12: Request Foundation**
- [ ] Leave request table
- [ ] Request history table
- [ ] Public holidays table
- [ ] Notifications table
- [ ] Basic CRUD operations

**Day 13-14: Testing & Documentation**
- [ ] Unit tests for calculations
- [ ] Database integration tests
- [ ] API documentation
- [ ] Code review
- [ ] Bug fixes

**Deliverables:**
- Complete data layer
- All database tables functional
- Basic API endpoints working

---

### 11.2 Phase 2: Core Features (Weeks 3-4)

#### Week 3: Employee Interface
**Day 15-17: Dashboard**
- [ ] Dashboard layout
- [ ] Leave balance cards
- [ ] Recent requests list
- [ ] Quick action buttons
- [ ] Responsive design

**Day 18-19: Request Form**
- [ ] Multi-step wizard
- [ ] Date picker with validation
- [ ] Working days calculation
- [ ] Document upload
- [ ] Balance check integration

**Day 20-21: Request Management**
- [ ] View request history
- [ ] Cancel pending requests
- [ ] Request details page
- [ ] Status tracking
- [ ] Notification center

**Deliverables:**
- Complete employee workflow
- Functional leave request submission
- Request history viewing

---

#### Week 4: Approval System
**Day 22-24: HOD Interface**
- [ ] Approval dashboard
- [ ] Pending requests list
- [ ] Request review interface
- [ ] Approve/reject actions
- [ ] Comment system

**Day 25-26: Email Notifications**
- [ ] Supabase Edge Functions setup
- [ ] Email templates
- [ ] Notification triggers
- [ ] Email delivery service integration
- [ ] Testing email flow

**Day 27-28: Team Calendar**
- [ ] Calendar component
- [ ] Team leave visualization
- [ ] Conflict detection
- [ ] Filter and search
- [ ] Export functionality

**Deliverables:**
- Complete approval workflow
- Email notifications working
- Team calendar functional

---

### 11.3 Phase 3: Polish & Advanced Features (Weeks 5-6)

#### Week 5: HR Admin Features
**Day 29-30: User Management**
- [ ] User listing
- [ ] Add/edit users
- [ ] Department management
- [ ] Role assignment
- [ ] Bulk user import

**Day 31-32: Policy Configuration**
- [ ] Leave type management
- [ ] Policy settings
- [ ] Public holiday management
- [ ] System settings
- [ ] Email templates customization

**Day 33-34: Reporting & Analytics**
- [ ] Leave utilization reports
- [ ] Department analytics
- [ ] Export to CSV/PDF
- [ ] Custom date ranges
- [ ] Visual dashboards

**Deliverables:**
- Complete HR admin panel
- Reporting system functional
- System fully configurable

---

#### Week 6: Testing & Optimization
**Day 35-36: Comprehensive Testing**
- [ ] End-to-end testing
- [ ] User acceptance testing
- [ ] Performance optimization
- [ ] Mobile responsiveness
- [ ] Cross-browser testing

**Day 37-38: UI/UX Refinement**
- [ ] Animation polish
- [ ] Loading states
- [ ] Error handling
- [ ] Empty states
- [ ] Accessibility audit

**Day 39-40: Documentation**
- [ ] User guide
- [ ] Admin manual
- [ ] API documentation
- [ ] Video tutorials
- [ ] FAQ section

**Deliverables:**
- Production-ready application
- Complete documentation
- Training materials

---

### 11.4 Phase 4: Deployment & Launch (Week 7)

#### Week 7: Go Live
**Day 41-42: Pre-Production**
- [ ] Production environment setup
- [ ] Data migration from old system
- [ ] Security audit
- [ ] Performance testing
- [ ] Backup systems verified

**Day 43-44: Soft Launch**
- [ ] Deploy to production
- [ ] Pilot user group testing
- [ ] Monitor for issues
- [ ] Gather feedback
- [ ] Quick fixes

**Day 45-46: Full Launch**
- [ ] Organization-wide rollout
- [ ] User training sessions
- [ ] Support channel setup
- [ ] Monitor system performance
- [ ] Collect user feedback

**Day 47-49: Post-Launch Support**
- [ ] Bug fixes
- [ ] Performance optimization
- [ ] User support
- [ ] Documentation updates
- [ ] Feature requests gathering

**Deliverables:**
- Live production system
- Trained users
- Support infrastructure
- Success metrics tracked

---

### 11.5 Success Metrics

#### Technical KPIs
- **Uptime**: 99.9%
- **Page Load Time**: < 2 seconds
- **API Response Time**: < 500ms
- **Error Rate**: < 0.1%
- **Mobile Performance Score**: > 90

#### Business KPIs
- **Adoption Rate**: > 95% within 1 month
- **Average Approval Time**: < 24 hours
- **User Satisfaction**: > 4.5/5
- **Time Saved**: 70% reduction in processing time
- **Support Tickets**: < 5 per week

#### User Engagement
- **Daily Active Users**: Track trend
- **Requests per Month**: Monitor volume
- **Feature Utilization**: Track feature usage
- **Mobile vs Desktop**: Usage patterns
- **Peak Usage Times**: Optimize performance

---

## 12. Appendices

### 12.1 Glossary

**Annual Leave**: Paid time off for vacation or personal matters  
**Approval Workflow**: Process of reviewing and authorizing leave requests  
**Balance**: Number of available leave days  
**Carryforward**: Unused leave transferred to next year  
**Edge Functions**: Serverless functions running on CDN edge  
**HOD**: Head of Department - manager who approves team requests  
**JAMstack**: JavaScript, APIs, and Markup architecture  
**Pro-rated**: Proportionally calculated based on time period  
**RLS**: Row Level Security - database-level access control  
**Working Days**: Days excluding weekends and public holidays  

---

### 12.2 API Reference

#### Authentication Endpoints

**POST /auth/signup**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "employeeId": "EMP001",
  "departmentId": "uuid-here"
}

Response: 201 Created
{
  "user": { "id": "uuid", "email": "user@example.com" },
  "session": { "access_token": "jwt-token" }
}
```

**POST /auth/login**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}

Response: 200 OK
{
  "user": { "id": "uuid", "email": "user@example.com" },
  "session": { "access_token": "jwt-token" }
}
```

---

#### Leave Request Endpoints

**GET /leave-requests**
```
Query Parameters:
- status: pending | approved | rejected | cancelled
- start_date: ISO date
- end_date: ISO date
- user_id: UUID

Response: 200 OK
{
  "data": [
    {
      "id": "uuid",
      "leave_type": { "name": "Annual Leave" },
      "start_date": "2025-03-20",
      "end_date": "2025-03-24",
      "total_days": 5,
      "status": "pending",
      "reason": "Family vacation"
    }
  ]
}
```

**POST /leave-requests**
```json
{
  "leave_type_id": "uuid",
  "start_date": "2025-03-20",
  "end_date": "2025-03-24",
  "reason": "Family vacation",
  "document_url": "optional-url"
}

Response: 201 Created
{
  "id": "uuid",
  "status": "pending",
  "submitted_at": "2025-03-01T10:30:00Z"
}
```

**PATCH /leave-requests/:id**
```json
{
  "status": "approved",
  "reviewer_comments": "Approved. Enjoy your vacation!"
}

Response: 200 OK
{
  "id": "uuid",
  "status": "approved",
  "reviewed_at": "2025-03-01T14:30:00Z",
  "reviewed_by": "uuid"
}
```

---

#### Balance Endpoints

**GET /leave-balances/me**
```
Response: 200 OK
{
  "data": [
    {
      "leave_type": { "name": "Annual Leave", "color": "#10B981" },
      "year": 2025,
      "opening_balance": 5,
      "annual_allocation": 21,
      "used_days": 6,
      "pending_days": 5,
      "available_days": 15
    }
  ]
}
```

**GET /leave-balances/calculate**
```
Query Parameters:
- leave_type_id: UUID
- start_date: ISO date
- end_date: ISO date

Response: 200 OK
{
  "working_days": 5,
  "available_balance": 15,
  "sufficient": true
}
```

---

### 12.3 Database Backup Strategy

#### Automated Backups
```sql
-- Supabase provides automatic daily backups
-- Retention: 7 days (Free tier), 30 days (Pro tier)

-- Manual backup script
pg_dump -h db.your-project.supabase.co \
        -U postgres \
        -d postgres \
        -F c \
        -b \
        -v \
        -f backup_$(date +%Y%m%d).dump
```

#### Backup Schedule
- **Daily**: Automated full backup at 2 AM UTC
- **Weekly**: Manual verification backup on Sundays
- **Monthly**: Archive backup stored off-site
- **Pre-Deployment**: Manual backup before major releases

#### Restore Procedure
```bash
# Restore from backup
pg_restore -h db.your-project.supabase.co \
           -U postgres \
           -d postgres \
           -v backup_20250315.dump

# Verify restoration
psql -h db.your-project.supabase.co \
     -U postgres \
     -c "SELECT COUNT(*) FROM leave_requests;"
```

---

### 12.4 Troubleshooting Guide

#### Common Issues

**Issue: Users can't log in**
```
Symptoms: Login fails with invalid credentials
Solutions:
1. Verify Supabase URL and anon key are correct
2. Check RLS policies are enabled
3. Verify user exists in auth.users table
4. Check browser console for CORS errors
5. Clear browser cache and cookies
```

**Issue: Leave balance not updating**
```
Symptoms: Balance shows incorrect numbers
Solutions:
1. Check database triggers are active
2. Verify leave_balances table has correct data
3. Run manual balance recalculation
4. Check for failed transactions in logs
5. Verify working days calculation logic
```

**Issue: Email notifications not sending**
```
Symptoms: Users not receiving emails
Solutions:
1. Check Edge Function logs in Supabase
2. Verify email service API keys
3. Check spam/junk folders
4. Test email service independently
5. Verify notification records created in database
```

**Issue: Slow page loading**
```
Symptoms: Pages take > 3 seconds to load
Solutions:
1. Check database query performance
2. Add database indexes if missing
3. Implement pagination for large lists
4. Enable React.lazy() for code splitting
5. Optimize images and assets
6. Check Netlify CDN cache
```

---

### 12.5 FAQ

**Q: Can employees request half days?**  
A: Yes, the system supports half-day increments (0.5 days). Select the same date for start and end, and specify morning or afternoon in the reason field.

**Q: What happens to unused leave at year-end?**  
A: Depends on leave type policy. Annual leave typically carries forward up to a maximum (e.g., 5 days), while sick leave expires. The system automatically processes this on January 1st.

**Q: Can an employee cancel an approved leave?**  
A: Yes, but only if the start date hasn't passed. They must submit a cancellation request that requires re-approval from their manager.

**Q: How are public holidays handled?**  
A: Public holidays are excluded from leave calculations. If a public holiday falls within a leave period, it doesn't count against the employee's balance.

**Q: Can employees see their colleagues' leave?**  
A: Employees can only see their own data. Managers can see their team's data, and HR can see organization-wide data.

**Q: What if someone forgets to submit a leave request?**  
A: Managers can approve retrospective leave requests, but this should be documented. The system logs all such approvals for audit purposes.

**Q: How long are leave records retained?**  
A: Leave records are retained for 7 years to comply with employment law requirements. Older records are archived but not deleted.

**Q: Can the system handle multiple approvers?**  
A: Currently, requests require single approval from the direct manager. Multi-level approval can be added in Phase 2 if required.

---

### 12.6 Support & Training

#### Support Channels

**Tier 1: Self-Service**
- User guide and documentation
- Video tutorials
- FAQ section
- In-app help tooltips

**Tier 2: Email Support**
- Email: support@yourcompany.com
- Response time: 24 hours
- Available: Monday-Friday, 9 AM - 5 PM

**Tier 3: Phone/Chat Support**
- For urgent issues only
- Direct line to technical team
- Available: Business hours

**Tier 4: On-Site Support**
- For critical system failures
- Scheduled maintenance
- Training sessions

#### Training Materials

**Employee Training (30 minutes)**
1. System overview
2. How to check leave balance
3. Submitting a leave request
4. Tracking request status
5. Cancelling requests

**Manager Training (1 hour)**
1. Employee training content
2. Approval workflow
3. Team calendar usage
4. Handling special cases
5. Generating reports

**HR Admin Training (2 hours)**
1. Manager training content
2. User management
3. Policy configuration
4. System settings
5. Reporting and analytics
6. Year-end processing
7. Troubleshooting

---

### 12.7 Future Enhancements (Phase 2)

#### Mobile App
- Native iOS and Android apps
- Push notifications
- Offline support
- Biometric authentication

#### Advanced Features
- Multi-level approval workflow
- Leave delegation during absence
- Integration with payroll systems
- Integration with HRMS
- Calendar sync (Google/Outlook)
- Shift management for shift workers
- Leave swapping between employees
- AI-powered leave planning suggestions
- Sentiment analysis on rejection reasons

#### Reporting Enhancements
- Predictive analytics
- Custom report builder
- Scheduled automated reports
- Data visualization dashboards
- Export to multiple formats
- Real-time dashboards

#### Integration Capabilities
- Slack/Microsoft Teams integration
- SSO with Active Directory/LDAP
- API for third-party systems
- Webhook support
- Zapier integration

---

### 12.8 Cost Estimation

#### Development Costs (7 weeks)
- **Developer (Full-time)**: $7,000 - $14,000
- **Designer (Part-time)**: $1,500 - $3,000
- **QA Tester (Part-time)**: $1,000 - $2,000
- **Total Development**: $9,500 - $19,000

#### Infrastructure Costs (Annual)
- **Supabase Pro**: $25/month = $300/year
- **Netlify Pro**: $19/month = $228/year
- **Email Service (SendGrid)**: $15/month = $180/year
- **Domain & SSL**: $20/year
- **Monitoring (Sentry)**: $26/month = $312/year
- **Total Annual**: ~$1,040/year

#### For 100 employees:
- **Cost per employee per year**: ~$10.40
- **One-time development**: $95-$190 per employee
- **Total first year**: $105-$200 per employee

#### ROI Calculation
**Time Savings:**
- Manual processing: 15 minutes per request
- Automated: 2 minutes per request
- Savings: 13 minutes per request
- Average 200 requests/month
- **Total savings**: 43 hours/month
- **Cost savings**: ~$2,000/month (assuming $45/hour)
- **Annual savings**: ~$24,000

**ROI**: System pays for itself in first month!

---

### 12.9 Compliance & Legal

#### Data Protection
- GDPR compliant (EU)
- POPI Act compliant (South Africa)
- Data encryption at rest and in transit
- Regular security audits
- Privacy policy and terms of service

#### Employment Law
- Complies with local labor laws
- Audit trail for disputes
- 7-year record retention
- Fair leave allocation
- No discrimination in approval process

#### Standards
- ISO 27001 (Information Security)
- WCAG 2.1 AA (Accessibility)
- OWASP Top 10 (Security)
- SOC 2 Type II (Supabase compliance)

---

### 12.10 Contact Information

#### Project Team
**Product Owner**: HR Manager  
**Technical Lead**: [Your Name]  
**Supabase Support**: support@supabase.io  
**Netlify Support**: support@netlify.com  

#### Documentation
- **GitHub**: github.com/yourorg/leave-management
- **Supabase Docs**: docs.supabase.com
- **React Docs**: react.dev
- **Tailwind Docs**: tailwindcss.com

---

## Conclusion

This leave management system provides a comprehensive, modern solution for managing employee leave requests efficiently. Built on robust technologies (React, Supabase, Netlify), it offers:

✅ **Complete Automation** - From request to approval to balance updates  
✅ **User-Friendly** - Intuitive interface requiring minimal training  
✅ **Scalable** - Handles growing organizations effortlessly  
✅ **Secure** - Enterprise-grade security with RLS and encryption  
✅ **Cost-Effective** - Low infrastructure costs with high ROI  
✅ **Maintainable** - Clean architecture and comprehensive documentation  
✅ **Compliant** - Meets legal and regulatory requirements  

The 7-week implementation timeline provides a realistic roadmap from concept to production, with clearly defined phases and deliverables.

**Ready to revolutionize your leave management? Let's build it! 🚀**

---

**Document Version**: 1.0  
**Last Updated**: November 15, 2025  
**Prepared By**: HR Technology Consultant  
**Status**: Ready for Implementation

## 4. Database Design

### 4.1 Entity Relationship Diagram

```
┌──────────────┐         ┌──────────────┐
│ users_profile│─────────│ departments  │
│              │  n:1    │              │
│ • id         │         │ • id         │
│ • name       │         │ • name       │
│ • email      │         │ • hod_id     │
│ • dept_id    │         └──────────────┘
│ • role       │
│ • manager_id │
└───┬──────────┘
    │
    │ 1:n
    │
┌───▼──────────────┐      ┌──────────────┐
│ leave_balances   │  n:1 │ leave_types  │
│                  │──────│              │
│ • id             │      │ • id         │
│ • user_id        │      │ • name       │
│ • leave_type_id  │      │ • code       │
│ • year           │      │ • days/year  │
│ • opening_bal    │      └──────────────┘
│ • allocated      │
│ • used           │
│ • available      │
└──────────────────┘
    │
    │ Referenced by
    │
┌───▼──────────────────┐
│ leave_requests       │
│                      │
│ • id                 │
│ • user_id            │
│ • leave_type_id      │
│ • start_date         │
│ • end_date           │
│ • total_days         │
│ • status             │
│ • reviewed_by        │
│ • reason             │
└───┬──────────────────┘
    │
    │ 1:n
    │
┌───▼──────────────────────┐
│ leave_request_history    │
│                          │
│ • id                     │
│ • leave_request_id       │
│ • action                 │
│ • performed_by           │
│ • timestamp              │
└──────────────────────────┘
```

### 4.2 Table Schemas

#### users_profile
Stores employee information and links to authentication.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, FK→auth.users | User identifier |
| employee_id | TEXT | UNIQUE, NOT NULL | Employee number |
| first_name | TEXT | NOT NULL | First name |
| last_name | TEXT | NOT NULL | Last name |
| email | TEXT | UNIQUE, NOT NULL | Email address |
| department_id | UUID | FK→departments | Department |
| role | ENUM | NOT NULL | employee/hod/hr_admin |
| hire_date | DATE | NOT NULL | Date of joining |
| manager_id | UUID | FK→users_profile | Direct manager |
| is_active | BOOLEAN | DEFAULT true | Account status |
| created_at | TIMESTAMP | DEFAULT now() | Creation time |
| updated_at | TIMESTAMP | DEFAULT now() | Last update |

**Indexes**:
- `idx_users_email` on email
- `idx_users_dept` on department_id
- `idx_users_manager` on manager_id

---

#### departments
Organizational structure.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Department ID |
| name | TEXT | UNIQUE, NOT NULL | Department name |
| code | TEXT | UNIQUE, NOT NULL | Short code (e.g., "IT") |
| hod_id | UUID | FK→users_profile | Head of department |
| created_at | TIMESTAMP | DEFAULT now() | Creation time |

---

#### leave_types
Configurable leave categories.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Leave type ID |
| name | TEXT | NOT NULL | Display name |
| code | TEXT | UNIQUE, NOT NULL | Unique code |
| description | TEXT | | Detailed description |
| default_days_per_year | INTEGER | NOT NULL | Annual allocation |
| requires_document | BOOLEAN | DEFAULT false | Attachment required |
| is_carried_forward | BOOLEAN | DEFAULT false | Allow carryforward |
| max_carryforward_days | INTEGER | | Maximum days to carry |
| color_code | TEXT | | Hex color for UI |
| is_active | BOOLEAN | DEFAULT true | Enabled status |

**Default Leave Types**:
- Annual Leave (AL): 21 days, carryforward 5 days
- Sick Leave (SL): 10 days, no carryforward
- Compassionate Leave (CL): 5 days, no carryforward
- Maternity Leave (ML): 90 days, requires document
- Paternity Leave (PL): 14 days, requires document

---

#### leave_balances
Tracks available leave per employee, type, and year.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Balance ID |
| user_id | UUID | FK→users_profile | Employee |
| leave_type_id | UUID | FK→leave_types | Leave type |
| year | INTEGER | NOT NULL | Calendar year |
| opening_balance | DECIMAL(5,2) | DEFAULT 0 | Carried forward |
| annual_allocation | DECIMAL(5,2) | NOT NULL | This year's days |
| used_days | DECIMAL(5,2) | DEFAULT 0 | Approved leaves |
| pending_days | DECIMAL(5,2) | DEFAULT 0 | In pending requests |
| available_days | DECIMAL(5,2) | COMPUTED | Auto-calculated |
| created_at | TIMESTAMP | DEFAULT now() | Creation time |
| updated_at | TIMESTAMP | DEFAULT now() | Last update |

**Computed Field**:
```sql
available_days = opening_balance + annual_allocation - used_days - pending_days
```

**Unique Constraint**: (user_id, leave_type_id, year)

---

#### leave_requests
Individual leave applications.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Request ID |
| user_id | UUID | FK→users_profile | Applicant |
| leave_type_id | UUID | FK→leave_types | Leave type |
| start_date | DATE | NOT NULL | First day |
| end_date | DATE | NOT NULL | Last day |
| total_days | DECIMAL(4,2) | NOT NULL | Working days |
| reason | TEXT | NOT NULL | Justification |
| document_url | TEXT | | Supabase Storage URL |
| status | ENUM | DEFAULT 'pending' | pending/approved/rejected/cancelled |
| submitted_at | TIMESTAMP | DEFAULT now() | Submission time |
| reviewed_at | TIMESTAMP | | Review time |
| reviewed_by | UUID | FK→users_profile | Approver |
| reviewer_comments | TEXT | | Approval notes |
| created_at | TIMESTAMP | DEFAULT now() | Creation time |
| updated_at | TIMESTAMP | DEFAULT now() | Last update |

**Indexes**:
- `idx_requests_user_status` on (user_id, status)
- `idx_requests_dates` on (start_date, end_date)
- `idx_requests_reviewer` on reviewed_by

**Check Constraints**:
- `end_date >= start_date`
- `total_days > 0`

---

#### leave_request_history
Audit trail for all request changes.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | History ID |
| leave_request_id | UUID | FK→leave_requests | Request |
| action | ENUM | NOT NULL | submitted/approved/rejected/cancelled |
| performed_by | UUID | FK→users_profile | Actor |
| comments | TEXT | | Action notes |
| timestamp | TIMESTAMP | DEFAULT now() | Action time |

**Index**: `idx_history_request` on leave_request_id

---

#### public_holidays
Organization-wide non-working days.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Holiday ID |
| name | TEXT | NOT NULL | Holiday name |
| date | DATE | NOT NULL | Holiday date |
| is_recurring | BOOLEAN | DEFAULT false | Annual repeat |
| created_at | TIMESTAMP | DEFAULT now() | Creation time |

**Example Data**:
- New Year's Day: 2025-01-01
- Jamhuri Day: 2025-12-12
- Christmas Day: 2025-12-25

---

#### notifications
In-app notification center.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Notification ID |
| user_id | UUID | FK→users_profile | Recipient |
| type | TEXT | NOT NULL | Notification category |
| title | TEXT | NOT NULL | Heading |
| message | TEXT | NOT NULL | Content |
| is_read | BOOLEAN | DEFAULT false | Read status |
| related_request_id | UUID | FK→leave_requests | Context link |
| created_at | TIMESTAMP | DEFAULT now() | Creation time |

**Index**: `idx_notifications_user_unread` on (user_id, is_read)

---

### 4.3 Database Triggers

#### Auto-update leave_balances
```sql
CREATE OR REPLACE FUNCTION update_leave_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    -- Move pending to used
    UPDATE leave_balances
    SET used_days = used_days + NEW.total_days,
        pending_days = pending_days - NEW.total_days
    WHERE user_id = NEW.user_id 
      AND leave_type_id = NEW.leave_type_id
      AND year = EXTRACT(YEAR FROM NEW.start_date);
      
  ELSIF NEW.status = 'pending' AND OLD.status IS NULL THEN
    -- Add to pending
    UPDATE leave_balances
    SET pending_days = pending_days + NEW.total_days
    WHERE user_id = NEW.user_id 
      AND leave_type_id = NEW.leave_type_id
      AND year = EXTRACT(YEAR FROM NEW.start_date);
      
  ELSIF NEW.status = 'rejected' AND OLD.status = 'pending' THEN
    -- Remove from pending
    UPDATE leave_balances
    SET pending_days = pending_days - NEW.total_days
    WHERE user_id = NEW.user_id 
      AND leave_type_id = NEW.leave_type_id
      AND year = EXTRACT(YEAR FROM NEW.start_date);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_balance
AFTER INSERT OR UPDATE OF status ON leave_requests
FOR EACH ROW
EXECUTE FUNCTION update_leave_balance();
```

#### Log history on status change
```sql
CREATE OR REPLACE FUNCTION log_request_history()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO leave_request_history (
    leave_request_id,
    action,
    performed_by,
    comments
  ) VALUES (
    NEW.id,
    NEW.status,
    COALESCE(NEW.reviewed_by, NEW.user_id),
    NEW.reviewer_comments
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_history
AFTER INSERT OR UPDATE OF status ON leave_requests
FOR EACH ROW
EXECUTE FUNCTION log_request_history();
```

---

## 5. User Roles & Permissions

### 5.1 Role Definitions

#### Employee (Standard User)
**Capabilities**:
- ✅ View personal leave balances
- ✅ Submit leave requests
- ✅ View own request history
- ✅ Upload supporting documents
- ✅ Cancel pending requests
- ✅ Receive notifications
- ❌ View other employees' data
- ❌ Approve/reject requests

**Use Cases**:
- Check available leave days before planning vacation
- Submit leave request with reason
- Track approval status
- Download leave history for records

---

#### Head of Department (HOD)
**Inherits**: All Employee capabilities

**Additional Capabilities**:
- ✅ View team members' requests
- ✅ Approve/reject leave requests
- ✅ Add comments to decisions
- ✅ View department leave calendar
- ✅ Generate team reports
- ✅ Receive approval notifications
- ❌ Modify system settings
- ❌ Manage users

**Use Cases**:
- Review and approve team leave requests
- Check team availability before approving
- Ensure adequate coverage
- Track team leave patterns

---

#### HR Admin (Super User)
**Inherits**: All HOD capabilities

**Additional Capabilities**:
- ✅ Manage all users and departments
- ✅ Configure leave types and policies
- ✅ Set annual allocations
- ✅ Process carryforward at year-end
- ✅ Generate organization-wide reports
- ✅ Export data for payroll
- ✅ Manage public holidays
- ✅ View audit trails
- ✅ Override system decisions (with logging)

**Use Cases**:
- Onboard new employees
- Configure leave policies
- Generate compliance reports
- Resolve disputes or exceptions

---

### 5.2 Permission Matrix

| Feature | Employee | HOD | HR Admin |
|---------|----------|-----|----------|
| View own balance | ✅ | ✅ | ✅ |
| Submit request | ✅ | ✅ | ✅ |
| View own history | ✅ | ✅ | ✅ |
| View team data | ❌ | ✅ | ✅ |
| Approve requests | ❌ | ✅ (team only) | ✅ (all) |
| Manage users | ❌ | ❌ | ✅ |
| Configure policies | ❌ | ❌ | ✅ |
| System reports | ❌ | ✅ (team) | ✅ (all) |
| Audit logs | ❌ | ❌ | ✅ |

---

### 5.3 Row Level Security (RLS) Policies

Supabase RLS ensures database-level security.

#### Policy: Employees see own data
```sql
CREATE POLICY "employee_own_data" ON leave_requests
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
```

#### Policy: HODs see department data
```sql
CREATE POLICY "hod_department_data" ON leave_requests
FOR SELECT
TO authenticated
USING (
  user_id IN (
    SELECT id FROM users_profile 
    WHERE department_id = (
      SELECT department_id FROM users_profile 
      WHERE id = auth.uid()
    )
  ) AND
  EXISTS (
    SELECT 1 FROM users_profile
    WHERE id = auth.uid() AND role IN ('hod', 'hr_admin')
  )
);
```

#### Policy: Only HOD/HR can approve
```sql
CREATE POLICY "hod_approve" ON leave_requests
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile
    WHERE id = auth.uid() AND role IN ('hod', 'hr_admin')
  )
)
WITH CHECK (
  status IN ('approved', 'rejected')
);
```

#### Policy: HR sees everything
```sql
CREATE POLICY "hr_all_data" ON leave_requests
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile
    WHERE id = auth.uid() AND role = 'hr_admin'
  )
);
```

---

## 6. Core Features

### 6.1 Leave Request Submission

#### Workflow
1. **Select Leave Type**: Visual card selection
2. **Choose Dates**: Calendar picker with validations
3. **Calculate Days**: Auto-compute working days
4. **Check Balance**: Real-time balance check
5. **Add Reason**: Text explanation
6. **Attach Document**: Optional file upload
7. **Review**: Summary before submission
8. **Submit**: Creates request + notification

#### Validations
- ✅ Sufficient balance available
- ✅ No overlapping requests
- ✅ Start date < End date
- ✅ Not requesting past dates
- ✅ Required fields completed
- ✅ Document attached if required
- ✅ No requests during probation (if policy)

#### Calendar Logic
```javascript
function calculateWorkingDays(startDate, endDate, holidays) {
  let workingDays = 0;
  let currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sun, Sat
    const isHoliday = holidays.some(h => 
      h.date.toDateString() === currentDate.toDateString()
    );
    
    if (!isWeekend && !isHoliday) {
      workingDays++;
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return workingDays;
}
```

---

### 6.2 Approval Workflow

#### HOD Dashboard
```
Pending Requests (Sorted by submission date)
├── Urgent Flags (< 3 days notice)
├── Request Details
│   ├── Employee info
│   ├── Leave type & dates
│   ├── Reason
│   ├── Current balance
│   └── Team calendar context
└── Actions
    ├── Approve (with optional comment)
    ├── Reject (with required reason)
    └── Request more info
```

#### Decision Factors Displayed
- Employee's current balance
- Team members on leave during same period
- Previous approval patterns
- Time since submission
- Business critical dates

#### Approval Actions
```javascript
async function approveLeaveRequest(requestId, comments, approverUserId) {
  // 1. Update request status
  const { data, error } = await supabase
    .from('leave_requests')
    .update({
      status: 'approved',
      reviewed_at: new Date(),
      reviewed_by: approverUserId,
      reviewer_comments: comments
    })
    .eq('id', requestId);
  
  // 2. Trigger updates balance (via database trigger)
  
  // 3. Send notifications
  await sendApprovalEmail(requestId);
  await createNotification(requestId, 'approved');
  
  // 4. Log history (via database trigger)
  
  return { success: true };
}
```

---

### 6.3 Balance Management

#### Annual Allocation Process
```sql
-- Run at start of each year
INSERT INTO leave_balances (
  user_id,
  leave_type_id,
  year,
  opening_balance,
  annual_allocation
)
SELECT 
  u.id,
  lt.id,
  2025,
  COALESCE(
    CASE 
      WHEN lt.is_carried_forward THEN 
        LEAST(
          lb_prev.available_days, 
          lt.max_carryforward_days
        )
      ELSE 0
    END,
    0
  ) AS opening_balance,
  lt.default_days_per_year
FROM users_profile u
CROSS JOIN leave_types lt
LEFT JOIN leave_balances lb_prev 
  ON lb_prev.user_id = u.id 
  AND lb_prev.leave_type_id = lt.id 
  AND lb_prev.year = 2024
WHERE u.is_active = true
  AND lt.is_active = true;
```

#### Real-time Balance Calculation
```javascript
function calculateAvailableBalance(balanceRecord) {
  return (
    balanceRecord.opening_balance +
    balanceRecord.annual_allocation -
    balanceRecord.used_days -
    balanceRecord.pending_days
  );
}
```

#### Negative Balance Prevention
```javascript
async function validateSufficientBalance(userId, leaveTypeId, daysRequested) {
  const { data: balance } = await supabase
    .from('leave_balances')
    .select('*')
    .eq('user_id', userId)
    .eq('leave_type_id', leaveTypeId)
    .eq('year', new Date().getFullYear())
    .single();
  
  const available = calculateAvailableBalance(balance);
  
  if (available < daysRequested) {
    throw new Error(
      `Insufficient balance. Available: ${available}, Requested: ${daysRequested}`
    );
  }
  
  return true;
}
```

---

### 6.4 Notification System

#### Email Templates

**1. Request Submitted (to HOD)**
```html
Subject: [ACTION REQUIRED] Leave Request - [Employee Name]

<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; }
    .header { background: #4F46E5; color: white; padding: 20px; }
    .content { padding: 20px; }
    .details { background: #f3f4f6; padding: 15px; margin: 15px 0; }
    .button { 
      display: inline-block; 
      padding: 12px 24px; 
      background: #10B981; 
      color: white; 
      text-decoration: none;
      border-radius: 5px;
      margin: 5px;
    }
    .button.reject { background: #EF4444; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Leave Request Pending Approval</h2>
    </div>
    <div class="content">
      <p>Hi [HOD Name],</p>
      <p><strong>[Employee Name]</strong> has submitted a leave request requiring your approval:</p>
      
      <div class="details">
        <p><strong>Leave Type:</strong> [Leave Type]</p>
        <p><strong>Duration:</strong> [Start Date] to [End Date]</p>
        <p><strong>Total Days:</strong> [X] working days</p>
        <p><strong>Reason:</strong> [Reason]</p>
        <p><strong>Current Balance:</strong> [X] days available</p>
        <p><strong>Submitted:</strong> [Timestamp]</p>
      </div>
      
      <p><strong>Team Impact:</strong></p>
      <ul>
        <li>[Team member names] will also be on leave during this period</li>
      </ul>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="[Approve URL]" class="button">✅ Approve Request</a>
        <a href="[Reject URL]" class="button reject">❌ Reject Request</a>
      </div>
      
      <p style="color: #6b7280; font-size: 14px;">
        Or login to your dashboard: <a href="[Dashboard URL]">[Dashboard URL]</a>
      </p>
    </div>
  </div>
</body>
</html>
```

**2. Request Approved (to Employee)**
```html
Subject: ✅ Your Leave Request Has Been Approved

<!DOCTYPE html>
<html>
<body>
  <div class="container">
    <div class="header" style="background: #10B981;">
      <h2>Leave Request Approved!</h2>
    </div>
    <div class="content">
      <p>Hi [Employee Name],</p>
      <p>Good news! Your leave request has been approved.</p>
      
      <div class="details">
        <p><strong>Leave Type:</strong> [Leave Type]</p>
        <p><strong>Dates:</strong> [Start Date] to [End Date]</p>
        <p><strong>Total Days:</strong> [X] working days</p>
        <p><strong>New Balance:</strong> [X] days remaining</p>
      </div>
      
      <p><strong>Approved By:</strong> [HOD Name]</p>
      <p><strong>Comments:</strong> [Comments if any]</p>
      
      <p style="margin-top: 30px;">Enjoy your time off! 🎉</p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="[Details URL]" class="button">View Full Details</a>
      </div>
    </div>
  </div>
</body>
</html>
```

**3. Request Rejected (to Employee)**
```html
Subject: ❌ Leave Request Update

<!-- Similar structure with rejection details -->
```

#### In-App Notifications
```javascript
// Create notification on leave status change
async function createNotification(leaveRequestId, status) {
  const { data: request } = await supabase
    .from('leave_requests')
    .select('*, users_profile(*), leave_types(*)')
    .eq('id', leaveRequestId)
    .single();
  
  let title, message;
  
  if (status === 'approved') {
    title = 'Leave Request Approved';
    message = `Your ${request.leave_types.name} request for ${request.total_days} days has been approved.`;
  } else if (status === 'rejected') {
    title = 'Leave Request Rejected';
    message = `Your leave request has been declined. Reason: ${request.reviewer_comments}`;
  } else if (status === 'pending') {
    title = 'New Leave Request';
    message = `${request.users_profile.first_name} has submitted a leave request for your approval.`;
  }
  
  await supabase.from('notifications').insert({
    user_id: request.user_id,
    type: status,
    title: title,
    message: message,
    related_request_id: leaveRequestId,
    is_read: false
  });
}
```

#### Notification Triggers
- Request submitted → Notify HOD
- Request approved → Notify employee + HR
- Request rejected → Notify employee
- Request cancelled → Notify HOD + HR
- Pending > 48 hours → Reminder to HOD
- Balance low → Alert employee (< 5 days)
- Year-end → Carryforward reminder

---

### 6.5 Calendar & Timeline View

#### Team Calendar Features
- Visual timeline showing all team leaves
- Color-coded by leave type
- Filter by department, date range, status
- Conflict detection highlights
- Export to iCal/Google Calendar

#### Implementation Concept
```javascript
function TeamCalendar({ departmentId, month, year }) {
  const [leaveRequests, setLeaveRequests] = useState([]);
  
  useEffect(() => {
    // Fetch approved leaves for department
    async function fetchLeaves() {
      const { data } = await supabase
        .from('leave_requests')
        .select(`
          *,
          users_profile(first_name, last_name),
          leave_types(name, color_code)
        `)
        .eq('status', 'approved')
        .gte('start_date', `${year}-${month}-01`)
        .lte('end_date', `${year}-${month}-31`)
        .in('user_id', departmentUserIds);
      
      setLeaveRequests(data);
    }
    
    fetchLeaves();
  }, [departmentId, month, year]);
  
  return (
    <div className="calendar-grid">
      {/* Render calendar with leave blocks */}
    </div>
  );
}
```

---

### 6.6 Reporting & Analytics

#### Standard Reports

**1. Leave Utilization Report**
- Total leaves taken vs. allocated
- By department, employee, leave type
- Trend analysis (monthly/quarterly)
- Graphical dashboard

**2. Leave Balance Report**
- Current balances for all employees
- Projected year-end balances
- Expiring leaves (carryforward limits)
- Export to CSV/Excel

**3. Approval Analytics**
- Average approval time
- Approval/rejection rates
- Pending requests aging
- HOD performance metrics

**4. Compliance Report**
- Audit trail of all changes
- Policy violations
- Document verification status
- Legal requirements tracking

#### Sample Query: Department Utilization
```sql
SELECT 
  d.name AS department,
  lt.name AS leave_type,
  COUNT(lr.id) AS total_requests,
  SUM(lr.total_days) AS days_taken,
  AVG(lb.annual_allocation) AS avg_allocation,
  ROUND(
    (SUM(lr.total_days) / AVG(lb.annual_allocation)) * 100, 
    2
  ) AS utilization_percentage
FROM departments d
LEFT JOIN users_profile u ON u.department_id = d.id
LEFT JOIN leave_requests lr ON lr.user_id = u.id 
  AND lr.status = 'approved'
  AND EXTRACT(YEAR FROM lr.start_date) = 2025
LEFT JOIN leave_types lt ON lr.leave_type_id = lt.id
LEFT JOIN leave_balances lb ON lb.user_id = u.id 
  AND lb.leave_type_id = lt.id 
  AND lb.year = 2025
GROUP BY d.name, lt.name
ORDER BY d.name, lt.name;
```

---

## 7. UI/UX Design

### 7.1 Design Principles

#### Clarity
- Clear visual hierarchy
- Consistent terminology
- Obvious call-to-actions
- Minimal cognitive load

#### Efficiency
- Maximum 3 clicks to any feature
- Smart defaults and auto-fill
- Keyboard shortcuts
- Quick actions available

#### Accessibility
- WCAG 2.1 AA compliant
- High contrast ratios
- Screen reader compatible
- Keyboard navigation
- Responsive text sizing

#### Delight
- Smooth animations
- Positive feedback
- Celebratory moments (approvals)
- Empty state illustrations

---

### 7.2 Color System

#### Primary Palette
```
Primary Blue:    #4F46E5 (Indigo-600)
├─ Light:        #818CF8 (Indigo-400)
└─ Dark:         #3730A3 (Indigo-700)

Success Green:   #10B981 (Emerald-500)
Warning Amber:   #F59E0B (Amber-500)
Danger Red:      #EF4444 (Red-500)
Info Sky:        #0EA5E9 (Sky-500)

Neutrals:
├─ Gray-50:      #F9FAFB (Backgrounds)
├─ Gray-200:     #E5E7EB (Borders)
├─ Gray-500:     #6B7280 (Secondary text)
└─ Gray-900:     #111827 (Primary text)
```

#### Leave Type Colors
```
Annual Leave:       #10B981 (Green)
Sick Leave:         #F59E0B (Amber)
Maternity:          #EC4899 (Pink)
Paternity:          #3B82F6 (Blue)
Compassionate:      #8B5CF6 (Purple)
Study Leave:        #14B8A6 (Teal)
```

---

### 7.3 Component Library

#### Buttons
```jsx
// Primary Action
<Button variant="primary" size="lg">
  Submit Request
</Button>

// Secondary Action
<Button variant="outline" size="md">
  Cancel
</Button>

// Danger Action
<Button variant="danger" size="md">
  Reject Request
</Button>
```

#### Cards
```jsx
// Leave Balance Card
<Card className="bg-gradient-to-br from-blue-500 to-blue-600">
  <CardHeader>
    <Icon name="calendar" />
    <Title>Annual Leave</Title>
  </CardHeader>
  <CardBody>
    <LargeNumber>15</LargeNumber>
    <Label>days available</Label>
  </CardBody>
  <CardFooter>
    <Link to="/request">Request Leave →</Link>
  </CardFooter>
</Card>
```

#### Status Badges
```jsx
<Badge status="pending">⏱️ Pending</Badge>
<Badge status="approved">✅ Approved</Badge>
<Badge status="rejected">❌ Rejected</Badge>
```

---

### 7.4 Page Layouts

#### Dashboard Layout
```
┌─────────────────────────────────────────────────────────┐
│  [Logo]  Leave Management    [Search] [Notifications] [Profile▼] │
├──────┬──────────────────────────────────────────────────┤
│      │  Welcome back, John Doe! 👋                     │
│ NAV  │                                                  │
│      │  ┌─────────────┐  ┌─────────────┐              │
│ 🏠   │  │ Annual Leave│  │  Sick Leave │              │
│ 📝   │  │   15 days   │  │   8 days    │              │
│ ✅   │  │  available  │  │  available  │              │
│ 📊   │  └─────────────┘  └─────────────┘              │
│ ⚙️   │                                                  │
│      │  📋 Recent Requests                             │
│      │  ┌────────────────────────────────────────┐    │
│      │  │ Mar 15-19 • Annual • Pending  ⏱️       │    │
│      │  │ Feb 10-11 • Sick   • Approved ✅       │    │
│      │  └────────────────────────────────────────┘    │
│      │                                                  │
│      │  [+ New Leave Request]                          │
└──────┴──────────────────────────────────────────────────┘
```

#### Leave Request Form (Wizard)
```
Step 1: Select Leave Type
┌─────────────────────────────────────────┐
│  Choose your leave type:                │
│                                          │
│  [ Annual Leave  ]  [ Sick Leave    ]   │
│  [ Maternity     ]  [ Paternity     ]   │
│  [ Compassionate ]  [ Study Leave   ]   │
│                                          │
│  [Cancel]              [Next Step →]    │
└─────────────────────────────────────────┘

Step 2: Select Dates
┌─────────────────────────────────────────┐
│  When do you need leave?                │
│                                          │
│  Start Date:  [📅 Mar 15, 2025 ▼]      │
│  End Date:    [📅 Mar 19, 2025 ▼]      │
│                                          │
│  📊 Working Days: 5 days                │
│  ⚠️ Note: Mar 17 is a public holiday    │
│                                          │
│  [← Back]              [Next Step →]    │
└─────────────────────────────────────────┘

Step 3: Provide Details
┌─────────────────────────────────────────┐
│  Tell us more about your request        │
│                                          │
│  Reason: ┌───────────────────────────┐ │
│          │ Family vacation           │ │
│          │                           │ │
│          └───────────────────────────┘ │
│                                          │
│  Attachment: [📎 Upload Document]       │
│  (Optional)                             │
│                                          │
│  [← Back]              [Next Step →]    │
└─────────────────────────────────────────┘

Step 4: Review & Submit
┌─────────────────────────────────────────┐
│  Review your request                     │
│                                          │
│  ✓ Annual Leave                         │
│  ✓ March 15-19, 2025 (5 days)          │
│  ✓ Reason: Family vacation              │
│                                          │
│  📊 Balance Impact:                     │
│  Current: 15 days                       │
│  After:   10 days                       │
│                                          │
│  ⚠️ This will be sent to Jane Smith     │
│     (Head of Department) for approval   │
│                                          │
│  [← Back]              [Submit Request] │
└─────────────────────────────────────────┘
```

#### Approval Interface (HOD)
```
┌─────────────────────────────────────────────────────────┐
│  Pending Approvals (3)        [Filter ▼] [Sort ▼]      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 🔴 URGENT - Less than 3 days notice              │  │
│  │                                                   │  │
│  │ John Doe                           Submitted 2h ago│  │
│  │ Annual Leave • Mar 20-24, 2025 • 5 days         │  │
│  │                                                   │  │
│  │ "Family emergency - need to travel home"        │  │
│  │                                                   │  │
│  │ 💼 Balance: 15 days available                    │  │
│  │ 👥 Team Impact: 2 others on leave same period   │  │
│  │ 📅 Previous leaves: 3 this year                  │  │
│  │                                                   │  │
│  │ Comments: ┌─────────────────────────────────┐   │  │
│  │           │ (Optional feedback)             │   │  │
│  │           └─────────────────────────────────┘   │  │
│  │                                                   │  │
│  │  [❌ Reject]  [View Details]  [✅ Approve]       │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Jane Smith                        Submitted 1d ago│  │
│  │ Sick Leave • Mar 18-19, 2025 • 2 days           │  │
│  │ ...                                               │  │
└─────────────────────────────────────────────────────────┘
```

---

### 7.5 Responsive Design

#### Breakpoints
```css
/* Mobile First */
.container {
  padding: 1rem;
}

/* Tablet: 641px+ */
@media (min-width: 641px) {
  .container {
    padding: 2rem;
  }
  .sidebar {
    display: block;
  }
}

/* Desktop: 1025px+ */
@media (min-width: 1025px) {
  .container {
    max-width: 1280px;
    margin: 0 auto;
  }
  .grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
```

#### Mobile Navigation
```
Mobile: Hamburger menu → Slide-out drawer
Tablet: Collapsed sidebar with icons
Desktop: Full sidebar with labels
```

---

### 7.6 Animations & Micro-interactions

#### Transitions
```css
/* Smooth transitions */
.button {
  transition: all 0.2s ease-in-out;
}

.button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

/* Card entrance */
.card {
  animation: fadeInUp 0.4s ease-out;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

#### Loading States
```jsx
<Skeleton className="h-24 w-full" /> // While loading
<Spinner size="lg" /> // Processing
<ProgressBar value={60} /> // Multi-step forms
```

#### Success Celebrations
```jsx
// After approval
<Confetti numberOfPieces={200} recycle={false} />
<SuccessAnimation icon="✅" />
```

---

## 8. Business Logic

### 8.1 Leave Calculation Rules

#### Working Days Calculation
```javascript
function calculateWorkingDays(startDate, endDate, publicHolidays, weekendDays = [0, 6]) {
  let workingDays = 0;
  let currentDate = new Date(startDate);
  const end = new Date(endDate);
  
  while (currentDate <= end) {
    const dayOfWeek = currentDate.getDay();
    const dateString = currentDate.toISOString().split('T')[0];
    
    const isWeekend = weekendDays.includes(dayOfWeek);
    const isPublicHoliday = publicHolidays.some(h => h.date === dateString);
    
    if (!isWeekend && !isPublicHoliday) {
      workingDays++;
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return workingDays;
}
```

#### Half-Day Support
```javascript
// If employee wants half day (e.g., morning only)
function calculateHalfDay(date, period) {
  // period: 'morning' or 'afternoon'
  return {
    date: date,
    days: 0.5,
    period: period
  };
}
```

---

### 8.2 Validation Rules

#### Minimum Notice Period
```javascript
function validateNoticePeried(leaveType, startDate) {
  const today = new Date();
  const start = new Date(startDate);
  const daysDifference = Math.ceil((start - today) / (1000 * 60 * 60 * 24));
  
  const minimumNotice = {
    'annual': 7,      // 1 week
    'sick': 0,        // No minimum (can be same day)
    'maternity': 30,  // 1 month
    'paternity': 14   // 2 weeks
  };
  
  if (daysDifference < minimumNotice[leaveType]) {
    return {
      valid: false,
      message: `${leaveType} requires at least ${minimumNotice[leaveType]} days notice`
    };
  }
  
  return { valid: true };
}
```

#### Overlap Detection
```javascript
async function checkOverlappingRequests(userId, startDate, endDate) {
  const { data: overlapping } = await supabase
    .from('leave_requests')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['pending', 'approved'])
    .or(`start_date.lte.${endDate},end_date.gte.${startDate}`);
  
  if (overlapping && overlapping.length > 0) {
    return {
      hasOverlap: true,
      conflicts: overlapping
    };
  }
  
  return { hasOverlap: false };
}
```

#### Maximum Consecutive Days
```javascript
function validateMaxConsecutiveDays(leaveType, totalDays) {
  const maxConsecutive = {
    'annual': 21,      // Max 3 weeks at once
    'sick': 5,         // Max 1 week without medical cert
    'study': 10        // Max 2 weeks
  };
  
  if (totalDays > (maxConsecutive[leaveType] || Infinity)) {
    return {
      valid: false,
      message: `Maximum ${maxConsecutive[leaveType]} consecutive days for ${leaveType}`
    };
  }
  
  return { valid: true };
}
```

---

### 8.3 Year-End Processing

#### Carryforward Calculation
```javascript
async function processYearEndCarryforward(year) {
  // Get all active employees
  const { data: users } = await supabase
    .from('users_profile')
    .select('id')
    .eq('is_active', true);
  
  for (const user of users) {
    // Get current year balances
    const { data: balances } = await supabase
      .from('leave_balances')
      .select('*, leave_types(*)')
      .eq('user_id', user.id)
      .eq('year', year);
    
    for (const balance of balances) {
      const leaveType = balance.leave_types;
      
      if (!leaveType.is_carried_forward) continue;
      
      // Calculate carryforward
      const carryforward = Math.min(
        balance.available_days,
        leaveType.max_carryforward_days || 0
      );
      
      // Create next year's balance
      await supabase.from('leave_balances').insert({
        user_id: user.id,
        leave_type_id: balance.leave_type_id,
        year: year + 1,
        opening_balance: carryforward,
        annual_allocation: leaveType.default_days_per_year
      });
    }
  }
  
  console.log(`Year-end processing complete for ${year}`);
}
```

#### Expiry Notifications
```javascript
// Run 60 days before year-end
async function notifyExpiringLeaves() {
  const { data: balances } = await supabase
    .from('leave_balances')
    .select('*, users_profile(*), leave_types(*)')
    .eq('year', new Date().getFullYear())
    .gt('available_days', 0);
  
  for (const balance of balances) {
    const willExpire = balance.available_days - 
      (balance.leave_types.max_carryforward_days || 0);
    
    if (willExpire > 0) {
      await sendEmail({
        to: balance.users_profile.email,
        subject: 'Expiring Leave Days',
        body: `You have ${willExpire} days of ${balance.leave_types.name} that will expire on December 31. Plan your leave!`
      });
    }
  }
}
```

---

### 8.4 Pro-rated Allocations

#### Mid-Year Joiner
```javascript
function calculateProRatedAllocation(hireDate, annualDays) {
  const today = new Date();
  const year = today.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  
  const totalDaysInYear = Math.ceil((yearEnd - yearStart) / (1000 * 60 * 60 * 24));
  const remainingDays = Math.ceil((yearEnd - hireDate) / (1000 * 60 * 60 * 24));
  
  const proRatedDays = Math.round((annualDays / totalDaysInYear) * remainingDays);
  
  return proRatedDays;
}

// Example: Joined July 1, 2025
// Annual allocation: 21 days
// Pro-rated: 21 * (184/365) ≈ 11 days
```

---

## 9. Security & Compliance

### 9.1 Authentication

#### Supabase Auth Implementation
```javascript
// Registration
async function signUp(email, password, userData) {
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password
  });
  
  if (authError) throw authError;
  
  // Create user profile
  const { error: profileError } = await supabase
    .from('users_profile')
    .insert({
      id: authData.user.id,
      email: email,
      ...userData
    });
  
  if (profileError) throw profileError;
  
  return authData;
}

// Login
async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  
  if (error) throw error;
  
  return data;
}

// Password Reset
async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`
  });
  
  if (error) throw error;
}
```

#### Multi-Factor Authentication (Future)
```javascript
// Enable MFA
async function enableMFA() {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp'
  });
  
  if (error) throw error;
  
  // Show QR code to user
  return data;
}
```

---

### 9.2 Data Protection

#### Row Level Security (Complete Policies)
```sql
-- Enable RLS on all tables
ALTER TABLE users_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can view/update their own profile
CREATE POLICY "users_own_profile" ON users_profile
FOR ALL USING (auth.uid() = id);

-- Users see own leave requests
CREATE POLICY "users_own_requests" ON leave_requests
FOR SELECT USING (auth.uid() = user_id);

-- Users can create their own requests
CREATE POLICY "users_create_requests" ON leave_requests
FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can cancel their pending requests
CREATE POLICY "users_cancel_requests" ON leave_requests
FOR UPDATE USING (
  auth.uid() = user_id AND 
  status = 'pending'
)
WITH CHECK (status = 'cancelled');

-- HOD sees department requests
CREATE POLICY "hod_department_requests" ON leave_requests
FOR SELECT USING (
  user_id IN (
    SELECT id FROM users_profile 
    WHERE department_id = (
      SELECT department_id FROM users_profile WHERE id = auth.uid()
    )
  ) AND
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role IN ('hod', 'hr_admin')
  )
);

-- HOD can approve/reject department requests
CREATE POLICY "hod_review_requests" ON leave_requests
FOR UPDATE USING (
  user_id IN (
    SELECT id FROM users_profile 
    WHERE department_id = (
      SELECT department_id FROM users_profile WHERE id = auth.uid()
    )
  ) AND
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role IN ('hod', 'hr_admin')
  )
)
WITH CHECK (
  status IN ('approved', 'rejected') AND
  reviewed_by = auth.uid()
);

-- HR Admin sees all
CREATE POLICY "hr_all_access" ON leave_requests
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role = 'hr_admin'
  )
);

-- Similar policies for leave_balances and notifications
```

---

### 9.3 Audit Trail

#### Comprehensive Logging
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL, -- INSERT, UPDATE, DELETE
  old_data JSONB,
  new_data JSONB,
  user_id UUID REFERENCES users_profile(id),
  ip_address INET,
  user_agent TEXT,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Trigger function to log all changes
CREATE OR REPLACE FUNCTION log_audit()
RETURNS TRIGGER AS $
BEGIN
  INSERT INTO audit_logs (
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    user_id
  ) VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END,
    auth.uid()
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply to sensitive tables
CREATE TRIGGER audit_leave_requests
AFTER INSERT OR UPDATE OR DELETE ON leave_requests
FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE TRIGGER audit_leave_balances
AFTER INSERT OR UPDATE OR DELETE ON leave_balances
FOR EACH ROW EXECUTE FUNCTION log_audit();
```

---

### 9.4 GDPR Compliance

#### Data Export (Right to Access)
```javascript
async function exportUserData(userId) {
  const { data: profile } = await supabase
    .from('users_profile')
    .select('*')
    .eq('id', userId)
    .single();
  
  const { data: requests } = await supabase
    .from('leave_requests')
    .select('*')
    .eq('user_id', userId);
  
  const { data: balances } = await supabase
    .from('leave_balances')
    .select('*')
    .eq('user_id', userId);
  
  const exportData = {
    profile,
    leave_requests: requests,
    leave_balances: balances,
    exported_at: new Date().toISOString()
  };
  
  return exportData;
}
```

#### Data Deletion (Right to be Forgotten)
```javascript
async function deleteUserData(userId) {
  // Archive first (for legal requirements)
  await archiveUserData(userId);
  
  // Then delete or anonymize
  await supabase
    .from('leave_requests')
    .update({ user_id: null, reason: '[REDACTED]' })
    .eq('user_id', userId);
  
  await supabase
    .from('users_profile')
    .update({ 
      email: `deleted_${userId}@example.com`,
      first_name: '[DELETED]',
      last_name: '[USER]',
      is_active: false
    })
    .eq('id', userId);
}
```

---

### 9.5 API Rate Limiting

```javascript
// Supabase Edge Function with rate limiting
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const rateLimit = new Map();

serve(async (req) => {
  const userId = req.headers.get('x-user-id');
  const now = Date.now();
  
  // Check rate limit: 100 requests per minute
  const userRequests = rateLimit.get(userId) || [];
  const recentRequests = userRequests.filter(time => now - time < 60000);
  
  if (recentRequests.length >= 100) {
    return new Response('Rate limit exceeded', { status: 429 });
  }
  
  recentRequests.push(now);
  rateLimit.set(userId, recentRequests);
  
  // Process request
  // ...
});
```

---

## 10. Deployment Strategy

### 10.1 GitHub Repository Structure

```
leave-management-system/
├── .github/
│   └── workflows/
│       ├── ci.yml              # Continuous Integration
│       └── deploy.yml          # Deployment workflow
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── utils/
│   │   ├── services/
│   │   └── App.jsx
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_add_notifications.sql
│   │   └── 003_audit_logs.sql
│   ├── functions/
│   │   ├── send-email/
│   │   └── process-carryforward/
│   └── seed.sql
├── docs/
│   ├── API.md
│   ├── USER_GUIDE.md
│   └── ADMIN_GUIDE.md
├── .env.example
├── README.md
└── LICENSE
```

---

### 10.2 CI/CD Pipeline

#### GitHub Actions Workflow
```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json
      
      - name: Install dependencies
        working-directory: ./frontend
        run: npm ci
      
      - name: Run linter
        working-directory: ./frontend
        run: npm run lint
      
      - name: Run tests
        working-directory: ./frontend
        run: npm run test
      
      - name: Build application
        working-directory: ./frontend
        run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to Netlify
        uses: netlify/actions/cli@master
        with:
          args: deploy --prod
        env:
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
      
      - name: Run Database Migrations
        run: |
          npx supabase db push
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}