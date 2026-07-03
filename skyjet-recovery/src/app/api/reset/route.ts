import { store } from "@/lib/store";

// Demo helper: reseed the in-memory store so a fresh walkthrough always works.
export async function POST() {
  store.reset();
  return Response.json({ ok: true });
}
