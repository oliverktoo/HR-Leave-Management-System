// Edge Function: auto-checkout
// Checks out all staff who haven't checked out by the configured cutoff time (default 8pm EAT).
// Can be triggered by:
//   1. An external cron service (cron-job.org, GitHub Actions, etc.) via HTTP POST
//   2. The Supabase dashboard "Run" button for manual testing
//   3. pg_cron if enabled: SELECT net.http_post(url, headers, body) ...
//
// Authentication: accepts requests with the Authorization: Bearer <SERVICE_ROLE_KEY>
// OR a shared secret header X-Cron-Secret matching env var CRON_SECRET.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── Auth check ──────────────────────────────────────────────────────────
    const cronSecret = Deno.env.get('CRON_SECRET')
    const authHeader = req.headers.get('Authorization') ?? ''
    const secretHeader = req.headers.get('X-Cron-Secret') ?? ''

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const bearerToken = authHeader.replace('Bearer ', '')

    const authorized =
      bearerToken === serviceKey ||
      (cronSecret && secretHeader === cronSecret)

    if (!authorized) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Supabase client (service role — bypasses RLS) ────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceKey
    )

    // ── Call the DB function ─────────────────────────────────────────────────
    const { error } = await supabase.rpc('auto_checkout_absent_staff')

    if (error) {
      console.error('auto_checkout_absent_staff RPC error:', error)
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Also flag presence gaps ──────────────────────────────────────────────
    await supabase.rpc('flag_presence_gaps')

    const now = new Date().toISOString()
    console.log(`[${now}] auto-checkout ran successfully`)

    return new Response(
      JSON.stringify({ success: true, ran_at: now }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Unexpected error in auto-checkout function:', err)
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
