
CREATE TABLE IF NOT EXISTS public.eta_traffic_calibration (
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  hour smallint NOT NULL CHECK (hour BETWEEN 0 AND 23),
  avg_speed_kmh numeric NOT NULL CHECK (avg_speed_kmh > 0),
  samples integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'seed',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (weekday, hour)
);

GRANT SELECT ON public.eta_traffic_calibration TO authenticated;
GRANT ALL ON public.eta_traffic_calibration TO service_role;

ALTER TABLE public.eta_traffic_calibration ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eta_calibration_select ON public.eta_traffic_calibration;
CREATE POLICY eta_calibration_select ON public.eta_traffic_calibration
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.eta_traffic_calibration (weekday, hour, avg_speed_kmh, samples, source)
SELECT w, h,
  ROUND((
    CASE
      WHEN h BETWEEN 0 AND 5 THEN 38
      WHEN h = 6 THEN 30
      WHEN h BETWEEN 7 AND 9 THEN 18
      WHEN h BETWEEN 10 AND 16 THEN 24
      WHEN h BETWEEN 17 AND 19 THEN 16
      WHEN h BETWEEN 20 AND 21 THEN 24
      ELSE 32
    END
    * CASE WHEN w IN (0, 6) THEN 1.25 ELSE 1.0 END
  )::numeric, 1),
  0, 'seed'
FROM generate_series(0, 6) AS w, generate_series(0, 23) AS h
ON CONFLICT (weekday, hour) DO NOTHING;

CREATE OR REPLACE FUNCTION public.refresh_eta_calibration(_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _updated integer := 0;
BEGIN
  WITH base AS (
    SELECT
      EXTRACT(DOW FROM (COALESCE(r.arrived_at, r.scheduled_at) AT TIME ZONE 'America/Sao_Paulo'))::smallint AS weekday,
      EXTRACT(HOUR FROM (COALESCE(r.arrived_at, r.scheduled_at) AT TIME ZONE 'America/Sao_Paulo'))::smallint AS hour,
      r.distance_km
        / NULLIF(EXTRACT(EPOCH FROM (r.updated_at - COALESCE(r.arrived_at, r.scheduled_at))) / 3600.0, 0) AS speed
    FROM public.rides r
    WHERE r.status = 'completed'
      AND r.distance_km > 0
      AND r.scheduled_at >= now() - make_interval(days => GREATEST(_days, 1))
  ), ok AS (
    SELECT weekday, hour, speed FROM base
    WHERE speed IS NOT NULL AND speed BETWEEN 4 AND 80
  ), agg AS (
    SELECT weekday, hour, ROUND(AVG(speed)::numeric, 1) AS avg_speed, COUNT(*)::int AS n
    FROM ok GROUP BY weekday, hour HAVING COUNT(*) >= 3
  )
  INSERT INTO public.eta_traffic_calibration (weekday, hour, avg_speed_kmh, samples, source, updated_at)
  SELECT weekday, hour, avg_speed, n, 'real', now() FROM agg
  ON CONFLICT (weekday, hour) DO UPDATE
    SET avg_speed_kmh = EXCLUDED.avg_speed_kmh,
        samples = EXCLUDED.samples,
        source = 'real',
        updated_at = now();

  GET DIAGNOSTICS _updated = ROW_COUNT;
  RETURN _updated;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_eta_calibration(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_eta_calibration(integer) TO service_role;
