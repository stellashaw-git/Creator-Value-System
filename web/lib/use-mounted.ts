"use client";

import { useEffect, useState } from "react";

/** True after the first client paint — avoids SSR/client localStorage or env drift. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
