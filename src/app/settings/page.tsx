import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { RegionSelect } from "@/components/region-select";
import { ThemeToggle } from "@/components/theme-toggle";
import { REGION_COOKIE, listRegions, resolveRegion } from "@/lib/catalog/regions";
import { isFlagOn } from "@/lib/flags/flags";

// Per request, never at build time: a static page would keep the flag's build-time value until the next deploy.
export const dynamic = "force-dynamic";

/** The page exists only while flag `settings-page` is on; otherwise /settings is a 404. */
async function requireSettingsPage() {
  if (!(await isFlagOn("settings-page"))) notFound();
}

export async function generateMetadata(): Promise<Metadata> {
  await requireSettingsPage();
  return { title: "Settings" };
}

/** One section per setting, Theme first; each new setting adds its section after the last. */
export default async function SettingsPage() {
  await requireSettingsPage();
  const [cookieStore, requestHeaders, regions] = await Promise.all([cookies(), headers(), listRegions()]);
  // The region that applies, as home resolves it without a `?region=` param: cookie, Accept-Language, then US.
  const region = resolveRegion(
    {
      cookie: cookieStore.get(REGION_COOKIE)?.value,
      acceptLanguage: requestHeaders.get("accept-language") ?? undefined,
    },
    regions.map(({ code }) => code),
  );
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>
      <section aria-labelledby="settings-theme" className="space-y-3">
        <h2 id="settings-theme" className="text-lg font-semibold">
          Theme
        </h2>
        <ThemeToggle />
      </section>
      <section aria-labelledby="settings-region" className="space-y-3">
        <h2 id="settings-region" className="text-lg font-semibold">
          Region
        </h2>
        {/* Saves through /region, which returns here showing the new region. */}
        <RegionSelect regions={regions} region={region} from="settings" />
      </section>
    </div>
  );
}
