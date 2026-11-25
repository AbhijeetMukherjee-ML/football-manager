"use client";

import { useState } from "react";
import { FootballManagerDashboard } from "@/components/FootballManagerDashboard";
import { SplashScreen } from "@/components/SplashScreen";

export default function Home() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <>
      {showSplash && (
        <SplashScreen onComplete={() => setShowSplash(false)} />
      )}
      <FootballManagerDashboard />
    </>
  );
}
