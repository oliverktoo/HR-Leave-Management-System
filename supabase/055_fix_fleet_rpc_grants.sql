-- Migration 055: Fix fleet RPC function grants + driver_profiles visibility
-- ─────────────────────────────────────────────────────────────────────────────
-- Root cause: is_vehicle_available / is_driver_available / is_user_on_leave
-- were created without explicit GRANT EXECUTE to the authenticated role.
-- PostgREST calls to supabase.rpc() failed silently, causing getAvailableVehicles
-- and getAvailableDrivers to return empty arrays and show "No vehicles/drivers".
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Grant EXECUTE on fleet RPC functions ─────────────────────────────────

GRANT EXECUTE ON FUNCTION public.is_vehicle_available(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_driver_available(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_on_leave(UUID, DATE)                                 TO authenticated;

-- ─── 2. Ensure driver_profiles is readable by hod role too ───────────────────
-- HODs need to see drivers when they are acting as fleet approvers.

DROP POLICY IF EXISTS "driver_profiles_select_hod" ON public.driver_profiles;
CREATE POLICY "driver_profiles_select_hod" ON public.driver_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users_profile
      WHERE id = auth.uid() AND role = 'hod'
    )
  );

-- ─── 3. Ensure fleet_vehicles has full RLS grants for authenticated ───────────

GRANT SELECT, INSERT, UPDATE ON TABLE public.fleet_vehicles   TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.driver_profiles  TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.trip_requests    TO authenticated;

-- ─── Reload schema cache ──────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
