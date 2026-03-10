import { supabase } from '../lib/supabaseClient';
import type {
  LeaveBalance,
  LeaveType,
  LeaveRequest,
  LeaveRequestFormData,
  LeaveRequestFilters,
  LeaveRequestStatus,
  PublicHoliday,
  Notification,
  ServiceResponse,
} from '../types';

/**
 * Leave Service
 * Handles all leave-related operations with Supabase
 */

// ==========================================
// NOTIFICATION FUNCTIONS
// ==========================================

// Get notifications for current user
export const getNotifications = async (
  userId: string,
  limit: number = 20
): Promise<ServiceResponse<Notification[]>> => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return { data: data as Notification[], error: null };
  } catch (error) {
    console.error('Get notifications error:', error);
    return { data: null, error: error as Error };
  }
};

// Get unread notification count
export const getUnreadCount = async (
  userId: string
): Promise<{ count: number; error: Error | null }> => {
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) throw error;
    return { count: count || 0, error: null };
  } catch (error) {
    console.error('Get unread count error:', error);
    return { count: 0, error: error as Error };
  }
};

// Mark notification as read
export const markNotificationAsRead = async (
  notificationId: string
): Promise<{ error: Error | null }> => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Mark notification as read error:', error);
    return { error: error as Error };
  }
};

// Mark all notifications as read
export const markAllNotificationsAsRead = async (
  userId: string
): Promise<{ error: Error | null }> => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    return { error: error as Error };
  }
};

// Delete notification
export const deleteNotification = async (
  notificationId: string
): Promise<{ error: Error | null }> => {
  try {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Delete notification error:', error);
    return { error: error as Error };
  }
};

// ==========================================
// LEAVE BALANCE FUNCTIONS
// ==========================================

// Get user's leave balances for current year
export const getLeaveBalances = async (
  userId: string,
  year: number = new Date().getFullYear()
): Promise<ServiceResponse<LeaveBalance[]>> => {
  try {
    const { data, error } = await supabase
      .from('leave_balances')
      .select(`
        *,
        leave_types (
          id,
          name,
          description,
          max_days_per_year,
          requires_documentation
        )
      `)
      .eq('user_id', userId)
      .eq('year', year);

    if (error) throw error;
    return { data: data as LeaveBalance[], error: null };
  } catch (error) {
    console.error('Get leave balances error:', error);
    return { data: null, error: error as Error };
  }
};

// Get all active leave types
export const getLeaveTypes = async (): Promise<ServiceResponse<LeaveType[]>> => {
  try {
    const { data, error } = await supabase
      .from('leave_types')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return { data: data as LeaveType[], error: null };
  } catch (error) {
    console.error('Get leave types error:', error);
    return { data: null, error: error as Error };
  }
};

