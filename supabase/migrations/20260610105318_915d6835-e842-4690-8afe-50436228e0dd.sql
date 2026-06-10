
-- Add user_id column to conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Remove old permissive policies
DROP POLICY IF EXISTS "public conversations all" ON public.conversations;
DROP POLICY IF EXISTS "public messages all" ON public.messages;

-- Revoke broad anon grants (keep authenticated)
REVOKE ALL ON public.conversations FROM anon;
REVOKE ALL ON public.messages FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.conversations TO service_role;
GRANT ALL ON public.messages TO service_role;

-- Strict per-user policies for conversations
CREATE POLICY "Users select own conversations"
  ON public.conversations FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own conversations"
  ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own conversations"
  ON public.conversations FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own conversations"
  ON public.conversations FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Strict per-user policies for messages (scoped via parent conversation ownership)
CREATE POLICY "Users select own messages"
  ON public.messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND c.user_id = auth.uid()));

CREATE POLICY "Users insert own messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND c.user_id = auth.uid()));

CREATE POLICY "Users update own messages"
  ON public.messages FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND c.user_id = auth.uid()));

CREATE POLICY "Users delete own messages"
  ON public.messages FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND c.user_id = auth.uid()));
