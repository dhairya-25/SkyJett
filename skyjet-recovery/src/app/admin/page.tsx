import type { Metadata } from "next";
import { AdminConsole } from "@/components/admin-console";

export const metadata: Metadata = {
  title: "SkyJet Ops Console",
  description: "Airline ops — control live flight status, delays, and disruptions.",
};

export default function AdminPage() {
  return (
    <main className="flex min-h-dvh flex-col">
      <AdminConsole />
    </main>
  );
}
