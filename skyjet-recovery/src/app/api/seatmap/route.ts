import { z } from "zod";
import { getRebookingOptions } from "@/lib/service";
import { allocateSeat, buildSeatMap } from "@/lib/seatmap";
import { computePriority } from "@/lib/priority";
import { store } from "@/lib/store";

// Authoritative seat map for a flight the passenger is considering rebooking
// onto. Server-owned so the airplane the client renders always matches what the
// rebook endpoint will validate against — a picked seat can't disagree with the
// picture. Re-authenticates (PNR + last name) like every read.
export const dynamic = "force-dynamic";

const schema = z.object({
  ref: z.string().trim().min(5),
  lastName: z.string().trim().min(1),
  flightId: z.string().trim().min(2),
});

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Missing details." }, { status: 400 });
  }
  const { ref, lastName, flightId } = parsed.data;

  const booking = store.findBooking(ref, lastName);
  if (!booking) return Response.json({ error: "Booking not found." }, { status: 404 });

  // Only expose maps for flights this passenger can actually rebook onto —
  // recomputed live, so it stays in lock-step with the rebook revalidation.
  const option = getRebookingOptions(booking).find((o) => o.flight.id === flightId);
  if (!option) {
    return Response.json(
      { error: "That flight is not available for rebooking." },
      { status: 409 }
    );
  }

  const seatMap = buildSeatMap(option.flight, store.seatsTaken(flightId));
  const priority = computePriority(booking);
  const recommendedSeat = allocateSeat(seatMap, priority.rank) ?? null;
  return Response.json({ seatMap, priority, recommendedSeat });
}
