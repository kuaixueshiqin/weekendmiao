CREATE TABLE public.trips (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT '新行程',
  dates text NOT NULL DEFAULT '',
  days jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT false,
  favorited boolean NOT NULL DEFAULT false,
  source_conversation_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;
GRANT ALL ON public.trips TO service_role;

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own trips" ON public.trips
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own trips" ON public.trips
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own trips" ON public.trips
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own trips" ON public.trips
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER update_trips_updated_at
  BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX trips_user_updated_idx ON public.trips (user_id, updated_at DESC);