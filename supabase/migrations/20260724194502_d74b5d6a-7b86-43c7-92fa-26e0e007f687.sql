
CREATE POLICY "contracts bucket read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'contracts');
CREATE POLICY "contracts bucket insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contracts');
CREATE POLICY "contracts bucket update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'contracts')
  WITH CHECK (bucket_id = 'contracts');