// Get public holidays
export const getPublicHolidays = async (
  year: number = new Date().getFullYear()
): Promise<ServiceResponse<PublicHoliday[]>> => {
  try {
    const { data, error } = await supabase
      .from('public_holidays')
      .select('*')
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`)
      .order('date');

    if (error) throw error;
    return { data: data as PublicHoliday[], error: null };
  } catch (error) {
    console.error('Get public holidays error:', error);
    return { data: null, error: error as Error };
  }
};

// Calculate working days between dates (client-side)
export const calculateWorkingDays = (
  startDate: string | Date,
  endDate: string | Date,
  publicHolidays: PublicHoliday[] = []
): number => {
  let workingDays = 0;
  let currentDate = new Date(startDate);
  const end = new Date(endDate);
  
  const holidayDates = publicHolidays.map(h => new Date(h.date).toDateString());

  while (currentDate <= end) {
    const dayOfWeek = currentDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday = 0, Saturday = 6
    const isHoliday = holidayDates.includes(currentDate.toDateString());

    if (!isWeekend && !isHoliday) {
      workingDays++;
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return workingDays;
};

// Submit leave request
export const submitLeaveRequest = async (
  requestData: LeaveRequestFormData & { user_id?: string; userId?: string }
): Promise<ServiceResponse<LeaveRequest>> => {
  try {
    console.log('leaveService received:', requestData);
    
    const userId = requestData.user_id || requestData.userId;
    
    if (!userId) {
      throw new Error('User ID is required but was not provided');
    }
    
    const insertData = {
      user_id: userId,
      leave_type_id: requestData.leave_type_id,
      start_date: requestData.start_date,
      end_date: requestData.end_date,
      total_days: requestData.total_days,
      reason: requestData.reason,
      document_url: requestData.document_url || null,
      status: 'pending' as LeaveRequestStatus,
    };

    console.log('Inserting into database:', insertData);

    const { data, error } = await supabase
      .from('leave_requests')
      .insert([insertData])
      .select()
      .single();

    if (error) throw error;
    return { data: data as LeaveRequest, error: null };
  } catch (error) {
    console.error('Submit leave request error:', error);
    return { data: null, error: error as Error };
  }
};

// Get user's leave requests
export const getLeaveRequests = async (
  userId: string,
  filters: LeaveRequestFilters = {}
): Promise<ServiceResponse<LeaveRequest[]>> => {
  try {
    let query = supabase
      .from('leave_requests')
      .select(`
        *,
        leave_types (name),
        reviewed_by_user:users_profile!leave_requests_reviewed_by_fkey (
          first_name,
          last_name
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    if (filters.year) {
      query = query
        .gte('start_date', `${filters.year}-01-01`)
        .lte('start_date', `${filters.year}-12-31`);
    }

    const { data, error } = await query;

    if (error) throw error;
    return { data: data as LeaveRequest[], error: null };
  } catch (error) {
    console.error('Get leave requests error:', error);
    return { data: null, error: error as Error };
  }
};

// Get pending requests for HOD approval
export const getPendingRequestsForApproval = async (
  userId: string,
  departmentId?: string
): Promise<ServiceResponse<LeaveRequest[]>> => {
  try {
    // If departmentId is not provided, try to get it from user profile
    let deptId = departmentId;
    
    if (!deptId) {
      const { data: userProfile, error: profileError } = await supabase
        .from('users_profile')
        .select('department_id')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;
      deptId = userProfile?.department_id;
    }

    // If still no department ID, return empty
    if (!deptId) {
      console.log('No department ID found for HOD user:', userId);
      return { data: [], error: null };
    }

    // Get all user IDs in this department (excluding the HOD themselves)
    const { data: deptUsers, error: usersError } = await supabase
      .from('users_profile')
      .select('id, email, first_name, last_name')
      .eq('department_id', deptId)
      .neq('id', userId); // Exclude HOD's own requests

    if (usersError) throw usersError;

    console.log('🔍 Department users query result:', deptUsers);

    // Extract user IDs into an array
    const userIds = deptUsers?.map(u => u.id) || [];

    console.log('👥 User IDs to query for leave requests:', userIds);

    // If no users in department, return empty array
    if (userIds.length === 0) {
      console.log('❌ No users found in department:', deptId);
      return { data: [], error: null };
    }

    // Get pending leave requests for these users
    console.log('📊 Querying leave_requests with filters:', {
      status: 'pending',
      user_ids: userIds
    });

    const { data, error } = await supabase
      .from('leave_requests')
      .select(`
        *,
        users_profile:user_id (
          first_name,
          last_name,
          employee_id,
          job_title,
          department_id
        ),
        leave_types:leave_type_id (
          name,
          color
        )
      `)
      .eq('status', 'pending')
      .in('user_id', userIds)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ Error fetching leave requests:', error);
      throw error;
    }
    
    console.log(`✅ Found ${data?.length || 0} pending requests for department:`, deptId);
    console.log('📋 Requests data:', data);
    
    return { data: data as LeaveRequest[], error: null };
  } catch (error) {
    console.error('Get pending requests error:', error);
    return { data: null, error: error as Error };
  }
};

// Get requests for HR approval (all pending and hod_approved requests)
export const getRequestsForHRApproval = async (): Promise<ServiceResponse<LeaveRequest[]>> => {
  try {
    // HR sees ALL requests that are pending or hod_approved
    // Note: If migration not run yet, hod_approved status won't exist, so we just get pending
    const { data, error } = await supabase
      .from('leave_requests')
      .select(`
        *,
        users_profile:user_id (
          first_name,
          last_name,
          employee_id,
          job_title,
          department_id
        ),
        leave_types:leave_type_id (
          name,
          color
        ),
        reviewed_by_user:reviewed_by (
          first_name,
          last_name
        )
      `)
      .in('status', ['pending', 'hod_approved'])
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Get HR approval requests error:', error);
      throw error;
    }
    
    console.log('HR approval requests loaded:', data?.length, 'requests');
    return { data: data as LeaveRequest[], error: null };
  } catch (error) {
    console.error('Get HR approval requests error:', error);
    return { data: null, error: error as Error };
  }
};

// HOD approval - moves request to 'hod_approved' status
export const approveAsHOD = async (
  requestId: string,
  hodId: string,
  comments: string = ''
): Promise<ServiceResponse<LeaveRequest>> => {
  try {
    const { data, error } = await supabase
      .from('leave_requests')
      .update({
        status: 'hod_approved',
        hod_approved_by: hodId,
        hod_approved_at: new Date().toISOString(),
        hod_comments: comments,
      })
      .eq('id', requestId)
      .select()
      .single();

    if (error) throw error;
    return { data: data as LeaveRequest, error: null };
  } catch (error) {
    console.error('HOD approval error:', error);
    return { data: null, error: error as Error };
  }
};

