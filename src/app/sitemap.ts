import type { MetadataRoute } from "next";
import { absoluteSiteUrl } from "@/lib/site-config";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/privacy/", "/terms/", "/account-deletion/", "/contact/"].map((path, index) => ({ url: absoluteSiteUrl(path), changeFrequency: index === 0 ? "monthly" : "yearly", priority: index === 0 ? 1 : 0.6 }));
}
