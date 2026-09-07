"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";

const STORAGE_KEY = "gatscan-cookie-consent";

function subscribe() {
  return () => {};
}
function getSnapshot() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function getServerSnapshot() {
  return null;
}

export default function CookieConsent() {
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [dismissed, setDismissed] = useState(false);
  const visible = !stored && !dismissed;

  const respond = (value: "accepted" | "declined") => {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // localStorage unavailable (private mode, blocked storage) — just dismiss for this visit
    }
    setDismissed(true);
  };

  if (!visible) return null;
  return (
    <div className="cookie-banner" role="dialog" aria-label="Cookie consent">
      <p>
        We use essential cookies to run this site and, once you click through to a retailer, that retailer or its affiliate network may set its own tracking cookie. See our{" "}
        <Link href="/privacy">Privacy Policy</Link> for details.
      </p>
      <div className="cookie-actions">
        <button type="button" onClick={() => respond("declined")}>Decline</button>
        <button type="button" className="cookie-accept" onClick={() => respond("accepted")}>Accept</button>
      </div>
    </div>
  );
}
