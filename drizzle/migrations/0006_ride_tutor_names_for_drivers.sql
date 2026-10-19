-- Nomes dos tutores para o painel do motorista: só quem está na corrida vê o nome do tutor.
create or replace function public.ride_tutor_names(_ride_ids uuid[])
returns table(ride_id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, p.full_name
  from public.rides r
  join public.profiles p on p.id = r.tutor_id
  where r.id = any (_ride_ids)
    and r.driver_id = auth.uid();
$$;

comment on function public.ride_tutor_names(uuid[]) is 'Tutor name per ride, only for rides the caller drives. Used by the driver panel.';

alter function public.ride_tutor_names(uuid[]) owner to postgres;
revoke execute on function public.ride_tutor_names(uuid[]) from public;
grant execute on function public.ride_tutor_names(uuid[]) to authenticated;
grant execute on function public.ride_tutor_names(uuid[]) to service_role;