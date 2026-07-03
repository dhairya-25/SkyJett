// Curated SkyJet disruption-policy knowledge base for the grounded assistant.
// Small + hand-authored on purpose: the assistant answers ONLY from these
// snippets and always cites one, so it cannot hallucinate. In production this
// corpus would be admin-uploaded and embedded (see README "future work").

export type PolicyCategory =
  | "refund"
  | "rebooking"
  | "compensation"
  | "weather"
  | "meals"
  | "hotel"
  | "baggage"
  | "connection"
  | "minor"
  | "pet"
  | "checkin"
  | "general";

export interface Policy {
  id: string;
  title: string;
  category: PolicyCategory;
  keywords: string[];
  text: string;
  ruleRef: string;
}

export const policies: Policy[] = [
  {
    id: "refund-cancellation",
    title: "Refunds for cancelled flights",
    category: "refund",
    keywords: ["refund", "money", "back", "reimburse", "cancel", "cancelled"],
    text: "If your flight is cancelled, you can choose a full refund to your original payment method instead of travelling. Refunds are processed within 5–7 business days.",
    ruleRef: "DGCA CAR §3-M-IV — refund on cancellation",
  },
  {
    id: "auto-refund",
    title: "If you take no action",
    category: "refund",
    keywords: ["nothing", "later", "decide", "automatic", "auto", "wait"],
    text: "If you take no action within 24 hours of a cancellation, SkyJet automatically refunds your ticket to the original payment method — you will not lose your money by waiting.",
    ruleRef: "SkyJet passenger-protection policy",
  },
  {
    id: "rebooking-free",
    title: "Free rebooking after a disruption",
    category: "rebooking",
    keywords: ["rebook", "change", "reschedule", "another", "next", "move", "switch", "flight"],
    text: "When SkyJet cancels or significantly delays your flight, you may rebook onto the next available SkyJet flight at no extra cost — we do not charge a fare difference for disruptions we caused.",
    ruleRef: "DGCA CAR §3-M-IV — alternate flight",
  },
  {
    id: "weather-extraordinary",
    title: "Weather and extraordinary circumstances",
    category: "weather",
    keywords: ["weather", "storm", "fog", "rain", "monsoon", "extraordinary"],
    text: "Delays or cancellations caused by weather, air-traffic control or security are 'extraordinary circumstances'. You are entitled to a free rebooking or a full refund, plus meal and hotel care where applicable, but cash compensation does not apply.",
    ruleRef: "DGCA CAR §3-M-IV — extraordinary circumstances",
  },
  {
    id: "compensation-airline",
    title: "Compensation when the airline is at fault",
    category: "compensation",
    keywords: ["compensation", "compensate", "cash", "owed", "claim", "payout", "technical", "crew"],
    text: "If a cancellation or long delay is within SkyJet's control (for example a technical or crew issue), you may receive cash compensation of ₹5,000–₹10,000 depending on the flight's block time, in addition to a refund or free rebooking.",
    ruleRef: "DGCA CAR §3-M-IV — compensation by block time",
  },
  {
    id: "meals",
    title: "Meals during a delay",
    category: "meals",
    keywords: ["meal", "meals", "food", "refreshment", "eat", "hungry"],
    text: "If your flight is delayed by 2 hours or more, SkyJet provides complimentary meals and refreshments at the airport.",
    ruleRef: "DGCA CAR §3-M-IV — duty of care",
  },
  {
    id: "hotel",
    title: "Hotel for overnight delays",
    category: "hotel",
    keywords: ["hotel", "accommodation", "overnight", "stay", "room", "night", "sleep"],
    text: "If a disruption requires an overnight wait (roughly 6 hours or more, into the night), SkyJet arranges hotel accommodation and airport transfers at no cost.",
    ruleRef: "DGCA CAR §3-M-IV — duty of care",
  },
  {
    id: "connection",
    title: "Missed connections",
    category: "connection",
    keywords: ["connection", "connecting", "missed", "transfer", "layover"],
    text: "If a delay on your first SkyJet flight causes you to miss a connecting SkyJet flight, we rebook you on the next available connection at no cost.",
    ruleRef: "SkyJet through-fare policy",
  },
  {
    id: "baggage",
    title: "Checked baggage after rebooking",
    category: "baggage",
    keywords: ["baggage", "bag", "bags", "luggage", "checked", "suitcase"],
    text: "When you rebook, your checked baggage is automatically re-routed to your new flight. You can track it in the app.",
    ruleRef: "SkyJet baggage policy",
  },
  {
    id: "minor",
    title: "Unaccompanied minors",
    category: "minor",
    keywords: ["minor", "child", "kid", "son", "daughter", "unaccompanied"],
    text: "Bookings involving an unaccompanied minor are handled by a specialist agent to make sure the child is looked after — these are not changed through self-service.",
    ruleRef: "SkyJet special-assistance policy",
  },
  {
    id: "pet",
    title: "Travelling with pets",
    category: "pet",
    keywords: ["pet", "dog", "cat", "animal"],
    text: "If you are travelling with a pet in the cabin or hold, please connect to an agent so we can re-accommodate your pet correctly.",
    ruleRef: "SkyJet special-assistance policy",
  },
  {
    id: "checkin",
    title: "Checking in for a new flight",
    category: "checkin",
    keywords: ["check", "checkin", "boarding", "pass", "gate", "checkedin"],
    text: "After rebooking, you can check in for your new flight straight away and your boarding pass is issued instantly.",
    ruleRef: "SkyJet check-in policy",
  },
  {
    id: "self-service",
    title: "Doing this yourself vs. an agent",
    category: "general",
    keywords: ["how", "self", "service", "agent", "help", "call", "human"],
    text: "You can rebook, request a refund, or check what you are entitled to yourself in under 30 seconds. For complex cases you can connect to an agent at any time.",
    ruleRef: "SkyJet self-service policy",
  },
];
