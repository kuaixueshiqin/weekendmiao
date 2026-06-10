import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/lib/chatHistory";

// ── Types ──────────────────────────────────────────────────────────────────────

export type Status = "unbooked" | "pending" | "completed" | "expired";

export interface TripItem {
  id: string;
  trip_id: string;
  day: number;
  date: string;
  period: string;
  sort_order: number;
  time: string;
  name: string;
  type: "scenic" | "food" | "hotel";
  description: string;
  price: string;
  status: Status;
  code?: string | null;
}

export interface DayPlan {
  day: number;
  date: string;
  period: string;
  items: TripItem[];
}

export interface Trip {
  id: string;
  device_id: string;
  title: string;
  dates: string;
  active: boolean;
  favorited: boolean;
  created_at: string;
  updated_at: string;
  days: DayPlan[];
}

// Input shape for saveAiTrip (from ArticleCard parsed places)
export interface AiTripInput {
  title: string;
  dates: string;
  days: Array<{
    day: number;
    date: string;
    period: string;
    items: Array<{
      time: string;
      name: string;
      type: "scenic" | "food" | "hotel";
      description: string;
      price: string;
    }>;
  }>;
}

// ── Helper: merge items into Trip DayPlan structure ────────────────────────────

function buildDays(items: TripItem[]): DayPlan[] {
  const map = new Map<number, DayPlan>();
  for (const item of items) {
    if (!map.has(item.day)) {
      map.set(item.day, {
        day: item.day,
        date: item.date,
        period: item.period,
        items: [],
      });
    }
    map.get(item.day)!.items.push(item);
  }
  // sort items within each day
  const days = Array.from(map.values()).sort((a, b) => a.day - b.day);
  for (const d of days) {
    d.items.sort((a, b) => a.sort_order - b.sort_order);
  }
  return days;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useTrips() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const deviceId = getDeviceId();

  // ── Fetch all trips + items for this device ──────────────────────────────────
  const fetchTrips = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: tripsData, error: tripsErr } = await supabase
        .from("trips")
        .select("*")
        .eq("device_id", deviceId)
        .order("updated_at", { ascending: false });

      if (tripsErr) throw tripsErr;
      if (!tripsData || tripsData.length === 0) {
        setTrips([]);
        return;
      }

      const tripIds = tripsData.map((t) => t.id);
      const { data: itemsData, error: itemsErr } = await supabase
        .from("trip_items")
        .select("*")
        .in("trip_id", tripIds)
        .order("day", { ascending: true })
        .order("sort_order", { ascending: true });

      if (itemsErr) throw itemsErr;

      const itemsByTrip = new Map<string, TripItem[]>();
      for (const item of itemsData || []) {
        const list = itemsByTrip.get(item.trip_id) || [];
        list.push(item as TripItem);
        itemsByTrip.set(item.trip_id, list);
      }

      const assembled: Trip[] = tripsData.map((t) => ({
        ...t,
        days: buildDays(itemsByTrip.get(t.id) || []),
      }));

      setTrips(assembled);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载行程失败");
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchTrips();
  }, [fetchTrips]);

  // ── Create a new empty trip ──────────────────────────────────────────────────
  const createTrip = useCallback(
    async (title: string, dates: string): Promise<Trip | null> => {
      const { data, error: err } = await supabase
        .from("trips")
        .insert({ device_id: deviceId, title: title.slice(0, 60) || "新行程", dates: dates || "待定" })
        .select()
        .single();
      if (err) {
        console.error("createTrip error", err);
        return null;
      }
      const newTrip: Trip = { ...(data as Trip), days: [] };
      setTrips((prev) => [newTrip, ...prev]);
      return newTrip;
    },
    [deviceId]
  );

  // ── Delete a trip ────────────────────────────────────────────────────────────
  const deleteTrip = useCallback(async (id: string) => {
    await supabase.from("trips").delete().eq("id", id);
    setTrips((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── Set active trip ──────────────────────────────────────────────────────────
  const setActiveTrip = useCallback(
    async (id: string) => {
      // unset all, then set target
      await supabase.from("trips").update({ active: false }).eq("device_id", deviceId);
      await supabase.from("trips").update({ active: true }).eq("id", id);
      setTrips((prev) =>
        prev.map((t) => ({ ...t, active: t.id === id }))
      );
    },
    [deviceId]
  );

  // ── Toggle favorite ──────────────────────────────────────────────────────────
  const toggleFavorite = useCallback(async (id: string) => {
    const trip = trips.find((t) => t.id === id);
    if (!trip) return;
    const next = !trip.favorited;
    await supabase.from("trips").update({ favorited: next }).eq("id", id);
    setTrips((prev) =>
      prev.map((t) => (t.id === id ? { ...t, favorited: next } : t))
    );
  }, [trips]);

  // ── Add a new item to a trip/day ─────────────────────────────────────────────
  const addItem = useCallback(
    async (
      tripId: string,
      dayInfo: { day: number; date: string; period: string },
      item: Omit<TripItem, "id" | "trip_id" | "day" | "date" | "period" | "sort_order" | "status">
    ): Promise<TripItem | null> => {
      const trip = trips.find((t) => t.id === tripId);
      const dayPlan = trip?.days.find((d) => d.day === dayInfo.day);
      const sort_order = (dayPlan?.items.length || 0);

      const { data, error: err } = await supabase
        .from("trip_items")
        .insert({
          trip_id: tripId,
          day: dayInfo.day,
          date: dayInfo.date,
          period: dayInfo.period,
          sort_order,
          time: item.time,
          name: item.name,
          type: item.type,
          description: item.description,
          price: item.price,
          status: "unbooked",
        })
        .select()
        .single();

      if (err) {
        console.error("addItem error", err);
        return null;
      }
      const newItem = data as TripItem;
      setTrips((prev) =>
        prev.map((t) => {
          if (t.id !== tripId) return t;
          const days = [...t.days];
          const dIdx = days.findIndex((d) => d.day === dayInfo.day);
          if (dIdx === -1) {
            days.push({ ...dayInfo, items: [newItem] });
          } else {
            days[dIdx] = { ...days[dIdx], items: [...days[dIdx].items, newItem] };
          }
          return { ...t, days: days.sort((a, b) => a.day - b.day) };
        })
      );
      return newItem;
    },
    [trips]
  );

  // ── Update item status (and optionally code) ─────────────────────────────────
  const updateItemStatus = useCallback(
    async (itemId: string, status: Status, code?: string) => {
      const patch: Record<string, unknown> = { status };
      if (code !== undefined) patch.code = code;
      await supabase.from("trip_items").update(patch).eq("id", itemId);
      setTrips((prev) =>
        prev.map((t) => ({
          ...t,
          days: t.days.map((d) => ({
            ...d,
            items: d.items.map((item) =>
              item.id === itemId ? { ...item, status, ...(code !== undefined ? { code } : {}) } : item
            ),
          })),
        }))
      );
    },
    []
  );

  // ── Delete a single item ─────────────────────────────────────────────────────
  const deleteItem = useCallback(async (itemId: string) => {
    await supabase.from("trip_items").delete().eq("id", itemId);
    setTrips((prev) =>
      prev.map((t) => ({
        ...t,
        days: t.days.map((d) => ({
          ...d,
          items: d.items.filter((item) => item.id !== itemId),
        })),
      }))
    );
  }, []);

  // ── Replace item data (换一个) ────────────────────────────────────────────────
  const replaceItem = useCallback(
    async (
      itemId: string,
      patch: Partial<Pick<TripItem, "name" | "description" | "price" | "type">>
    ) => {
      await supabase.from("trip_items").update(patch).eq("id", itemId);
      setTrips((prev) =>
        prev.map((t) => ({
          ...t,
          days: t.days.map((d) => ({
            ...d,
            items: d.items.map((item) =>
              item.id === itemId ? { ...item, ...patch } : item
            ),
          })),
        }))
      );
    },
    []
  );

  // ── Book all unbooked items in the active trip ────────────────────────────────
  const bookAll = useCallback(
    async (tripId: string) => {
      const trip = trips.find((t) => t.id === tripId);
      if (!trip) return;
      const unbookedIds = trip.days
        .flatMap((d) => d.items)
        .filter((i) => i.status === "unbooked")
        .map((i) => i.id);
      if (unbookedIds.length === 0) return;

      // generate codes and update in batch
      const updates = unbookedIds.map((id) => ({
        id,
        status: "pending" as Status,
        code: `MT${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 9000 + 1000)}`,
      }));

      // Supabase doesn't support batch update with different values per row
      // so fire them in parallel
      await Promise.all(
        updates.map(({ id, status, code }) =>
          supabase.from("trip_items").update({ status, code }).eq("id", id)
        )
      );

      setTrips((prev) =>
        prev.map((t) => {
          if (t.id !== tripId) return t;
          return {
            ...t,
            days: t.days.map((d) => ({
              ...d,
              items: d.items.map((item) => {
                const upd = updates.find((u) => u.id === item.id);
                return upd ? { ...item, status: upd.status, code: upd.code } : item;
              }),
            })),
          };
        })
      );
    },
    [trips]
  );

  // ── Save AI-generated trip to database ───────────────────────────────────────
  const saveAiTrip = useCallback(
    async (input: AiTripInput): Promise<Trip | null> => {
      // 1. create the trip row
      const { data: tripData, error: tripErr } = await supabase
        .from("trips")
        .insert({
          device_id: deviceId,
          title: input.title.slice(0, 60),
          dates: input.dates || "待定",
          active: false,
          favorited: false,
        })
        .select()
        .single();

      if (tripErr) {
        console.error("saveAiTrip create trip error", tripErr);
        return null;
      }
      const tripId = tripData.id;

      // 2. insert all items
      const itemRows = input.days.flatMap((day) =>
        day.items.map((item, idx) => ({
          trip_id: tripId,
          day: day.day,
          date: day.date,
          period: day.period,
          sort_order: idx,
          time: item.time,
          name: item.name,
          type: item.type,
          description: item.description,
          price: item.price,
          status: "unbooked",
        }))
      );

      if (itemRows.length > 0) {
        const { error: itemsErr } = await supabase.from("trip_items").insert(itemRows);
        if (itemsErr) console.error("saveAiTrip insert items error", itemsErr);
      }

      // 3. reassemble locally
      const insertedItems: TripItem[] = itemRows.map((r, i) => ({
        ...r,
        id: `tmp-${i}`, // will be replaced on next fetch
        code: null,
        status: r.status as Status,
        type: r.type as TripItem["type"],
      }));
      const newTrip: Trip = {
        ...(tripData as Trip),
        days: buildDays(insertedItems),
      };
      setTrips((prev) => [newTrip, ...prev]);
      return newTrip;
    },
    [deviceId]
  );

  // ── Derived ───────────────────────────────────────────────────────────────────
  const activeTrip = trips.find((t) => t.active) ?? null;
  const favorites = trips.filter((t) => t.favorited);

  return {
    trips,
    activeTrip,
    favorites,
    loading,
    error,
    fetchTrips,
    createTrip,
    deleteTrip,
    setActiveTrip,
    toggleFavorite,
    addItem,
    updateItemStatus,
    deleteItem,
    replaceItem,
    bookAll,
    saveAiTrip,
  };
}