-- Official control points (OCP, the "6091/V" series) are part of the national trig network and are
-- selectable as control points like the PRIM/SEC/TERT/QUART/TSM stations. The registry's type check
-- listed only the trig types, so an OCP row could not be stored. Widen it.
ALTER TABLE public.zim_control_points DROP CONSTRAINT IF EXISTS zim_control_points_type_check;
ALTER TABLE public.zim_control_points
  ADD CONSTRAINT zim_control_points_type_check
  CHECK (type::text = ANY (ARRAY['PRIM', 'SEC', 'TERT', 'QUART', 'TSM', 'OCP']));
