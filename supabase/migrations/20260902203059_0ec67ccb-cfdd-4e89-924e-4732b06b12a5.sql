CREATE POLICY "pet_photos_read_authenticated" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'pet-photos');

CREATE POLICY "pet_photos_insert_own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'pet-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "pet_photos_update_own" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'pet-photos' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'pet-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "pet_photos_delete_own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'pet-photos' AND (storage.foldername(name))[1] = auth.uid()::text);