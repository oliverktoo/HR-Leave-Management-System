import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { type, requestId } = await req.json()

    // Fetch leave request details
    const { data: request, error: requestError } = await supabase
      .from('leave_requests')
      .select(`
        *,
        users_profile!leave_requests_user_id_fkey (
          first_name,
          last_name,
          email,
          department_id,
          departments!users_profile_department_id_fkey (
            head_of_department_id,
            name
          )
        ),
        leave_types (name),
        reviewed_by_user:users_profile!leave_requests_reviewed_by_fkey (
          first_name,
          last_name
        )
      `)
      .eq('id', requestId)
      .single()

    if (requestError) {
      console.error('Failed to fetch request:', requestError)
      throw requestError
    }

    let emailData = {}
    let recipients = []

    switch (type) {
      case 'request_submitted':
        // Notify HOD
        const { data: hod } = await supabase
          .from('users_profile')
          .select('email, first_name, last_name')
          .eq('id', request.users_profile.departments.head_of_department_id)
          .single()

        if (hod) {
          recipients.push(hod.email)
          emailData = {
            to: hod.email,
            subject: `[ACTION REQUIRED] Leave Request - ${request.users_profile.first_name} ${request.users_profile.last_name}`,
            html: generateRequestSubmittedEmail(request, hod),
          }
        }
        break

      case 'request_approved':
        // Notify employee
        recipients.push(request.users_profile.email)
        emailData = {
          to: request.users_profile.email,
          subject: '✅ Your Leave Request Has Been Approved',
          html: generateRequestApprovedEmail(request),
        }
        break

      case 'request_rejected':
        // Notify employee
        recipients.push(request.users_profile.email)
        emailData = {
          to: request.users_profile.email,
          subject: '❌ Leave Request Update',
          html: generateRequestRejectedEmail(request),
        }
        break
    }

    // Send email using Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY environment variable is not set')
    }

    console.log('Sending email to:', emailData.to)

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: 'FKF Leave Management <onboarding@resend.dev>',
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html,
      }),
    })

    const resendData = await resendResponse.json()

    if (!resendResponse.ok) {
      console.error('Resend API error:', resendData)
      throw new Error(`Failed to send email: ${resendData.message || 'Unknown error'}`)
    }

    console.log('Email sent successfully:', resendData)

    return new Response(
      JSON.stringify({ success: true, message: 'Email sent successfully' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})

// Email Templates
function generateRequestSubmittedEmail(request, hod) {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4F46E5; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #fff; padding: 20px; border: 1px solid #e5e7eb; }
    .details { background: #f3f4f6; padding: 15px; margin: 15px 0; border-radius: 6px; }
    .button { display: inline-block; padding: 12px 24px; margin: 5px; text-decoration: none; border-radius: 6px; font-weight: bold; }
    .btn-approve { background: #10B981; color: white; }
    .btn-reject { background: #EF4444; color: white; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Leave Request Pending Approval</h2>
    </div>
    <div class="content">
      <p>Hi ${hod.first_name},</p>
      <p><strong>${request.users_profile.first_name} ${request.users_profile.last_name}</strong> has submitted a leave request requiring your approval:</p>
      
      <div class="details">
        <p><strong>Leave Type:</strong> ${request.leave_types.name}</p>
        <p><strong>Duration:</strong> ${new Date(request.start_date).toLocaleDateString()} to ${new Date(request.end_date).toLocaleDateString()}</p>
        <p><strong>Total Days:</strong> ${request.total_days} working days</p>
        <p><strong>Reason:</strong> ${request.reason}</p>
        <p><strong>Submitted:</strong> ${new Date(request.created_at).toLocaleString()}</p>
      </div>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${Deno.env.get('APP_URL')}/approvals" class="button btn-approve">Review Request</a>
      </div>
      
      <p style="color: #6b7280; font-size: 14px;">
        Please review this request at your earliest convenience.
      </p>
    </div>
    <div class="footer">
      <p>Leave Management System | Powered by FKF HQ</p>
    </div>
  </div>
</body>
</html>
  `
}

function generateRequestApprovedEmail(request) {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #10B981; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #fff; padding: 20px; border: 1px solid #e5e7eb; }
    .details { background: #f3f4f6; padding: 15px; margin: 15px 0; border-radius: 6px; }
    .button { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>✅ Leave Request Approved!</h2>
    </div>
    <div class="content">
      <p>Hi ${request.users_profile.first_name},</p>
      <p>Good news! Your leave request has been approved.</p>
      
      <div class="details">
        <p><strong>Leave Type:</strong> ${request.leave_types.name}</p>
        <p><strong>Dates:</strong> ${new Date(request.start_date).toLocaleDateString()} to ${new Date(request.end_date).toLocaleDateString()}</p>
        <p><strong>Total Days:</strong> ${request.total_days} working days</p>
      </div>
      
      <p><strong>Approved By:</strong> ${request.reviewed_by_user?.first_name} ${request.reviewed_by_user?.last_name}</p>
      ${request.reviewer_comments ? `<p><strong>Comments:</strong> ${request.reviewer_comments}</p>` : ''}
      
      <p style="margin-top: 30px;">Enjoy your time off! 🎉</p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${Deno.env.get('APP_URL')}/leave-history" class="button">View Details</a>
      </div>
    </div>
    <div class="footer">
      <p>Leave Management System | Powered by FKF HQ</p>
    </div>
  </div>
</body>
</html>
  `
}

function generateRequestRejectedEmail(request) {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #EF4444; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #fff; padding: 20px; border: 1px solid #e5e7eb; }
    .details { background: #f3f4f6; padding: 15px; margin: 15px 0; border-radius: 6px; }
    .button { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Leave Request Update</h2>
    </div>
    <div class="content">
      <p>Hi ${request.users_profile.first_name},</p>
      <p>Your leave request has been reviewed and unfortunately cannot be approved at this time.</p>
      
      <div class="details">
        <p><strong>Leave Type:</strong> ${request.leave_types.name}</p>
        <p><strong>Dates:</strong> ${new Date(request.start_date).toLocaleDateString()} to ${new Date(request.end_date).toLocaleDateString()}</p>
        <p><strong>Total Days:</strong> ${request.total_days} working days</p>
      </div>
      
      <p><strong>Reviewed By:</strong> ${request.reviewed_by_user?.first_name} ${request.reviewed_by_user?.last_name}</p>
      ${request.reviewer_comments ? `<p><strong>Reason:</strong> ${request.reviewer_comments}</p>` : ''}
      
      <p style="margin-top: 20px;">Please contact your manager if you have any questions.</p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${Deno.env.get('APP_URL')}/leave-history" class="button">View Details</a>
      </div>
    </div>
    <div class="footer">
      <p>Leave Management System | Powered by FKF HQ</p>
    </div>
  </div>
</body>
</html>
  `
}
