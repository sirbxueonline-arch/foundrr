import { Hero } from "@/components/Hero";
import { Counters } from "@/components/Counters";
import { Leaderboard } from "@/components/Leaderboard";
import { ModelsGrid } from "@/components/ModelsGrid";
import { Telemetry } from "@/components/Telemetry";
import { Footer } from "@/components/Footer";
import { fetchGlobalTotals, fetchLeaderboard } from "@/lib/supabase";
import { SERVER_REVALIDATE_SECONDS } from "@/lib/config";
import type { LiveData } from "@/lib/useLiveData";

// Server fetch with ISR-style revalidation; client polling keeps it live after.
export const revalidate = 30;

export default async function Page() {
  const [totals, leaderboard] = await Promise.all([
    fetchGlobalTotals({ revalidate: SERVER_REVALIDATE_SECONDS }),
    fetchLeaderboard({ revalidate: SERVER_REVALIDATE_SECONDS }),
  ]);

  const initial: LiveData = { totals, leaderboard };

  return (
    <main>
      <Hero />
      <Counters initial={initial} />
      <Leaderboard initial={initial} />
      <ModelsGrid />
      <Telemetry />
      <Footer />
    </main>
  );
}
