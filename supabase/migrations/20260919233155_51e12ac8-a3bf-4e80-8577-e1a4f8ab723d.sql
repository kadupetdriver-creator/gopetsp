create or replace function public.pet_photo_readable(_name text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select
    (storage.foldername(_name))[1] = auth.uid()::text
    or public.has_role(auth.uid(), 'admin')
    or exists (
      select 1
      from public.ride_pets rp
      join public.rides r on r.id = rp.ride_id
      where r.driver_id = auth.uid()
        and rp.pet_id::text = split_part((storage.foldername(_name))[2], '.', 1)
    )
$$;

drop policy pet_photos_read_own_or_admin on storage.objects;
create policy pet_photos_read_owner_driver_admin on storage.objects
for select to authenticated
using (bucket_id = 'pet-photos' and public.pet_photo_readable(name));