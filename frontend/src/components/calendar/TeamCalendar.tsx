import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { getTeamLeaveCalendar } from '../../services/leaveService';
import { AdminSidebar } from '../admin/AdminSidebar';
import type { LeaveRequest } from '../../types';

interface CalendarStats {
  peopleOnLeave: number;
  totalDays: number;
  totalRequests: number;
}

type ViewMode = 'month' | 'list';

type GroupedLeaves = {
  [employeeName: string]: LeaveRequest[];
};

export const TeamCalendar = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [stats, setStats] = useState<CalendarStats>({
    peopleOnLeave: 0,
    totalDays: 0,
    totalRequests: 0
  });

  useEffect(() => {
    // Check if user is HOD, HR Admin, or Super Admin
    if (profile?.role !== 'hod' && profile?.role !== 'hr_admin' && profile?.role !== 'super_admin') {
      navigate('/dashboard');
      return;
    }
    loadCalendarData();
  }, [profile, currentMonth, navigate]);

  const loadCalendarData = async () => {
    if (!profile?.department_id) return;

    setLoading(true);
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    const startDate = new Date(year, month, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

    const { data } = await getTeamLeaveCalendar(
      profile.department_id,
      startDate,
      endDate
    );

    if (data) {
      setLeaves(data);
      
      // Calculate stats
      const peopleOnLeave = new Set(data.map(l => l.user_id)).size;
      const totalDays = data.reduce((sum, l) => sum + (l.total_days || 0), 0);
      const totalRequests = data.length;
      
      setStats({ peopleOnLeave, totalDays, totalRequests });
    }
    setLoading(false);
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return { daysInMonth, startingDayOfWeek };
  };

  const getLeaveForDate = (date: Date): LeaveRequest[] => {
    return leaves.filter(leave => {
      const start = new Date(leave.start_date);
      const end = new Date(leave.end_date);
      return date >= start && date <= end;
    });
  };

  const previousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const goToToday = () => {
    setCurrentMonth(new Date());
  };

  const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentMonth);
  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const CalendarView = () => {
    const days = [];
    const totalSlots = Math.ceil((daysInMonth + startingDayOfWeek) / 7) * 7;

    for (let i = 0; i < totalSlots; i++) {
      const dayNumber = i - startingDayOfWeek + 1;
      const isValidDay = dayNumber > 0 && dayNumber <= daysInMonth;
      const date = isValidDay ? new Date(currentMonth.getFullYear(), currentMonth.getMonth(), dayNumber) : null;
      const dayLeaves = date ? getLeaveForDate(date) : [];
      const isToday = date && date.toDateString() === new Date().toDateString();
      const isWeekend = date && (date.getDay() === 0 || date.getDay() === 6);

      days.push(
        <div
          key={i}
          className={`calendar-day ${
            !isValidDay ? 'calendar-day-empty' : isWeekend ? 'calendar-day-weekend' : ''
          } ${isToday ? 'calendar-day-today' : ''}`}
        >
          {isValidDay && (
            <>
              <div className={`calendar-day-number ${isToday ? 'calendar-day-number-today' : ''}`}>
                {dayNumber}
              </div>
              <div className="calendar-day-events">
                {dayLeaves.slice(0, 3).map((leave) => (
                  <div
                    key={leave.id}
                    className="calendar-event"
                    style={{ 
                      backgroundColor: leave.leave_types?.color_code + '30', 
                      borderLeft: `3px solid ${leave.leave_types?.color_code}` 
                    }}
                    title={`${leave.users_profile?.first_name} ${leave.users_profile?.last_name} - ${leave.leave_types?.name}`}
                  >
                    <span className="calendar-event-text" style={{ color: leave.leave_types?.color_code }}>
                      {leave.users_profile?.first_name} {leave.users_profile?.last_name?.[0]}.
                    </span>
                  </div>
                ))}
                {dayLeaves.length > 3 && (
                  <div className="calendar-event-more">+{dayLeaves.length - 3} more</div>
                )}
              </div>
            </>
          )}
        </div>
      );
    }

    return (
      <div className="calendar-container">
        <div className="calendar-grid">
          {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => (
            <div key={day} className="calendar-header-day">
              <span className="calendar-header-full">{day}</span>
              <span className="calendar-header-short">{day.slice(0, 3)}</span>
            </div>
          ))}
          {days}
        </div>
      </div>
    );
  };

  const ListView = () => {
    const groupedLeaves: GroupedLeaves = {};
    leaves.forEach((leave) => {
      const employeeName = `${leave.users_profile?.first_name} ${leave.users_profile?.last_name}`;
      if (!groupedLeaves[employeeName]) {
        groupedLeaves[employeeName] = [];
      }
      groupedLeaves[employeeName].push(leave);
    });

    return (
      <div className="leave-list-container">
        {Object.keys(groupedLeaves).length === 0 ? (
          <div className="empty-state-card">
            <div className="empty-state-icon">📅</div>
            <h3 className="empty-state-title">No leave scheduled</h3>
            <p className="empty-state-description">
              There are no approved leave requests for this month.
            </p>
          </div>
        ) : (
          <div className="leave-list-grid">
            {Object.entries(groupedLeaves).map(([employeeName, employeeLeaves]) => (
              <div key={employeeName} className="leave-list-employee-card">
                <div className="leave-list-employee-header">
                  <div className="leave-list-employee-avatar">
                    {employeeName.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <h3 className="leave-list-employee-name">{employeeName}</h3>
                    <p className="leave-list-employee-count">
                      {employeeLeaves.reduce((sum, l) => sum + (l.total_days || 0), 0)} days scheduled
                    </p>
                  </div>
                </div>
                <div className="leave-list-items">
                  {employeeLeaves.map((leave) => (
                    <div
                      key={leave.id}
                      className="leave-list-item"
                      style={{ borderLeftColor: leave.leave_types?.color_code }}
                    >
                      <div className="leave-list-item-header">
                        <div className="leave-list-item-type">
                          <div
                            className="leave-list-type-indicator"
                            style={{ backgroundColor: leave.leave_types?.color_code }}
                          ></div>
                          <span className="leave-list-type-name">{leave.leave_types?.name}</span>
                        </div>
                        <span className="leave-list-item-duration">{leave.total_days} {leave.total_days === 1 ? 'day' : 'days'}</span>
                      </div>
                      <div className="leave-list-item-dates">
                        <span>📅</span>
                        <span>
                          {new Date(leave.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {' '} - {' '}
                          {new Date(leave.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                      {leave.reason && (
                        <div className="leave-list-item-reason">
                          {leave.reason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="app">
        <div className="content">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading team calendar...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <AdminSidebar />

      <div className="content">
        <div className="page-header enhanced-header admin-header">
          <div className="header-content">
            <h1 className="page-title">
              <span className="title-icon">📅</span>
              Team Calendar
            </h1>
            <p className="page-subtitle">View your department's leave schedule and availability</p>
          </div>
          <div className="page-actions enhanced-actions">
            <button
              onClick={goToToday}
              className="btn btn-secondary action-btn"
            >
              <span className="btn-icon">📍</span>
              Today
            </button>
            <button
              onClick={() => navigate('/approvals')}
              className="btn btn-primary action-btn"
            >
              <span className="btn-icon">✓</span>
              Approvals
            </button>
          </div>
        </div>

        {/* Calendar Statistics */}
        <div className="stats-grid admin-stats-grid">
          <div className="stats-card admin-stats-card">
            <div className="stats-content">
              <div className="stats-icon stats-icon-primary">👥</div>
              <div className="stats-details">
                <h3 className="stats-title">On Leave</h3>
                <p className="stats-value">{stats.peopleOnLeave}</p>
                <p className="stats-change">
                  <span className="stats-change-neutral">team members</span>
                </p>
              </div>
            </div>
          </div>

          <div className="stats-card admin-stats-card">
            <div className="stats-content">
              <div className="stats-icon stats-icon-warning">📊</div>
              <div className="stats-details">
                <h3 className="stats-title">Total Days</h3>
                <p className="stats-value">{stats.totalDays}</p>
                <p className="stats-change">
                  <span className="stats-change-neutral">scheduled leave</span>
                </p>
              </div>
            </div>
          </div>

          <div className="stats-card admin-stats-card">
            <div className="stats-content">
              <div className="stats-icon stats-icon-info">📝</div>
              <div className="stats-details">
                <h3 className="stats-title">Requests</h3>
                <p className="stats-value">{stats.totalRequests}</p>
                <p className="stats-change">
                  <span className="stats-change-neutral">approved</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Calendar Controls */}
        <div className="calendar-controls-card">
          <div className="calendar-controls-content">
            <div className="calendar-navigation">
              <button
                onClick={previousMonth}
                className="btn btn-secondary calendar-nav-btn"
                title="Previous month"
              >
                ← Previous
              </button>
              <h2 className="calendar-month-title">
                {monthName}
              </h2>
              <button
                onClick={nextMonth}
                className="btn btn-secondary calendar-nav-btn"
                title="Next month"
              >
                Next →
              </button>
            </div>

            <div className="calendar-view-switcher">
              <span className="view-switcher-label">View:</span>
              <div className="view-switcher-buttons">
                <button
                  onClick={() => setViewMode('month')}
                  className={`view-switcher-btn ${viewMode === 'month' ? 'view-switcher-btn-active' : ''}`}
                >
                  <span>📅</span>
                  Calendar
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`view-switcher-btn ${viewMode === 'list' ? 'view-switcher-btn-active' : ''}`}
                >
                  <span>📋</span>
                  List
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Calendar/List View */}
        {viewMode === 'month' ? <CalendarView /> : <ListView />}
      </div>
    </div>
  );
};

export default TeamCalendar;
