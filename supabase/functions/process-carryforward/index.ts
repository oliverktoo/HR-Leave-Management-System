import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const currentYear = new Date().getFullYear()
    const nextYear = currentYear + 1

    // Get all active users
    const { data: users, error: usersError } = await supabase
      .from('users_profile')
      .select('id')
      .eq('is_active', true)

    if (usersError) throw usersError

    // Get all leave types with carryforward enabled
    const { data: leaveTypes, error: typesError } = await supabase
      .from('leave_types')
      .select('*')
      .eq('is_active', true)

    if (typesError) throw typesError

    let processedCount = 0
    let errors = []

    for (const user of users) {
      for (const leaveType of leaveTypes) {
        try {
          // Get current year balance
          const { data: currentBalance } = await supabase
            .from('leave_balances')
            .select('*')
            .eq('user_id', user.id)
            .eq('leave_type_id', leaveType.id)
            .eq('year', currentYear)
            .single()

          if (!currentBalance) continue

          // Calculate unused days
          const unusedDays = currentBalance.annual_allocation + 
                            currentBalance.carryforward_days - 
                            currentBalance.used_days

          // Calculate carryforward for next year
          let carryforwardDays = 0
          if (leaveType.allow_carryforward && unusedDays > 0) {
            carryforwardDays = Math.min(unusedDays, leaveType.max_carryforward_days)
          }

          // Create or update next year's balance
          const { error: upsertError } = await supabase
            .from('leave_balances')
            .upsert({
              user_id: user.id,
              leave_type_id: leaveType.id,
              year: nextYear,
              annual_allocation: leaveType.max_days_per_year,
              used_days: 0,
              pending_days: 0,
              carryforward_days: carryforwardDays,
            }, {
              onConflict: 'user_id,leave_type_id,year'
            })

          if (upsertError) throw upsertError

          processedCount++
        } catch (error) {
          errors.push({
            user_id: user.id,
            leave_type_id: leaveType.id,
            error: error.message
          })
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: processedCount,
        errors: errors.length > 0 ? errors : null,
        message: `Successfully processed ${processedCount} balances for year ${nextYear}`
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
