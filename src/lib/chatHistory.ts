import { supabase } from "@/integrations/supabase/client";

const DEVICE_KEY = "weekendmiao_device_id";

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id =
      (crypto.randomUUID && crypto.randomUUID()) ||
      `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

// Ensure there is an authenticated (anonymous) session so RLS policies
// scoped to auth.uid() apply. Safe to call repeatedly.
let ensureAuthPromise: Promise<string | null> | null = null;
export function ensureAuth(): Promise<string | null> {
  if (ensureAuthPromise) return ensureAuthPromise;
  ensureAuthPromise = (async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user?.id) return data.session.user.id;
    const { data: signIn, error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.error("anonymous sign-in failed", error);
      return null;
    }
    return signIn.user?.id ?? null;
  })();
  return ensureAuthPromise;
}

export interface ConversationRow {
  id: string;
  device_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  metadata: any;
  created_at: string;
}

export async function createConversation(title: string): Promise<ConversationRow | null> {
  const userId = await ensureAuth();
  if (!userId) return null;
  const { data, error } = await supabase
    .from("conversations")
    .insert({ device_id: getDeviceId(), user_id: userId, title: title.slice(0, 40) || "新对话" })
    .select()
    .single();
  if (error) {
    console.error("createConversation error", error);
    return null;
  }
  return data as ConversationRow;
}

export async function touchConversation(id: string, title?: string) {
  const patch: any = { updated_at: new Date().toISOString() };
  if (title) patch.title = title.slice(0, 40);
  const { error } = await supabase.from("conversations").update(patch).eq("id", id);
  if (error) console.error("touchConversation error", error);
}

export async function saveMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  metadata?: any
) {
  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    role,
    content,
    metadata: metadata ?? null,
  });
  if (error) console.error("saveMessage error", error);
}

export async function listConversations(): Promise<ConversationRow[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("device_id", getDeviceId())
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("listConversations error", error);
    return [];
  }
  return (data || []) as ConversationRow[];
}

export async function loadMessages(conversationId: string): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("loadMessages error", error);
    return [];
  }
  return (data || []) as MessageRow[];
}

export async function deleteConversation(id: string) {
  const { error } = await supabase.from("conversations").delete().eq("id", id);
  if (error) console.error("deleteConversation error", error);
}

// Group conversations by relative time bucket
export function groupByTime(items: ConversationRow[]) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekAgo = startOfToday - 6 * 86400000;
  const monthAgo = startOfToday - 29 * 86400000;

  const groups: Record<string, ConversationRow[]> = { 今天: [], 本周: [], 本月: [], 更早: [] };
  for (const c of items) {
    const t = new Date(c.updated_at).getTime();
    if (t >= startOfToday) groups["今天"].push(c);
    else if (t >= weekAgo) groups["本周"].push(c);
    else if (t >= monthAgo) groups["本月"].push(c);
    else groups["更早"].push(c);
  }
  return (["今天", "本周", "本月", "更早"] as const)
    .map((label) => ({ label, items: groups[label] }))
    .filter((g) => g.items.length > 0);
}