// HR final approval - moves request to 'approved' status
export const approveAsHR = async (
  requestId: string,
  hrId: string,
  comments: string = ''
): Promise<ServiceResponse<LeaveRequest>> => {
  try {
    const { data, error } = await supabase
      .from('leave_requests')
      .update({
        status: 'approved',
        hr_approved_by: hrId,
        hr_approved_at: new Date().toISOString(),
        hr_comments: comments,
        // Also set legacy reviewed_by for backwards compatibility
        reviewed_by: hrId,
        reviewed_at: new Date().toISOString(),
        reviewer_comments: comments,
      })
      .eq('id', requestId)
      .select()
      .single();

    if (error) throw error;
    return { data: data as LeaveRequest, error: null };
  } catch (error) {
    console.error('HR approval error:', error);
    return { data: null, error: error as Error };
  }
};

// Reject leave request (can be done by HOD or HR at any stage)
export const rejectLeaveRequest = async (
  requestId: string,
  reviewerId: string,
  comments: string,
  role: 'hod' | 'hr_admin'
): Promise<ServiceResponse<LeaveRequest>> => {
  try {
    const updateData: any = {
      status: 'rejected',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      reviewer_comments: comments,
    };

    // Set the appropriate approval fields based on role
    if (role === 'hod') {
      updateData.hod_approved_by = reviewerId;
      updateData.hod_approved_at = new Date().toISOString();
      updateData.hod_comments = comments;
    } else {
      updateData.hr_approved_by = reviewerId;
      updateData.hr_approved_at = new Date().toISOString();
      updateData.hr_comments = comments;
    }

    const { data, error } = await supabase
      .from('leave_requests')
      .update(updateData)
      .eq('id', requestId)
      .select()
      .single();

    if (error) throw error;
    return { data: data as LeaveRequest, error: null };
  } catch (error) {
    console.error('Reject request error:', error);
    return { data: null, error: error as Error };
  }
};

// Approve or reject leave request (legacy function - kept for backwards compatibility)
export const updateRequestStatus = async (
  requestId: string,
  status: LeaveRequestStatus,
  reviewerId: string,
  comments: string = ''
): Promise<ServiceResponse<LeaveRequest>> => {
  try {
    const { data, error } = await supabase
      .from('leave_requests')
      .update({
        status,
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        reviewer_comments: comments,
      })
      .eq('id', requestId)
      .select()
      .single();

    if (error) throw error;
    return { data: data as LeaveRequest, error: null };
  } catch (error) {
    console.error('Update request status error:', error);
    return { data: null, error: error as Error };
  }
};

// Cancel leave request (only pending requests)
export const cancelLeaveRequest = async (
  requestId: string
): Promise<ServiceResponse<LeaveRequest>> => {
  try {
    const { data, error } = await supabase
      .from('leave_requests')
      .update({ status: 'cancelled' })
      .eq('id', requestId)
      .eq('status', 'pending')
      .select()
      .single();

    if (error) throw error;
    return { data: data as LeaveRequest, error: null };
  } catch (error) {
    console.error('Cancel leave request error:', error);
    return { data: null, error: error as Error };
  }
};

// Get team leave calendar (for HODs)
export const getTeamLeaveCalendar = async (
  departmentId: string,
  startDate: string,
  endDate: string
): Promise<ServiceResponse<LeaveRequest[]>> => {
  try {
    // First, get all user IDs in the department
    const { data: departmentUsers, error: usersError } = await supabase
      .from('users_profile')
      .select('id')
      .eq('department_id', departmentId);

    if (usersError) throw usersError;
    
    const userIds = departmentUsers?.map(u => u.id) || [];
    
    if (userIds.length === 0) {
      return { data: [], error: null };
    }

    const { data, error } = await supabase
      .from('leave_requests')
      .select(`
        *,
        users_profile (
          first_name,
          last_name,
          employee_id
        ),
        leave_types (name, color)
      `)
      .eq('status', 'approved')
      .gte('end_date', startDate)
      .lte('start_date', endDate)
      .in('user_id', userIds)
      .order('start_date');

    if (error) throw error;
    return { data: data as LeaveRequest[], error: null };
  } catch (error) {
    console.error('Get team leave calendar error:', error);
    return { data: null, error: error as Error };
  }
};

// Upload document to Supabase Storage
export const uploadDocument = async (
  file: File,
  userId: string
): Promise<ServiceResponse<string>> => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${Date.now()}.${fileExt}`;

    const { error } = await supabase.storage
      .from('leave-documents')
      .upload(fileName, file);

    if (error) throw error;

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('leave-documents')
      .getPublicUrl(fileName);

    return { data: urlData.publicUrl, error: null };
  } catch (error) {
    console.error('Upload document error:', error);
    return { data: null, error: error as Error };
  }
};
