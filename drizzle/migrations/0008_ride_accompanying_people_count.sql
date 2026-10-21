ALTER TABLE public.rides ADD COLUMN accompanying_people_count integer;
ALTER TABLE public.rides ADD CONSTRAINT rides_accompanying_people_count_positive CHECK (accompanying_people_count IS NULL OR accompanying_people_count > 0);
COMMENT ON COLUMN public.rides.accompanying_people_count IS 'Total accompanying people, including the tutor; NULL when absent or not informed on legacy rides.';