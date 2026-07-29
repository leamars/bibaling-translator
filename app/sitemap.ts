import type { MetadataRoute } from "next";

const routes = ["", "/translate", "/how-it-works", "/languages", "/guides", "/privacy", "/terms", "/copyright"];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: `https://bibaling.com${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : route === "/translate" ? 0.9 : 0.6
  }));
}
