"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";

interface SplashScreenProps {
  onComplete: () => void;
  durationMs?: number;
}

const LOADING_STEPS = [
  { threshold: 0, text: "INITIALIZING MATCH ENGINE & SIMULATION MATRIX..." },
  { threshold: 22, text: "ANALYZING SQUAD CHEMISTRY & FORMATION METRICS..." },
  { threshold: 48, text: "SYNCHRONIZING TACTICAL PLAYBOOK..." },
  { threshold: 72, text: "SCOUTING OPPONENT TENDENCIES & MATCHDAY DATA..." },
  { threshold: 92, text: "CALIBRATING STADIUM FLOODLIGHTS & PITCH..." },
  { threshold: 100, text: "READY FOR KICK-OFF. WELCOME TO FOOTBALL CHALLENGERS!" },
];

export function SplashScreen({ onComplete, durationMs = 3200 }: SplashScreenProps) {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState(LOADING_STEPS[0].text);
  const [isFinishing, setIsFinishing] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Play subtle synth kick-off audio tone using Web Audio API
  const playKickoffChime = () => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const now = ctx.currentTime;
      // Dual oscillator synth sweep
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.type = "sine";
      osc1.frequency.setValueAtTime(220, now);
      osc1.frequency.exponentialRampToValueAtTime(880, now + 0.35);

      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(440, now);
      osc2.frequency.exponentialRampToValueAtTime(1320, now + 0.35);

      gainNode.gain.setValueAtTime(0.12, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.5);
      osc2.stop(now + 0.5);
    } catch {
      // Audio context blocked by browser autoplay policy
    }
  };

  const handleFinish = () => {
    if (isFinishing) return;
    setIsFinishing(true);
    playKickoffChime();
    setTimeout(() => {
      onComplete();
    }, 750);
  };

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.round((elapsed / durationMs) * 100));
      setProgress(pct);

      for (let i = LOADING_STEPS.length - 1; i >= 0; i--) {
        if (pct >= LOADING_STEPS[i].threshold) {
          setStatusText(LOADING_STEPS[i].text);
          break;
        }
      }

      if (pct >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          handleFinish();
        }, 400);
      }
    }, 40);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " " || e.key === "Enter") {
        clearInterval(interval);
        handleFinish();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      clearInterval(interval);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [durationMs]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col justify-between overflow-hidden bg-[#040814] select-none transition-all duration-700 ease-out ${
        isFinishing ? "opacity-0 scale-105 pointer-events-none" : "opacity-100 scale-100"
      }`}
    >
      {/* Background Wallpaper Image */}
      <div className="absolute inset-0 -z-10">
        <Image
          src="/splash-wallpaper.png"
          alt="Football Challengers Background"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center transform transition-transform duration-1000 scale-100"
        />
        {/* Cinematic Vignette & Dynamic Gradients */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#040814] via-[#040814]/65 to-[#040814]/40" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_30%,#040814_90%)]" />
        <div className="absolute inset-0 bg-emerald-950/20 mix-blend-color" />
      </div>

      {/* Floodlight Flash Animation on Exit */}
      <div
        className={`absolute inset-0 bg-white pointer-events-none transition-opacity duration-300 z-40 ${
          isFinishing ? "opacity-30" : "opacity-0"
        }`}
      />

      {/* Top Header Bar */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/20 border border-emerald-400/40 shadow-[0_0_15px_rgba(16,185,129,0.35)]">
            <span className="text-emerald-400 font-black text-sm tracking-tighter">FC</span>
          </div>
          <div>
            <div className="text-xs font-semibold tracking-widest text-emerald-400 uppercase">
              Tactical Edition
            </div>
            <div className="text-[10px] text-slate-400 tracking-wider">SEASON 2026/27</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            aria-label="Toggle Sound"
            className="flex h-8 items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-900/60 px-3 text-xs font-medium text-slate-300 backdrop-blur-md hover:border-emerald-500/50 hover:text-emerald-400 transition"
          >
            <span>{soundEnabled ? "🔊" : "🔇"}</span>
            <span className="hidden sm:inline">{soundEnabled ? "Audio On" : "Muted"}</span>
          </button>

          <button
            type="button"
            onClick={handleFinish}
            className="group flex h-8 items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 text-xs font-semibold text-emerald-300 backdrop-blur-md hover:bg-emerald-500 hover:text-slate-950 transition-all duration-200 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
          >
            <span>SKIP INTRO</span>
            <span className="text-[10px] opacity-75 font-mono group-hover:text-slate-950">[ESC]</span>
          </button>
        </div>
      </header>

      {/* Center Branding Hero */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center px-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-3.5 py-1 text-[11px] font-bold tracking-widest text-emerald-300 uppercase backdrop-blur-md mb-4 shadow-[0_0_20px_rgba(16,185,129,0.25)]">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
          <span>MATCH ENGINE V2.7 READY</span>
        </div>

        <h1 className="text-4xl sm:text-6xl md:text-7xl font-black tracking-tight uppercase text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.8)]">
          FOOTBALL{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">
            CHALLENGERS
          </span>
        </h1>

        <p className="mt-3 max-w-lg text-sm sm:text-base font-medium text-slate-300 drop-shadow">
          Lead your squad through European nights, domestic derbies, and tactical glory.
        </p>
      </div>

      {/* Bottom Loading Progress Panel */}
      <div className="relative z-10 mx-auto w-full max-w-2xl px-6 pb-8 md:pb-12">
        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/80 p-5 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
          {/* Status info & Percentage */}
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="truncate text-xs font-mono font-medium tracking-wide text-slate-300">
                {statusText}
              </span>
            </div>

            <span className="text-sm font-mono font-black text-emerald-400 tabular-nums shrink-0">
              {progress}%
            </span>
          </div>

          {/* Progress Bar Track */}
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-900 border border-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 transition-all duration-100 ease-out shadow-[0_0_12px_rgba(16,185,129,0.7)]"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Prompt on completion */}
          {progress >= 100 && (
            <div className="mt-3.5 flex justify-center">
              <button
                type="button"
                onClick={handleFinish}
                className="animate-pulse rounded-lg bg-emerald-500 px-5 py-2 text-xs font-black uppercase tracking-wider text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.6)] hover:bg-emerald-400 transition"
              >
                KICK OFF NOW →
              </button>
            </div>
          )}
        </div>

        <div className="mt-3 text-center text-[10px] tracking-wider text-slate-500 uppercase font-mono">
          Powered by Football Challengers Tactical Simulation Engine
        </div>
      </div>
    </div>
  );
}
