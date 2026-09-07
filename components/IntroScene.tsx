"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import Image from "next/image";

function subscribeReducedMotion(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
function getReducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function getServerSnapshot() {
  return false;
}

export default function IntroScene() {
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const skip = useSyncExternalStore(subscribeReducedMotion, getReducedMotionSnapshot, getServerSnapshot);

  useEffect(() => {
    if (skip) return;
    let frame = 0;
    const update = () => {
      const track = trackRef.current;
      const stage = stageRef.current;
      if (track && stage) {
        const rect = track.getBoundingClientRect();
        const scrollable = rect.height - window.innerHeight;
        const progress = scrollable > 0 ? Math.min(1, Math.max(0, -rect.top / scrollable)) : 1;
        stage.style.setProperty("--p", progress.toFixed(4));
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [skip]);

  if (skip) return null;

  return (
    <div className="intro-track" ref={trackRef} aria-hidden="true">
      <div className="intro-stage" ref={stageRef} style={{ ["--p" as string]: 0 }}>
        <Image className="intro-sneaker" src="/images/gat-reference.png" alt="" width={1427} height={588} unoptimized />
        <div className="intro-mark">
          <i />
        </div>
        <p className="intro-hint">Scroll<span>↓</span></p>
      </div>
    </div>
  );
}
