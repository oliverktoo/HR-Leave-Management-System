import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APP_URL       = Deno.env.get('APP_URL')      ?? 'https://fkfhr.netlify.app'
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_ADDRESS  = Deno.env.get('EMAIL_FROM')   ?? 'FKF HR System <onboarding@resend.dev>'
const HR_CC_EMAIL   = Deno.env.get('HR_CC_EMAIL')  ?? ''   // always CC'd on all leave emails

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured in Edge Function secrets')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json()
    const { type, entityType, entityId } = body

    // Support legacy call format { type, requestId } for leave
    const resolvedEntityType = entityType ?? 'leave'
    const resolvedEntityId   = entityId   ?? body.requestId

    if (!resolvedEntityId) {
      throw new Error('Missing entityId / requestId in request body')
    }

    let emailPayload: { to: string; subject: string; html: string } | null = null

    // ── LEAVE EVENTS ─────────────────────────────────────────────────────────
    if (resolvedEntityType === 'leave') {
      const { data: req_data, error } = await supabase
        .from('leave_requests')
        .select(`
          *,
          employee:users_profile!leave_requests_user_id_fkey(first_name, last_name, email, department_id,
            department:departments!users_profile_department_id_fkey(name, head_of_department_id)
          ),
          leave_type:leave_types(name),
          hod_approver:users_profile!leave_requests_hod_approved_by_fkey(first_name, last_name, email),
          hr_approver:users_profile!leave_requests_hr_approved_by_fkey(first_name, last_name, email)
        `)
        .eq('id', resolvedEntityId)
        .single()

      if (error || !req_data) throw error ?? new Error('Leave request not found')

      const emp    = req_data.employee
      const lt     = req_data.leave_type?.name ?? 'Leave'
      const from   = new Date(req_data.start_date).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
      const to     = new Date(req_data.end_date).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
      const days   = req_data.total_days
      const empName = `${emp.first_name} ${emp.last_name}`

      if (type === 'leave_submitted') {
        // Email to HOD
        const hodId = emp.department?.head_of_department_id
        if (!hodId) { console.warn('No HOD for department'); return ok() }

        const { data: hod } = await supabase
          .from('users_profile')
          .select('first_name, last_name, email')
          .eq('id', hodId)
          .single()

        if (!hod?.email) { console.warn('HOD has no email'); return ok() }

        emailPayload = {
          to: hod.email,
          subject: `[ACTION REQUIRED] Leave Request — ${empName}`,
          html: leaveSubmittedHtml({ empName, hodName: `${hod.first_name}`, lt, from, to, days, reason: req_data.reason ?? '' }),
        }

      } else if (type === 'leave_hod_approved') {
        // Email to HR admin
        const { data: hr } = await supabase
          .from('users_profile')
          .select('first_name, last_name, email')
          .in('role', ['hr_admin', 'super_admin'])
          .not('email', 'is', null)
          .limit(1)
          .single()

        if (!hr?.email) { console.warn('No HR admin with email'); return ok() }

        emailPayload = {
          to: hr.email,
          subject: `[FINAL APPROVAL NEEDED] Leave — ${empName}`,
          html: leaveHodApprovedHtml({ empName, hrName: hr.first_name, lt, from, to, days }),
        }

      } else if (type === 'leave_approved') {
        if (!emp.email) { console.warn('Employee has no email'); return ok() }
        const approverName = req_data.hr_approver
          ? `${req_data.hr_approver.first_name} ${req_data.hr_approver.last_name}`
          : req_data.hod_approver
          ? `${req_data.hod_approver.first_name} ${req_data.hod_approver.last_name}`
          : 'HR'

        emailPayload = {
          to: emp.email,
          subject: `✅ Leave Approved — ${from} to ${to}`,
          html: leaveApprovedHtml({ empName: emp.first_name, lt, from, to, days, approverName, comments: req_data.hr_comments ?? req_data.hod_comments ?? '' }),
        }

      } else if (type === 'leave_rejected') {
        if (!emp.email) { console.warn('Employee has no email'); return ok() }
        const reviewerName = req_data.hr_approver
          ? `${req_data.hr_approver.first_name} ${req_data.hr_approver.last_name}`
          : req_data.hod_approver
          ? `${req_data.hod_approver.first_name} ${req_data.hod_approver.last_name}`
          : 'HR'

        emailPayload = {
          to: emp.email,
          subject: `Leave Request Update — ${from} to ${to}`,
          html: leaveRejectedHtml({ empName: emp.first_name, lt, from, to, days, reviewerName, reason: req_data.hr_comments ?? req_data.hod_comments ?? '' }),
        }

      } else if (type === 'leave_recalled') {
        if (!emp.email) { console.warn('Employee has no email'); return ok() }

        let recalledByName = 'HR'
        if (req_data.recalled_by) {
          const { data: recaller } = await supabase
            .from('users_profile')
            .select('first_name, last_name')
            .eq('id', req_data.recalled_by)
            .single()
          if (recaller) recalledByName = `${recaller.first_name} ${recaller.last_name}`
        }

        const effective = req_data.recall_effective_date
          ? new Date(req_data.recall_effective_date).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
          : from

        emailPayload = {
          to: emp.email,
          subject: `↩ Leave Recalled — please report back from ${effective}`,
          html: leaveRecalledHtml({
            empName: emp.first_name, lt, from, to, days, effective,
            daysRestored: req_data.days_restored ?? 0,
            recalledByName,
            reason: req_data.recall_reason ?? '',
          }),
        }
      }
    }

    // ── FLEET / TRIP EVENTS ───────────────────────────────────────────────────
    // Note: trip_requests.requester_id and assigned_driver_id reference auth.users,
    // not users_profile — so we cannot use PostgREST FK joins to users_profile.
    // We fetch the trip first, then query users_profile separately by auth user id.
    if (resolvedEntityType === 'trip') {
      const { data: trip, error } = await supabase
        .from('trip_requests')
        .select(`*, vehicle:fleet_vehicles!trip_requests_assigned_vehicle_id_fkey(plate_number, make, model)`)
        .eq('id', resolvedEntityId)
        .single()

      if (error || !trip) throw error ?? new Error('Trip request not found')

      // Fetch requester profile from users_profile (matched by auth user id)
      const profileIds = [trip.requester_id, trip.assigned_driver_id].filter(Boolean)
      const { data: profiles } = await supabase
        .from('users_profile')
        .select('id, first_name, last_name, email')
        .in('id', profileIds)

      const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))
      const requester = profileMap[trip.requester_id] ?? null

      const req_num  = trip.request_number ?? resolvedEntityId
      const tripDate  = new Date(trip.start_datetime).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

      if (type === 'trip_approved' && requester?.email) {
        emailPayload = {
          to: requester.email,
          subject: `✅ Trip Request Approved — ${req_num}`,
          html: tripApprovedHtml({ name: requester.first_name, req_num, destination: trip.destination ?? '', tripDate }),
        }

      } else if (type === 'trip_assigned' && requester?.email) {
        const plate = trip.vehicle?.plate_number ?? 'TBA'
        const vehicleName = trip.vehicle ? `${trip.vehicle.make} ${trip.vehicle.model} (${plate})` : plate
        emailPayload = {
          to: requester.email,
          subject: `🚗 Vehicle Assigned — Trip ${req_num}`,
          html: tripAssignedHtml({ name: requester.first_name, req_num, destination: trip.destination ?? '', tripDate, vehicle: vehicleName }),
        }

      } else if (type === 'trip_rejected' && requester?.email) {
        emailPayload = {
          to: requester.email,
          subject: `Trip Request Update — ${req_num}`,
          html: tripRejectedHtml({ name: requester.first_name, req_num, destination: trip.destination ?? '', tripDate, reason: trip.rejection_reason ?? '' }),
        }
      }
    }

    // ── ATTENDANCE EVENTS ─────────────────────────────────────────────────────
    if (resolvedEntityType === 'attendance') {
      const { data: rec, error } = await supabase
        .from('attendance_records')
        .select('*, employee:users_profile!attendance_records_user_id_fkey(first_name, last_name, email)')
        .eq('id', resolvedEntityId)
        .single()

      if (error || !rec) throw error ?? new Error('Attendance record not found')
      const emp = rec.employee
      if (!emp?.email) { console.warn('Employee has no email'); return ok() }

      const checkInTime  = new Date(rec.check_in_time).toLocaleTimeString('en-KE', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' })
      const checkOutTime = rec.check_out_time
        ? new Date(rec.check_out_time).toLocaleTimeString('en-KE', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' })
        : null
      const dateStr = new Date(rec.date).toLocaleDateString('en-KE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

      if (type === 'attendance_late') {
        emailPayload = {
          to: emp.email,
          subject: `Late Check-In Recorded — ${dateStr}`,
          html: attendanceLateHtml({ name: emp.first_name, dateStr, checkInTime }),
        }
      } else if (type === 'attendance_auto_checkout') {
        emailPayload = {
          to: emp.email,
          subject: `Auto Check-Out Applied — ${dateStr}`,
          html: attendanceAutoCheckoutHtml({ name: emp.first_name, dateStr, checkOutTime: checkOutTime ?? 'Unknown' }),
        }
      }
    }

    // ── DOCUMENT EVENTS ───────────────────────────────────────────────────────
    if (resolvedEntityType === 'document') {
      // employee_documents: notify the employee
      const { data: doc, error } = await supabase
        .from('employee_documents')
        .select('*, employee:users_profile!employee_documents_user_id_fkey(first_name, last_name, email), uploader:users_profile!employee_documents_uploaded_by_fkey(first_name, last_name)')
        .eq('id', resolvedEntityId)
        .single()

      if (!error && doc?.employee?.email) {
        const uploaderName = doc.uploader ? `${doc.uploader.first_name} ${doc.uploader.last_name}` : 'HR'
        emailPayload = {
          to: doc.employee.email,
          subject: `New Document Added to Your Profile`,
          html: documentUploadedHtml({ name: doc.employee.first_name, docName: doc.document_name, docType: doc.document_type, uploaderName }),
        }
      }
    }

    if (!emailPayload) {
      console.log(`No email action for type=${type}, entityType=${resolvedEntityType}`)
      return ok()
    }

    // ── Send via Resend ───────────────────────────────────────────────────────
    // CC HR admin on all leave emails (except leave_hod_approved where HR is already the primary recipient)
    const isLeaveEvent = resolvedEntityType === 'leave'
    const isHrPrimary  = type === 'leave_hod_approved'
    const ccAddresses  = isLeaveEvent && !isHrPrimary && HR_CC_EMAIL && HR_CC_EMAIL !== emailPayload.to
      ? [HR_CC_EMAIL]
      : []

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to:   emailPayload.to,
        cc:   ccAddresses.length > 0 ? ccAddresses : undefined,
        subject: emailPayload.subject,
        html: emailPayload.html,
      }),
    })

    const resData = await res.json()
    if (!res.ok) throw new Error(`Resend error: ${resData.message ?? JSON.stringify(resData)}`)

    console.log(`Email sent [${type}] to ${emailPayload.to}${ccAddresses.length ? ` (cc: ${ccAddresses.join(', ')})` : ''} — id: ${resData.id}`)
    return ok()

  } catch (err) {
    console.error('send-email error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

function ok() {
  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  })
}

