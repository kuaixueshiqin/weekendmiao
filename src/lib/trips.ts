import { supabase } from "@/integrations/supabase/client";
import { ensureAuth } from "@/lib/chatHistory";
import type { DayPlan } from "@/types/itinerary";

export interface TripRow {
  id: string;
  user_id: string;
  title: string;
  dates: string;
  days: DayPlan[];
  active: boolean;
  favorited: boolean;
  source_conversation_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function listTrips(): Promise<TripRow[]> {
  const uid = await ensureAuth();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("trips")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("listTrips error", error);
    return [];
  }
  return (data || []).map((d: any) => ({ ...d, days: (d.days ?? []) as DayPlan[] })) as TripRow[];
}

export async function createTrip(input: {
  title: string;
  dates?: string;
  days?: DayPlan[];
  source_conversation_id?: string | null;
  setActive?: boolean;
}): Promise<TripRow | null> {
  const uid = await ensureAuth();
  if (!uid) return null;

  // If new trip should be active, demote others first
  if (input.setActive) {
    await supabase.from("trips").update({ active: false }).eq("user_id", uid).eq("active", true);
  }

  const { data, error } = await supabase
    .from("trips")
    .insert({
      user_id: uid,
      title: input.title.slice(0, 60) || "新行程",
      dates: input.dates || "",
      days: (input.days ?? []) as any,
      active: !!input.setActive,
      source_conversation_id: input.source_conversation_id ?? null,
    })
    .select()
    .single();
  if (error) {
    console.error("createTrip error", error);
    return null;
  }
  return { ...(data as any), days: ((data as any).days ?? []) as DayPlan[] } as TripRow;
}

export async function updateTrip(id: string, patch: Partial<Omit<TripRow, "id" | "user_id" | "created_at" | "updated_at">>) {
  const update: any = { ...patch };
  if (patch.days) update.days = patch.days as any;
  const { error } = await supabase.from("trips").update(update).eq("id", id);
  if (error) console.error("updateTrip error", error);
}

export async function setActiveTrip(id: string) {
  const uid = await ensureAuth();
  if (!uid) return;
  await supabase.from("trips").update({ active: false }).eq("user_id", uid).eq("active", true);
  const { error } = await supabase.from("trips").update({ active: true }).eq("id", id);
  if (error) console.error("setActiveTrip error", error);
}

export async function toggleFavorite(id: string, favorited: boolean) {
  const { error } = await supabase.from("trips").update({ favorited }).eq("id", id);
  if (error) console.error("toggleFavorite error", error);
}

export async function deleteTrip(id: string) {
  const { error } = await supabase.from("trips").delete().eq("id", id);
  if (error) console.error("deleteTrip error", error);
}
