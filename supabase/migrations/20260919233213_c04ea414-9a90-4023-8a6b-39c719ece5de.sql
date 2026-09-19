revoke execute on function public.pet_photo_readable(text) from public, anon;
grant execute on function public.pet_photo_readable(text) to authenticated;