// ── HTML Templates ─────────────────────────────────────────────────────────────

function wrap(headerColor: string, headerText: string, body: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:20px}
    .card{max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1)}
    .hd{background:${headerColor};color:#fff;padding:20px 24px}
    .hd h2{margin:0;font-size:1.2rem}
    .bd{padding:24px}
    table{width:100%;border-collapse:collapse;margin:16px 0}
    td{padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:.9rem}
    td:first-child{color:#6b7280;white-space:nowrap;width:35%}
    .btn{display:inline-block;margin-top:20px;padding:11px 22px;border-radius:6px;background:${headerColor};color:#fff;text-decoration:none;font-weight:600;font-size:.9rem}
    .ft{text-align:center;padding:16px;color:#9ca3af;font-size:.75rem}
  </style></head><body>
  <div class="card">
    <div class="hd"><h2>${headerText}</h2></div>
    <div class="bd">${body}</div>
    <div class="ft">FKF HR Management System — This is an automated message, please do not reply.</div>
  </div></body></html>`
}

function leaveSubmittedHtml({ empName, hodName, lt, from, to, days, reason }: Record<string,string|number>) {
  return wrap('#4f46e5', '📋 Leave Request — Action Required', `
    <p>Hi ${hodName},</p>
    <p><strong>${empName}</strong> has submitted a leave request requiring your approval:</p>
    <table>
      <tr><td>Leave Type</td><td>${lt}</td></tr>
      <tr><td>From</td><td>${from}</td></tr>
      <tr><td>To</td><td>${to}</td></tr>
      <tr><td>Duration</td><td>${days} working day(s)</td></tr>
      ${reason ? `<tr><td>Reason</td><td>${reason}</td></tr>` : ''}
    </table>
    <a href="${APP_URL}/leave-approvals" class="btn">Review Request</a>`)
}

function leaveHodApprovedHtml({ empName, hrName, lt, from, to, days }: Record<string,string|number>) {
  return wrap('#0891b2', '⏳ Leave Awaiting Final Approval', `
    <p>Hi ${hrName},</p>
    <p><strong>${empName}</strong>'s leave request has been approved by the HOD and is awaiting your final approval:</p>
    <table>
      <tr><td>Leave Type</td><td>${lt}</td></tr>
      <tr><td>From</td><td>${from}</td></tr>
      <tr><td>To</td><td>${to}</td></tr>
      <tr><td>Duration</td><td>${days} working day(s)</td></tr>
    </table>
    <a href="${APP_URL}/leave-approvals" class="btn">Give Final Approval</a>`)
}

function leaveApprovedHtml({ empName, lt, from, to, days, approverName, comments }: Record<string,string|number>) {
  return wrap('#16a34a', '✅ Leave Request Approved', `
    <p>Hi ${empName},</p>
    <p>Your leave request has been <strong>approved</strong>.</p>
    <table>
      <tr><td>Leave Type</td><td>${lt}</td></tr>
      <tr><td>From</td><td>${from}</td></tr>
      <tr><td>To</td><td>${to}</td></tr>
      <tr><td>Duration</td><td>${days} working day(s)</td></tr>
      <tr><td>Approved By</td><td>${approverName}</td></tr>
      ${comments ? `<tr><td>Comments</td><td>${comments}</td></tr>` : ''}
    </table>
    <p>Enjoy your time off! 🎉</p>
    <a href="${APP_URL}/my-leave" class="btn">View My Leave</a>`)
}

function leaveRejectedHtml({ empName, lt, from, to, days, reviewerName, reason }: Record<string,string|number>) {
  return wrap('#dc2626', 'Leave Request — Not Approved', `
    <p>Hi ${empName},</p>
    <p>Your leave request has been reviewed and unfortunately <strong>cannot be approved</strong> at this time.</p>
    <table>
      <tr><td>Leave Type</td><td>${lt}</td></tr>
      <tr><td>From</td><td>${from}</td></tr>
      <tr><td>To</td><td>${to}</td></tr>
      <tr><td>Duration</td><td>${days} working day(s)</td></tr>
      <tr><td>Reviewed By</td><td>${reviewerName}</td></tr>
      ${reason ? `<tr><td>Reason</td><td>${reason}</td></tr>` : ''}
    </table>
    <p>Please contact your manager or HR if you have questions.</p>
    <a href="${APP_URL}/my-leave" class="btn">View My Leave</a>`)
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function leaveRecalledHtml({ empName, lt, from, to, days, effective, daysRestored, recalledByName, reason }: Record<string,string|number>) {
  return wrap('#d97706', '↩ Leave Recalled', `
    <p>Hi ${escapeHtml(String(empName))},</p>
    <p>Your approved leave has been <strong>recalled</strong>. Please report back to work from <strong>${effective}</strong>.</p>
    <table>
      <tr><td>Leave Type</td><td>${escapeHtml(String(lt))}</td></tr>
      <tr><td>Original Period</td><td>${from} – ${to} (${days} working day(s))</td></tr>
      <tr><td>Recall Effective</td><td>${effective}</td></tr>
      <tr><td>Days Restored</td><td>${daysRestored} working day(s) returned to your balance</td></tr>
      <tr><td>Recalled By</td><td>${escapeHtml(String(recalledByName))}</td></tr>
      ${reason ? `<tr><td>Reason</td><td>${escapeHtml(String(reason))}</td></tr>` : ''}
    </table>
    <p>Please contact HR if you have questions.</p>
    <a href="${APP_URL}/my-leave" class="btn">View My Leave</a>`)
}

function tripApprovedHtml({ name, req_num, destination, tripDate }: Record<string,string>) {
  return wrap('#16a34a', '✅ Trip Request Approved', `
    <p>Hi ${name},</p>
    <p>Your trip request has been <strong>approved</strong>. A vehicle will be assigned shortly.</p>
    <table>
      <tr><td>Reference</td><td>${req_num}</td></tr>
      <tr><td>Destination</td><td>${destination}</td></tr>
      <tr><td>Date / Time</td><td>${tripDate}</td></tr>
    </table>
    <a href="${APP_URL}/fleet/my-trips" class="btn">View My Trips</a>`)
}

function tripAssignedHtml({ name, req_num, destination, tripDate, vehicle }: Record<string,string>) {
  return wrap('#4f46e5', '🚗 Vehicle Assigned to Your Trip', `
    <p>Hi ${name},</p>
    <p>A vehicle has been assigned to your trip. Your trip is <strong>confirmed</strong>.</p>
    <table>
      <tr><td>Reference</td><td>${req_num}</td></tr>
      <tr><td>Vehicle</td><td>${vehicle}</td></tr>
      <tr><td>Destination</td><td>${destination}</td></tr>
      <tr><td>Date / Time</td><td>${tripDate}</td></tr>
    </table>
    <a href="${APP_URL}/fleet/my-trips" class="btn">View Trip Details</a>`)
}

function tripRejectedHtml({ name, req_num, destination, tripDate, reason }: Record<string,string>) {
  return wrap('#dc2626', 'Trip Request — Not Approved', `
    <p>Hi ${name},</p>
    <p>Your trip request could not be approved at this time.</p>
    <table>
      <tr><td>Reference</td><td>${req_num}</td></tr>
      <tr><td>Destination</td><td>${destination}</td></tr>
      <tr><td>Date / Time</td><td>${tripDate}</td></tr>
      ${reason ? `<tr><td>Reason</td><td>${reason}</td></tr>` : ''}
    </table>
    <p>Please contact the Fleet Manager for more information.</p>`)
}

function attendanceLateHtml({ name, dateStr, checkInTime }: Record<string,string>) {
  return wrap('#d97706', '🕐 Late Check-In Recorded', `
    <p>Hi ${name},</p>
    <p>Your attendance for <strong>${dateStr}</strong> has been recorded as <strong>late</strong>.</p>
    <table>
      <tr><td>Check-In Time</td><td>${checkInTime}</td></tr>
      <tr><td>Status</td><td>Late</td></tr>
    </table>
    <p>If you believe this is incorrect, please contact your manager or HR.</p>
    <a href="${APP_URL}/attendance" class="btn">View Attendance</a>`)
}

function attendanceAutoCheckoutHtml({ name, dateStr, checkOutTime }: Record<string,string>) {
  return wrap('#6b7280', '🔄 Auto Check-Out Applied', `
    <p>Hi ${name},</p>
    <p>You were automatically checked out on <strong>${dateStr}</strong>.</p>
    <table>
      <tr><td>Auto Check-Out Time</td><td>${checkOutTime}</td></tr>
    </table>
    <p>If your actual departure time was different, please contact HR to have it corrected.</p>
    <a href="${APP_URL}/attendance" class="btn">View Attendance</a>`)
}

function documentUploadedHtml({ name, docName, docType, uploaderName }: Record<string,string>) {
  return wrap('#4f46e5', '📄 New Document Added to Your Profile', `
    <p>Hi ${name},</p>
    <p><strong>${uploaderName}</strong> has uploaded a new document to your employee profile:</p>
    <table>
      <tr><td>Document</td><td>${docName}</td></tr>
      <tr><td>Type</td><td>${docType}</td></tr>
    </table>
    <p>You can view and download it in the Documents section.</p>
    <a href="${APP_URL}/documents" class="btn">View Documents</a>`)
}
