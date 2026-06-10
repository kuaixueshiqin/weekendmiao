-- trips: 行程主体
CREATE TABLE public.trips (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id   TEXT        NOT NULL,
  title       TEXT        NOT NULL DEFAULT '新行程',
  dates       TEXT        NOT NULL DEFAULT '待定',
  active      BOOLEAN     NOT NULL DEFAULT false,
  favorited   BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX trips_device_id_idx ON public.trips(device_id, updated_at DESC);

-- trip_items: 行程点（支持多天）
CREATE TABLE public.trip_items (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id     UUID        NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  day         INT         NOT NULL DEFAULT 1,
  date        TEXT        NOT NULL DEFAULT '',
  period      TEXT        NOT NULL DEFAULT '',
  sort_order  INT         NOT NULL DEFAULT 0,
  time        TEXT        NOT NULL DEFAULT '',
  name        TEXT        NOT NULL DEFAULT '',
  type        TEXT        NOT NULL DEFAULT 'scenic',  -- scenic | food | hotel
  description TEXT        NOT NULL DEFAULT '',
  price       TEXT        NOT NULL DEFAULT '',
  status      TEXT        NOT NULL DEFAULT 'unbooked', -- unbooked | pending | completed | expired
  code        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX trip_items_trip_id_idx ON public.trip_items(trip_id, day, sort_order);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips      TO anon, authenticated;
GRANT ALL                            ON public.trips      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_items TO anon, authenticated;
GRANT ALL                            ON public.trip_items TO service_role;

-- RLS (same open policy as conversations/messages — device_id enforced client-side)
ALTER TABLE public.trips      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public trips all"      ON public.trips      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public trip_items all" ON public.trip_items FOR ALL USING (true) WITH CHECK (true);

-- Auto-update updated_at on trips
CREATE TRIGGER update_trips_updated_at
  BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();