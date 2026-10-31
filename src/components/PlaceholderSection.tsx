"use client";

import { NavigationSection, Player } from "@/types/football";

interface PlaceholderSectionProps {
  section: Exclude<NavigationSection, "overview" | "squad">;
  players: Player[];
  onNavigate: (section: NavigationSection) => void;
}

export function PlaceholderSection({
  section,
  players,
  onNavigate,
}: PlaceholderSectionProps) {
  if (section === "tactics") {
    const starters = players.filter((p) => p.status === "Starting XI");
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 text-sm text-amber-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="rounded bg-amber-400 px-2 py-0.5 text-xs font-bold text-slate-950 uppercase">
                Preview / Placeholder
              </span>
              <span className="font-semibold">
                Interactive drag-and-drop tactics & live role editing are not implemented yet.
              </span>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("squad")}
              className="rounded-lg border border-amber-400/40 bg-slate-950/60 px-3 py-1 text-xs font-semibold text-amber-300 hover:bg-slate-900"
            >
              Go to Working Squad Table →
            </button>
          </div>
        </div>

        {/* Visual 4-3-3 Pitch Board Preview */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-emerald-950/70 via-emerald-900/30 to-slate-950 p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-emerald-500/20 pb-4">
              <div>
                <h2 className="text-lg font-bold text-white">
                  4-3-3 Gegenpress Pitch Preview
                </h2>
                <p className="text-xs text-slate-300">
                  Visual formation representation of your 11 Starting XI players
                </p>
              </div>
              <span className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 font-mono text-xs font-bold text-emerald-300">
                4-3-3 Attack
              </span>
            </div>

            {/* Pitch Container */}
            <div className="relative mt-6 flex min-h-[380px] flex-col justify-between rounded-2xl border-2 border-emerald-400/30 bg-[#0a2e22] p-6">
              {/* Forwards */}
              <div className="grid grid-cols-3 gap-4 text-center">
                {starters
                  .filter((p) => p.positionGroup === "FWD")
                  .map((p) => (
                    <div
                      key={p.id}
                      className="mx-auto flex flex-col items-center rounded-xl border border-emerald-400/40 bg-slate-950/80 px-3 py-2 shadow-md"
                    >
                      <span className="font-mono text-xs font-bold text-emerald-400">
                        #{p.shirtNumber} {p.position}
                      </span>
                      <span className="mt-0.5 text-xs font-bold text-white">
                        {p.name.split(" ").slice(-1)[0]}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">
                        {p.overall} OVR
                      </span>
                    </div>
                  ))}
              </div>

              {/* Midfielders */}
              <div className="grid grid-cols-3 gap-4 text-center">
                {starters
                  .filter((p) => p.positionGroup === "MID")
                  .map((p) => (
                    <div
                      key={p.id}
                      className="mx-auto flex flex-col items-center rounded-xl border border-emerald-400/40 bg-slate-950/80 px-3 py-2 shadow-md"
                    >
                      <span className="font-mono text-xs font-bold text-emerald-400">
                        #{p.shirtNumber} {p.position}
                      </span>
                      <span className="mt-0.5 text-xs font-bold text-white">
                        {p.name.split(" ").slice(-1)[0]}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">
                        {p.overall} OVR
                      </span>
                    </div>
                  ))}
              </div>

              {/* Defenders */}
              <div className="grid grid-cols-4 gap-2 text-center">
                {starters
                  .filter((p) => p.positionGroup === "DEF")
                  .map((p) => (
                    <div
                      key={p.id}
                      className="mx-auto flex flex-col items-center rounded-xl border border-sky-400/40 bg-slate-950/80 px-2.5 py-2 shadow-md"
                    >
                      <span className="font-mono text-xs font-bold text-sky-300">
                        #{p.shirtNumber} {p.position}
                      </span>
                      <span className="mt-0.5 text-xs font-bold text-white">
                        {p.name.split(" ").slice(-1)[0]}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">
                        {p.overall} OVR
                      </span>
                    </div>
                  ))}
              </div>

              {/* Goalkeeper */}
              <div className="flex justify-center">
                {starters
                  .filter((p) => p.positionGroup === "GK")
                  .map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-col items-center rounded-xl border border-amber-400/40 bg-slate-950/85 px-4 py-2 shadow-md"
                    >
                      <span className="font-mono text-xs font-bold text-amber-300">
                        #{p.shirtNumber} {p.position}
                      </span>
                      <span className="mt-0.5 text-xs font-bold text-white">
                        {p.name.split(" ").slice(-1)[0]}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">
                        {p.overall} OVR
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Tactical Instructions Read-Only Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-6">
            <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-amber-300 uppercase">
              Placeholder Controls
            </span>
            <h3 className="mt-2 text-base font-bold text-white">
              Team Instructions
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Custom sliders and player role assignments will be unlocked in a future update.
            </p>
            <dl className="mt-5 space-y-3 text-xs">
              <div className="flex justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <dt className="text-slate-400">Mentality</dt>
                <dd className="font-semibold text-emerald-400">Positive / Attacking</dd>
              </div>
              <div className="flex justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <dt className="text-slate-400">Passing Directness</dt>
                <dd className="font-semibold text-white">Shorter & High Tempo</dd>
              </div>
              <div className="flex justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <dt className="text-slate-400">Transition</dt>
                <dd className="font-semibold text-white">Counter-Press Immediately</dd>
              </div>
              <div className="flex justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <dt className="text-slate-400">Line of Engagement</dt>
                <dd className="font-semibold text-white">Much Higher</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    );
  }

  const sectionDetails: Record<
    Exclude<NavigationSection, "overview" | "squad" | "tactics">,
    { title: string; summary: string; plannedFeatures: string[] }
  > = {
    fixtures: {
      title: "Season Fixtures & Match Calendar (Placeholder)",
      summary:
        "Full season schedule, match simulation results, and league table progression are not implemented yet.",
      plannedFeatures: [
        "38-Matchday Premier Crown Division schedule",
        "Interactive matchday simulation engine with minute-by-minute commentary",
        "Historical results and goalscorer breakdowns",
      ],
    },
    transfers: {
      title: "Transfer Market & Scouting Hub (Placeholder)",
      summary:
        "Player scouting, transfer bids, contract negotiations, and database persistence are not implemented yet.",
      plannedFeatures: [
        "Searchable fictional world database of transfer targets",
        "Transfer fee & weekly wage negotiation workflows",
        "Youth academy intake and loan management",
      ],
    },
    training: {
      title: "Training Ground & Development (Placeholder)",
      summary:
        "Weekly training schedules, attribute progression, and fitness recovery management are not implemented yet.",
      plannedFeatures: [
        "Team & individual attribute focus regimens",
        "Pre-match tactical preparation boosts",
        "Injury prevention and stamina recovery tracking",
      ],
    },
    settings: {
      title: "Club & Save Settings (Placeholder)",
      summary:
        "Save-game management, currency formatting, and board responsibility delegation are not implemented yet.",
      plannedFeatures: [
        "Currency & wage display preferences (£/€/$, weekly vs annual)",
        "Staff responsibility delegation (Assistant Manager settings)",
        "Database save/load once backend persistence is added",
      ],
    },
  };

  const info = sectionDetails[section];

  return (
    <div className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-8 shadow-xl">
      <div className="max-w-2xl">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/35 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300 uppercase">
          Placeholder Module — Not Implemented Yet
        </span>
        <h2 className="mt-4 text-2xl font-bold text-white">{info.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          {info.summary}
        </p>

        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/60 p-5">
          <p className="text-xs font-bold tracking-wider text-emerald-400 uppercase">
            Planned Features for Future Milestone
          </p>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            {info.plannedFeatures.map((feat) => (
              <li key={feat} className="flex items-center gap-2.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>{feat}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onNavigate("overview")}
            className="rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-slate-950 transition-colors hover:bg-emerald-400"
          >
            Return to Club Overview
          </button>
          <button
            type="button"
            onClick={() => onNavigate("squad")}
            className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:border-emerald-500/40"
          >
            Open Working Squad Roster
          </button>
        </div>
      </div>
    </div>
  );
}
