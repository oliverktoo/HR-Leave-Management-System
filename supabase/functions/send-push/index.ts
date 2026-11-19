// Edge Function: send-push
// Called by DB trigger when a notification row is inserted.
// Fetches the user's FCM push token and sends a push via Firebase Cloud Messaging v1 API.
//
// Required Supabase secrets (set in Dashboard → Edge Functions → Secrets):
//   FCM_PROJECT_ID        — Firebase project ID (e.g. "fkf-hr-app")
//   FCM_SERVICE_ACCOUNT   — Full service account JSON as a string
//
// Deploy: supabase functions deploy send-push --no-verify-jwt

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FCM_PROJECT_ID      = Deno.env.get('FCM_PROJECT_ID') ?? ''
const FCM_SERVICE_ACCOUNT = Deno.env.get('FCM_SERVICE_ACCOUNT') ?? ''

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Validate FCM is configured
    if (!FCM_PROJECT_ID || !FCM_SERVICE_ACCOUNT) {
      console.warn('FCM not configured — skipping push notification')
      return ok()
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json()
    const { user_id, title, message, type } = body

    if (!user_id || !title) {
      throw new Error('Missing required fields: user_id, title')
    }

    // Fetch user's push token from users_profile
    const { data: profile, error } = await supabase
      .from('users_profile')
      .select('push_token, first_name')
      .eq('id', user_id)
      .single()

    if (error || !profile) {
      console.warn(`User ${user_id} not found — skipping push`)
      return ok()
    }

    if (!profile.push_token) {
      console.log(`User ${user_id} has no push token — skipping`)
      return ok()
    }

    // Get FCM access token using service account
    const accessToken = await getFCMAccessToken(FCM_SERVICE_ACCOUNT)

    // Send FCM v1 message
    const fcmRes = await fetch(
      `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: {
            token: profile.push_token,
            notification: {
              title,
              body: message,
            },
            data: {
              type: type ?? 'system',
              click_action: 'FLUTTER_NOTIFICATION_CLICK',
            },
            android: {
              notification: {
                sound: 'default',
                priority: 'high',
              },
            },
            apns: {
              payload: {
                aps: {
                  sound: 'default',
                  badge: 1,
                },
              },
            },
          },
        }),
      }
    )

    const fcmData = await fcmRes.json()

    if (!fcmRes.ok) {
      // Token may be stale — clear it so we don't retry
      if (fcmData?.error?.status === 'NOT_FOUND' || fcmData?.error?.status === 'INVALID_ARGUMENT') {
        console.warn(`Stale push token for user ${user_id} — clearing`)
        await supabase
          .from('users_profile')
          .update({ push_token: null })
          .eq('id', user_id)
      }
      throw new Error(`FCM error: ${JSON.stringify(fcmData)}`)
    }

    console.log(`Push sent to ${user_id} — FCM message id: ${fcmData.name}`)
    return ok()

  } catch (err) {
    console.error('send-push error:', err)
    // Return 200 even on error so the DB trigger doesn't see it as a failure
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})

function ok() {
  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  })
}

// ── FCM OAuth2 helper using service account JWT ─────────────────────────────
// Signs a JWT with the service account private key and exchanges it for an
// access token scoped to Firebase Cloud Messaging.

async function getFCMAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson)

  const now = Math.floor(Date.now() / 1000)
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim  = btoa(JSON.stringify({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  }))

  const payload = `${header}.${claim}`

  // Import the RSA private key
  const pemKey = sa.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')

  const keyBuffer = Uint8Array.from(atob(pemKey), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(payload)
  )

  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  const jwt = `${payload}.${signature}`

  // Exchange JWT for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const tokenData = await tokenRes.json()
  if (!tokenRes.ok) throw new Error(`OAuth error: ${JSON.stringify(tokenData)}`)

  return tokenData.access_token
}
