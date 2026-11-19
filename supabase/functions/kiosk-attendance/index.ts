// Edge Function: kiosk-attendance
// Called by the KioskScanner tablet app when a staff ID card QR code is scanned.
// Toggles check-in / check-out for the employee, using server_clock_in / server_clock_out
// RPCs (which set the timestamp server-side, preventing spoofing).
// Auth: uses Supabase service role key internally; accepts requests with the anon key.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const { employee_id } = body as { employee_id?: string }

    if (!employee_id || typeof employee_id !== 'string') {
      return json({ error: 'employee_id is required' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // ── Fetch employee profile ────────────────────────────────────────────────
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, full_name, photo_url, department, employee_id')
      .eq('id', employee_id)
      .maybeSingle()

    if (profileErr || !profile) {
      return json({ error: 'Employee not found' }, 404)
    }

    // ── EAT date / time helpers ───────────────────────────────────────────────
    const now = new Date()
    const eatDate = now.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }) // YYYY-MM-DD
    const eatTimeRaw = now.toLocaleTimeString('en-US', {
      timeZone: 'Africa/Nairobi',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }) // 'HH:MM:SS'
    const [eatHH, eatMM] = eatTimeRaw.split(':').map(Number)
    const isLate = eatHH > 9 || (eatHH === 9 && eatMM > 0)
    const displayTime = now.toLocaleTimeString('en-US', {
      timeZone: 'Africa/Nairobi',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }) // '09:15 AM'

    const common = {
      name:       profile.full_name,
      time:       displayTime,
      photo_url:  profile.photo_url  ?? null,
      department: profile.department ?? null,
    }

    // ── Check for an open record today (no check_out_time) ───────────────────
    const { data: openRecord } = await supabase
      .from('attendance_records')
      .select('id, check_in_time, check_out_time')
      .eq('user_id', employee_id)
      .eq('date', eatDate)
      .is('check_out_time', null)
      .maybeSingle()

    // ── CHECK IN ─────────────────────────────────────────────────────────────
    if (!openRecord) {
      const { error: rpcErr } = await supabase.rpc('server_clock_in', {
        p_employee_id:        profile.employee_id,
        p_employee_name:      profile.full_name,
        p_date:               eatDate,
        p_status:             isLate ? 'late' : 'present',
        p_location:           'Kiosk',
        p_ip_address:         null,
        p_notes:              null,
        p_selfie_url:         null,
        p_face_match_score:   null,
        p_face_verified_auto: null,
      })

      if (rpcErr) {
        console.error('server_clock_in error:', rpcErr)
        return json({ error: 'Check-in failed: ' + rpcErr.message }, 500)
      }

      return json({ ...common, action: 'check_in', status: isLate ? 'late' : 'present' })
    }

    // ── CHECK OUT ────────────────────────────────────────────────────────────
    const checkInMs = new Date(openRecord.check_in_time).getTime()
    const diffMs    = now.getTime() - checkInMs
    const diffHrs   = Math.floor(diffMs / 3_600_000)
    const diffMins  = Math.floor((diffMs % 3_600_000) / 60_000)
    const workHoursStr = `${diffHrs}h ${diffMins}m`

    const { error: rpcErr } = await supabase.rpc('server_clock_out', {
      p_record_id: openRecord.id,
      p_notes:     null,
    })

    if (rpcErr) {
      console.error('server_clock_out error:', rpcErr)
      return json({ error: 'Check-out failed: ' + rpcErr.message }, 500)
    }

    return json({ ...common, action: 'check_out', work_hours: workHoursStr })

  } catch (err) {
    console.error('kiosk-attendance unexpected error:', err)
    return json({ error: String(err) }, 500)
  }
})
