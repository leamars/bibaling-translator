"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

export default function TranslateLink({
  className = "",
  children = "Translate your book"
}: {
  className?: string;
  children?: ReactNode;
}) {
  const [href, setHref] = useState("/translate");

  useEffect(() => {
    const current = new URL(window.location.href);
    if (!sessionStorage.getItem("bibaling_original_landing_page")) {
      sessionStorage.setItem("bibaling_original_landing_page", `${current.origin}${current.pathname}`);
    }
    const params = new URLSearchParams();
    UTM_KEYS.forEach((key) => {
      const value = current.searchParams.get(key);
      if (value) params.set(key, value);
    });
    if (params.size) {
      sessionStorage.setItem("bibaling_attribution", params.toString());
    } else {
      const saved = sessionStorage.getItem("bibaling_attribution");
      if (saved) {
        new URLSearchParams(saved).forEach((value, key) => {
          if (UTM_KEYS.includes(key)) params.set(key, value);
        });
      }
    }
    setHref(params.size ? `/translate?${params}` : "/translate");
  }, []);

  return <Link className={className} href={href}>{children}</Link>;
}
