# Phase 3 Completion Implementation Guide

## Overview
This document outlines the step-by-step implementation of missing Phase 3 features for the FKF Leave Management System.

## Priority Order

### 1. Document Upload Feature (HIGH PRIORITY) ✅ Starting
**Status**: In Progress
**Files to modify**:
- `frontend/src/components/leave/LeaveRequestForm.jsx` - Add file upload UI and handler
- `frontend/src/services/leaveService.js` - Already has uploadDocument function
- Supabase: Create `leave-documents` storage bucket

**Implementation Steps**:
1. Configure Supabase Storage bucket `leave-documents`
2. Add file input to Step 3 of LeaveRequestForm
3. Add file validation (max 5MB, allowed types: PDF, JPG, PNG, DOC, DOCX)
4. Upload file before submitting leave request
5. Store document URL in `leave_requests.document_url` column
6. Display uploaded documents in LeaveHistory and Approvals

### 2. Email Notifications Integration (HIGH PRIORITY)
**Status**: Not Started
**Files to modify**:
- `supabase/functions/send-email/index.ts` - Edge Function already written
- Create database trigger or modify `submitLeaveRequest` to call Edge Function
- Configure Supabase SMTP/SendGrid settings

**Email Triggers**:
- Employee submits leave → Email to HOD
- HOD approves → Email to employee
- HOD rejects → Email to employee
- HR admin override → Email to employee and HOD

**Implementation Steps**:
1. Configure email service (Resend/SendGrid) in Supabase
2. Update Edge Function with proper SMTP credentials
3. Add email trigger after leave request insert
4. Add email trigger after status update
5. Create email templates (HTML)
6. Test email delivery

### 3. PDF Export Functionality (MEDIUM PRIORITY)
**Status**: Not Started
**Dependencies**: Install `jspdf` and `jspdf-autotable`

**Features to implement**:
- Export leave certificate (approved requests)
- Export leave history report
- Export department analytics (admin)
- Export monthly team calendar

**Files to create**:
- `frontend/src/services/pdfService.js` - PDF generation logic
- Add export buttons to:
  - LeaveHistory.jsx
  - ReportsAnalytics.jsx
  - Approvals.jsx

**Implementation Steps**:
1. Install dependencies: `npm install jspdf jspdf-autotable`
2. Create pdfService with templates
3. Add "Export PDF" buttons to relevant pages
4. Generate formatted PDFs with company branding

### 4. Complete HR Dashboard Widgets (MEDIUM PRIORITY)
**Status**: Dashboard at 70%
**Missing Components**:
- Upcoming leaves timeline chart
- Department comparison bar chart
- Year-over-year trend line graph
- Quick export buttons

**Files to modify**:
- `frontend/src/components/admin/AdminDashboard.jsx`
- Consider adding Chart.js or Recharts library

**Implementation Steps**:
1. Install chart library: `npm install recharts`
2. Add UpcomingLeavesChart component
3. Add DepartmentComparisonChart component
4. Add TrendsChart component
5. Add dashboard export to PDF functionality

### 5. Enhanced Reports & Analytics (MEDIUM PRIORITY)
**Status**: Reports at 40%
**Missing Features**:
- Advanced filters (date range, department, leave type)
- Leave pattern analysis
- Predictive insights (peak leave periods)
- Excel export
- Interactive charts

**Files to modify**:
- `frontend/src/components/admin/ReportsAnalytics.jsx`
- Create `frontend/src/services/analyticsService.js`

**Implementation Steps**:
1. Add date range picker component
2. Add department and leave type filters
3. Implement complex analytics queries
4. Add Excel export (use `xlsx` library)
5. Add interactive charts with drill-down

### 6. Comprehensive Testing Suite (HIGH PRIORITY)
**Status**: 5% complete
**Testing Stack**:
- Unit Tests: Vitest
- Component Tests: React Testing Library
- E2E Tests: Playwright or Cypress

**Test Coverage Goals**:
- Services: 80%+ coverage
- Components: 70%+ coverage
- E2E: Critical user flows

**Files to create**:
- `frontend/src/services/__tests__/authService.test.js`
- `frontend/src/services/__tests__/leaveService.test.js`
- `frontend/src/components/__tests__/Login.test.jsx`
- `frontend/src/components/__tests__/LeaveRequestForm.test.jsx`
- `frontend/e2e/leave-workflow.spec.js`

**Implementation Steps**:
1. Install testing dependencies
2. Configure Vitest
3. Write service unit tests
4. Write component tests
5. Write E2E tests for critical flows
6. Set up CI/CD with test runs

### 7. Accessibility Audit & Fixes (MEDIUM PRIORITY)
**Status**: Not Started
**Tools**: Lighthouse, axe DevTools, WAVE

**Accessibility Checklist**:
- [ ] All interactive elements keyboard accessible
- [ ] Proper ARIA labels and roles
- [ ] Color contrast meets WCAG AA standards
- [ ] Screen reader compatible
- [ ] Focus indicators visible
- [ ] Form validation accessible
- [ ] Error messages announced
- [ ] Skip navigation links

**Implementation Steps**:
1. Run Lighthouse audit on all pages
2. Install axe DevTools extension
3. Fix high-priority issues (forms, navigation)
4. Add ARIA labels to all interactive elements
5. Test with screen reader (NVDA/JAWS)
6. Document accessibility features

### 8. User Documentation (HIGH PRIORITY)
**Status**: 40% complete
**Documents to create**:
- Employee User Guide
- Manager/HOD User Guide
- HR Admin Guide
- System Administrator Guide
- FAQ Document
- In-app help tooltips

**Files to create**:
- `Docs/Employee-Guide.md`
- `Docs/Manager-Guide.md`
- `Docs/HR-Admin-Guide.md`
- `Docs/FAQ.md`
- `frontend/src/components/common/HelpTooltip.jsx`

**Implementation Steps**:
1. Create comprehensive markdown guides
2. Add screenshots/diagrams
3. Create video tutorials (optional)
4. Add contextual help tooltips in UI
5. Create searchable help center

## Implementation Timeline

### Week 1 (Days 1-7)
- [ ] Day 1-2: Document upload feature complete
- [ ] Day 3-4: Email notifications integration
- [ ] Day 5-6: PDF export functionality
- [ ] Day 7: Testing and bug fixes

### Week 2 (Days 8-14)
- [ ] Day 8-9: Complete HR Dashboard widgets
- [ ] Day 10-11: Enhanced Reports & Analytics
- [ ] Day 12-13: Comprehensive testing suite setup
- [ ] Day 14: Accessibility audit (initial)

### Week 3 (Days 15-21)
- [ ] Day 15-17: Accessibility fixes implementation
- [ ] Day 18-20: User documentation creation
- [ ] Day 21: Final testing and review

## Success Criteria

Phase 3 will be considered 100% complete when:
1. ✅ Document upload working with file validation
2. ✅ Email notifications sending on all triggers
3. ✅ PDF exports available for reports and certificates
4. ✅ HR Dashboard showing all analytics widgets
5. ✅ Reports page has advanced filters and exports
6. ✅ Test coverage above 70%
7. ✅ All Lighthouse accessibility scores > 90
8. ✅ Complete user documentation published

## Notes
- Prioritize features that impact daily user workflows
- Test each feature thoroughly before moving to next
- Document any breaking changes
- Create rollback plan for each deployment
- Get user feedback early and often
