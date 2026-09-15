-- Add avatar_url to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Create storage bucket for avatars
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- RLS for avatars bucket (use IF NOT EXISTS to avoid errors on re-run)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Avatar images are publicly accessible.' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Avatar images are publicly accessible."
      ON storage.objects FOR SELECT
      USING ( bucket_id = 'avatars' );
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can upload their own avatar.' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Users can upload their own avatar."
      ON storage.objects FOR INSERT
      WITH CHECK ( bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1] );
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can update their own avatar.' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Users can update their own avatar."
      ON storage.objects FOR UPDATE
      WITH CHECK ( bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1] );
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete their own avatar.' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Users can delete their own avatar."
      ON storage.objects FOR DELETE
      USING ( bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1] );
  END IF;
END $$;
