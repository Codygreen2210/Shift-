"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as Tone from "tone";
import { isValidWord, addToDictionary } from "@/lib/dictionary";
import { PUZZLES, getDailyPuzzle, getDayNumber, type Puzzle } from "@/lib/puzzles";

/* ------------------------------ helpers ---------------------------------- */
const fmtTime = (s: number) => {
  const m = Math.floor(s / 60),
    r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
};
const timeUntilTomorrow = () => {
  const now = new Date();
  const t = new Date(now);
  t.setHours(24, 0, 0, 0);
  const diff = +t - +now;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

/* -------------------------------- sound ---------------------------------- */
type Snd = {
  ready: boolean;
  click: Tone.MembraneSynth | null;
  valid: Tone.PolySynth | null;
  invalid: Tone.MonoSynth | null;
  win: Tone.PolySynth | null;
};
const _s: Snd = { ready: false, click: null, valid: null, invalid: null, win: null };
const initSound = async () => {
  if (_s.ready) return;
  await Tone.start();
  _s.click = new Tone.MembraneSynth({
    pitchDecay: 0.005,
    octaves: 4,
    envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 },
  }).toDestination();
  _s.click.volume.value = -18;
  _s.valid = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" },
    envelope: { attack: 0.005, decay: 0.2, sustain: 0.1, release: 0.4 },
  }).toDestination();
  _s.valid.volume.value = -16;
  _s.invalid = new Tone.MonoSynth({
    oscillator: { type: "square" },
    envelope: { attack: 0.005, decay: 0.15, sustain: 0, release: 0.1 },
    filterEnvelope: {
      attack: 0.001,
      decay: 0.1,
      sustain: 0,
      release: 0.1,
      baseFrequency: 200,
      octaves: 1,
    },
  }).toDestination();
  _s.invalid.volume.value = -22;
  _s.win = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.01, decay: 0.4, sustain: 0.2, release: 1.2 },
  }).toDestination();
  _s.win.volume.value = -12;
  _s.ready = true;
};
const playClick = () => { try { _s.click?.triggerAttackRelease("C2", "32n"); } catch {} };
const playValid = () => { try { _s.valid?.triggerAttackRelease(["E5", "G5", "B5"], "8n"); } catch {} };
const playInvalid = () => { try { _s.invalid?.triggerAttackRelease("A2", "8n"); } catch {} };
const playWin = () => {
  try {
    const n = Tone.now();
    _s.win?.triggerAttackRelease("C5", "8n", n);
    _s.win?.triggerAttackRelease("E5", "8n", n + 0.12);
    _s.win?.triggerAttackRelease("G5", "8n", n + 0.24);
    _s.win?.triggerAttackRelease(["C6", "E6", "G6"], "2n", n + 0.4);
  } catch {}
};

/* ------------------------------- storage --------------------------------- */
type Stats = {
  streak: number;
  bestStreak: number;
  played: number;
  won: number;
  lastDay: string;
  lastDayWon: boolean;
  perfectSolves: number;
  distribution: Record<string, number>;
};
const STATS_KEY = "shift:stats:v1";
const defaultStats = (): Stats => ({
  streak: 0,
  bestStreak: 0,
  played: 0,
  won: 0,
  lastDay: "",
  lastDayWon: false,
  perfectSolves: 0,
  distribution: {},
});
const loadStats = (): Stats => {
  if (typeof window === "undefined") return defaultStats();
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) return { ...defaultStats(), ...JSON.parse(raw) };
  } catch {}
  return defaultStats();
};
const saveStats = (s: Stats) => {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch {}
};

/* ----------------------------- LetterTile -------------------------------- */
function LetterTile({
  char, size = 56, kind = "current", editing = false, onClick, delay = 0,
}: {
  char: string;
  size?: number;
  kind?: "dim" | "current" | "changed" | "target" | "win";
  editing?: boolean;
  onClick?: () => void;
  delay?: number;
}) {
  const fontSize = Math.round(size * 0.5);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClick}
      className={`tile ${kind} ${editing ? "editing" : ""}`}
      style={{ width: size, height: size, fontSize, cursor: onClick ? "pointer" : "default" }}
    >
      {editing && !char ? <span className="cursor" style={{ color: "var(--accent)" }}>|</span> : char}
    </motion.div>
  );
}

function WordRow({
  word, prevWord, kind = "current", size = 56, gap = 8, editing = -1, onTapLetter, shaking = false,
}: {
  word: string;
  prevWord: string | null;
  kind?: "dim" | "current" | "target" | "win";
  size?: number;
  gap?: number;
  editing?: number;
  onTapLetter?: (i: number) => void;
  shaking?: boolean;
}) {
  return (
    <motion.div
      className={`nosel ${shaking ? "shake" : ""}`}
      style={{ display: "flex", gap, justifyContent: "center" }}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {word.split("").map((c, i) => {
        const changed = prevWord && prevWord[i] !== c;
        let tileKind: "dim" | "current" | "changed" | "target" | "win" = kind as any;
        if (kind === "current" && changed) tileKind = "changed";
        return (
          <LetterTile
            key={i}
            char={editing === i ? "" : c}
            size={size}
            kind={tileKind}
            editing={editing === i}
            onClick={onTapLetter ? () => onTapLetter(i) : undefined}
            delay={0.05 * i}
          />
        );
      })}
    </motion.div>
  );
}

function Keyboard({
  onKey, onBack, onUndo, disabled,
}: {
  onKey: (k: string) => void;
  onBack: () => void;
  onUndo: () => void;
  disabled: boolean;
}) {
  const rows = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "0 6px 12px" }}>
      {rows.map((r, ri) => (
        <div key={ri} style={{ display: "flex", gap: 4, justifyContent: "center" }}>
          {ri === 2 && (
            <div className="key wide" onClick={disabled ? undefined : onUndo}
              style={{ flex: "1.4 0 0", height: 44, opacity: disabled ? 0.4 : 1 }}>
              UNDO
            </div>
          )}
          {r.split("").map(k => (
            <div key={k} className="key"
              onClick={disabled ? undefined : () => onKey(k)}
              style={{ flex: "1 0 0", height: 44, fontSize: 16, opacity: disabled ? 0.4 : 1 }}>
              {k}
            </div>
          ))}
          {ri === 2 && (
            <div className="key wide" onClick={disabled ? undefined : onBack}
              style={{ flex: "1.4 0 0", height: 44, opacity: disabled ? 0.4 : 1 }}>
              ⌫
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Confetti({ n = 60 }: { n?: number }) {
  const pieces = useMemo(() => {
    return Array.from({ length: n }).map((_, i) => {
      const colors = ["#FF6B35", "#FFD166", "#06D6A0", "#F5F1E8"];
      return {
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        dur: 1.6 + Math.random() * 1.4,
        dx: (Math.random() - 0.5) * 240 + "px",
        rot: Math.random() * 720 - 360 + "deg",
        color: colors[i % colors.length],
      };
    });
  }, [n]);
  return (
    <div className="conf-container">
      {pieces.map(p => (
        <span key={p.id} className="conf" style={{
          left: p.left + "%", background: p.color,
          animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`,
          ["--dx" as any]: p.dx, ["--rot" as any]: p.rot,
        }} />
      ))}
    </div>
  );
}

/* ------------------------------- Stat ------------------------------------ */
function Stat({ label, value, accent, mono }: { label: string; value: React.ReactNode; accent?: string; mono?: boolean }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div className={mono ? "mono" : ""}
        style={{ fontSize: 16, color: accent || "var(--fg)", fontWeight: 500, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 9, color: "var(--fg-3)", letterSpacing: "0.18em", textTransform: "uppercase", marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}

/* ------------------------------- HomeView -------------------------------- */
function HomeView({
  onPlay, onPractice, onStats, onAI, aiLoading, aiError,
  dayNumber, stats, todayPuzzleTheme, hasPlayedToday, todayWon,
}: {
  onPlay: () => void;
  onPractice: () => void;
  onStats: () => void;
  onAI: () => void;
  aiLoading: boolean;
  aiError: string;
  dayNumber: number;
  stats: Stats;
  todayPuzzleTheme: string;
  hasPlayedToday: boolean;
  todayWon: boolean;
}) {
  const [tt, setTt] = useState(timeUntilTomorrow());
  useEffect(() => {
    const i = setInterval(() => setTt(timeUntilTomorrow()), 1000);
    return () => clearInterval(i);
  }, []);

  return (
    <motion.div key="home" className="grain"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      style={{ flex: 1, display: "flex", flexDirection: "column", padding: "28px 24px", position: "relative" }}>
      <motion.div initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: "var(--fg-3)", letterSpacing: "0.18em", textTransform: "uppercase" }}>
          № {dayNumber.toString().padStart(3, "0")}
        </div>
        <div onClick={onStats}
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--fg-2)", cursor: "pointer" }}>
          <span style={{ color: "var(--gold)" }}>◆</span>
          <span className="mono">{stats.streak}</span>
          <span style={{ color: "var(--fg-3)" }}>streak</span>
        </div>
      </motion.div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 8 }}>
        <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} style={{ position: "relative" }}>
          <div className="display glow-orange"
            style={{ fontSize: 92, lineHeight: 1, fontVariationSettings: '"opsz" 144, "SOFT" 80, "wght" 300', letterSpacing: "-0.04em" }}>
            shift
          </div>
          <div className="shimmer" style={{ position: "absolute", inset: 0, mixBlendMode: "overlay", borderRadius: 4 }} />
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35, duration: 0.6 }}
          style={{ marginTop: 4, fontSize: 13, color: "var(--fg-3)", letterSpacing: "0.22em", textTransform: "uppercase", textAlign: "center" }}>
          One letter. One word. One step closer.
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
          style={{ marginTop: 28, padding: "14px 18px", border: "1px solid var(--line)", borderRadius: 16,
            background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0))",
            minWidth: 240, textAlign: "center" }}>
          <div style={{ fontSize: 10, color: "var(--fg-3)", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 4 }}>
            Today's puzzle
          </div>
          <div className="display glow-gold"
            style={{ fontSize: 22, fontVariationSettings: '"opsz" 144, "SOFT" 50, "wght" 400' }}>
            {todayPuzzleTheme}
          </div>
        </motion.div>
      </div>

      <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.7 }}
        style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
        <button className="btn btn-primary" style={{ minWidth: 220, fontSize: 14, padding: "16px 26px" }} onClick={onPlay}>
          {hasPlayedToday ? (todayWon ? "View today's solve" : "Resume") : "Play daily"}
        </button>
        <button className="btn btn-ghost" onClick={onPractice}>Practice mode</button>
        <div style={{ marginTop: 14, fontSize: 11, color: "var(--fg-3)", letterSpacing: "0.16em", textTransform: "uppercase" }}>
          Next puzzle in <span className="mono" style={{ color: "var(--fg-2)" }}>{tt}</span>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}
        style={{ position: "absolute", bottom: 22, right: 22 }}>
        <button className="btn" onClick={onAI} disabled={aiLoading}
          style={{
            width: 52, height: 52, padding: 0, borderRadius: 999,
            background: "linear-gradient(180deg, #1f1d1b, #161413)",
            color: "var(--gold)", border: "1px solid rgba(255,209,102,0.25)",
            boxShadow: "0 10px 24px -8px rgba(255,209,102,0.25)", fontSize: 18,
          }}
          title="AI generated puzzle">
          {aiLoading ? <Spinner /> : "✦"}
        </button>
        {aiError && (
          <div style={{
            position: "absolute", right: 0, bottom: 60, background: "var(--bg-2)",
            border: "1px solid var(--line)", padding: "8px 12px", borderRadius: 10,
            fontSize: 11, color: "var(--danger)", whiteSpace: "nowrap",
          }}>{aiError}</div>
        )}
      </motion.div>
    </motion.div>
  );
}

function Spinner() {
  return (
    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      style={{ width: 18, height: 18, border: "2px solid rgba(255,209,102,0.25)", borderTopColor: "var(--gold)", borderRadius: 999 }} />
  );
}

/* ------------------------------- GameView -------------------------------- */
type WinResult = { chain: string[]; seconds: number; par: number; moves: number };

function GameView({
  puzzle, onWin, onAbort, mode,
}: {
  puzzle: Puzzle;
  onWin: (r: WinResult) => void;
  onAbort: () => void;
  mode: "daily" | "practice" | "ai";
}) {
  const [chain, setChain] = useState<string[]>([puzzle.start]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [shake, setShake] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const currentRowRef = useRef<HTMLDivElement | null>(null);

  const current = chain[chain.length - 1];
  const target = puzzle.target;
  const moves = chain.length - 1;
  const won = current === target;

  // keep the active row in view as the chain grows
  useEffect(() => {
    const el = currentRowRef.current;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chain.length]);

  useEffect(() => {
    if (won) {
      if (tickRef.current) clearInterval(tickRef.current);
      return;
    }
    tickRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [won]);

  useEffect(() => {
    if (won) {
      playWin();
      const t = setTimeout(() => onWin({ chain, seconds, par: puzzle.par, moves }), 1100);
      return () => clearTimeout(t);
    }
  }, [won]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (won) return;
      const k = e.key.toUpperCase();
      if (k === "BACKSPACE") { setEditingIdx(null); return; }
      if (k === "Z" && (e.ctrlKey || e.metaKey)) { undo(); return; }
      if (/^[A-Z]$/.test(k)) handleKey(k);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const triggerShake = () => {
    setShake(true);
    playInvalid();
    setTimeout(() => setShake(false), 380);
  };

  const handleTapLetter = (i: number) => {
    if (won) return;
    playClick();
    setEditingIdx(editingIdx === i ? null : i);
  };

  const handleKey = (k: string) => {
    if (won) return;
    if (editingIdx === null) {
      const tIdx = current.split("").findIndex((c, i) => target[i] !== c);
      const idx = tIdx >= 0 ? tIdx : 0;
      attemptChange(idx, k);
      return;
    }
    attemptChange(editingIdx, k);
  };

  const attemptChange = (idx: number, letter: string) => {
    const next = current.substring(0, idx) + letter + current.substring(idx + 1);
    if (next === current) { setEditingIdx(null); return; }
    if (!isValidWord(next)) { triggerShake(); setEditingIdx(null); return; }
    playValid();
    setChain([...chain, next]);
    setEditingIdx(null);
  };

  const undo = () => {
    if (chain.length <= 1) return;
    playClick();
    setChain(chain.slice(0, -1));
    setEditingIdx(null);
  };

  const onBack = () => setEditingIdx(null);

  const hintIdx = useMemo(() => {
    if (!showHint) return -1;
    return current.split("").findIndex((c, i) => target[i] !== c);
  }, [showHint, current, target]);

  const visiblePrev = chain.slice(0, -1);

  return (
    <motion.div key="game" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 8px" }}>
        <div onClick={onAbort} style={{ cursor: "pointer", padding: 8, color: "var(--fg-2)", fontSize: 18, lineHeight: 1 }}>‹</div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Stat label="moves" value={moves} accent={moves <= puzzle.par ? "var(--success)" : "var(--accent)"} />
          <Stat label="par" value={puzzle.par} />
          <Stat label="time" value={fmtTime(seconds)} mono />
        </div>
        <div onClick={() => setShowHint(s => !s)}
          style={{ cursor: "pointer", padding: 8, color: showHint ? "var(--gold)" : "var(--fg-3)", fontSize: 14 }}>?</div>
      </div>

      <div style={{ textAlign: "center", padding: "6px 20px 14px" }}>
        <div style={{ fontSize: 10, color: "var(--fg-3)", letterSpacing: "0.22em", textTransform: "uppercase" }}>
          {mode === "daily" ? `Daily № ${getDayNumber()}` : mode === "ai" ? "AI Generated" : "Practice"} ·{" "}
          <span style={{ color: "var(--gold)" }}>{puzzle.theme}</span>
        </div>
      </div>

      <div ref={scrollAreaRef} style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "8px 20px 20px",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start" }}>
        <div style={{ fontSize: 9, color: "var(--fg-3)", letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 8 }}>
          Start
        </div>

        <AnimatePresence initial={false}>
          {visiblePrev.map((w, i) => {
            const prev = i === 0 ? null : visiblePrev[i - 1];
            return (
              <div key={`${i}-${w}`} style={{ marginBottom: 6 }}>
                <WordRow word={w} prevWord={prev} kind="dim" size={32} gap={5} />
                {i < visiblePrev.length - 1 && <div className="conn" />}
              </div>
            );
          })}
        </AnimatePresence>

        {visiblePrev.length > 0 && <div className="conn" style={{ height: 18 }} />}

        <div ref={currentRowRef} style={{ scrollMarginBottom: 24 }}>
        <WordRow word={current}
          prevWord={visiblePrev[visiblePrev.length - 1] ?? null}
          kind={won ? "win" : "current"}
          size={62} gap={8}
          editing={editingIdx ?? -1}
          onTapLetter={won ? undefined : handleTapLetter}
          shaking={shake} />
        </div>

        {hintIdx >= 0 && !won && (
          <div style={{ display: "flex", gap: 8, marginTop: 6, justifyContent: "center" }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ width: 62, display: "flex", justifyContent: "center" }}>
                {i === hintIdx ? (
                  <div style={{ width: 6, height: 6, borderRadius: 99, background: "var(--gold)", boxShadow: "0 0 8px var(--gold)" }} />
                ) : null}
              </div>
            ))}
          </div>
        )}

        <div style={{ height: 24 }} />

        <div style={{ fontSize: 9, color: "var(--fg-3)", letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 8 }}>
          Goal
        </div>
        <WordRow word={target} prevWord={null} kind="target" size={38} gap={6} />
      </div>

      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 8, flexShrink: 0 }}>
        <Keyboard onKey={handleKey} onBack={onBack} onUndo={undo} disabled={won} />
      </div>
    </motion.div>
  );
}

/* ------------------------------- WinView --------------------------------- */
function WinView({
  result, puzzle, onShare, onHome, onPlayAgain, mode, stats,
}: {
  result: WinResult;
  puzzle: Puzzle;
  onShare: () => void;
  onHome: () => void;
  onPlayAgain: () => void;
  mode: "daily" | "practice" | "ai";
  stats: Stats;
}) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setStage(1), 200);
    const t2 = setTimeout(() => setStage(2), 700);
    const t3 = setTimeout(() => setStage(3), 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);
  const perfect = result.moves === result.par;
  return (
    <motion.div key="win" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 24px 28px", position: "relative", overflow: "hidden" }}>
      <Confetti n={perfect ? 90 : 50} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="display"
          style={{
            fontSize: 64, lineHeight: 1,
            color: perfect ? "var(--gold)" : "var(--success)",
            textShadow: perfect ? "0 0 40px rgba(255,209,102,0.5)" : "0 0 40px rgba(6,214,160,0.5)",
            fontVariationSettings: '"opsz" 144, "SOFT" 80, "wght" 400',
          }}>
          {perfect ? "Flawless" : "Solved"}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: stage >= 1 ? 1 : 0, y: stage >= 1 ? 0 : 6 }}
          style={{ marginTop: 8, fontSize: 12, color: "var(--fg-3)", letterSpacing: "0.22em", textTransform: "uppercase" }}>
          {puzzle.start} → {puzzle.target} · {puzzle.theme}
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: stage >= 2 ? 1 : 0 }}
          style={{ marginTop: 30, display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
          {result.chain.map((w, i) => {
            const prev = i === 0 ? null : result.chain[i - 1];
            return (
              <div key={i} style={{ display: "flex", gap: 4 }}>
                {w.split("").map((c, j) => {
                  const changed = prev && prev[j] !== c;
                  return (
                    <div key={j} style={{
                      width: 14, height: 14, borderRadius: 4,
                      background: changed ? "var(--accent)" : "rgba(255,255,255,0.08)",
                      boxShadow: changed ? "0 0 10px rgba(255,107,53,0.5)" : "none",
                    }} />
                  );
                })}
              </div>
            );
          })}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: stage >= 2 ? 1 : 0, y: stage >= 2 ? 0 : 6 }}
          style={{ marginTop: 28, display: "flex", gap: 28 }}>
          <Stat label="moves" value={result.moves} accent={perfect ? "var(--gold)" : "var(--success)"} />
          <Stat label="par" value={result.par} />
          <Stat label="time" value={fmtTime(result.seconds)} mono />
        </motion.div>

        {mode === "daily" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: stage >= 3 ? 1 : 0 }}
            style={{ marginTop: 22, fontSize: 12, color: "var(--fg-2)" }}>
            <span style={{ color: "var(--gold)" }}>◆</span> {stats.streak} day streak
            {stats.streak === stats.bestStreak && stats.streak > 1 ? "  ·  new best" : ""}
          </motion.div>
        )}
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: stage >= 3 ? 1 : 0, y: stage >= 3 ? 0 : 8 }}
        style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
        <button className="btn btn-primary" style={{ minWidth: 220 }} onClick={onShare}>Share result</button>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={onPlayAgain}>{mode === "daily" ? "Practice" : "Again"}</button>
          <button className="btn btn-ghost" onClick={onHome}>Home</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------ ShareView -------------------------------- */
function ShareView({
  result, puzzle, mode, dayNumber, onClose,
}: {
  result: WinResult;
  puzzle: Puzzle;
  mode: "daily" | "practice" | "ai";
  dayNumber: number;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const grid = useMemo(() => {
    return result.chain.map((w, i) => {
      const prev = i === 0 ? null : result.chain[i - 1];
      return w.split("").map((c, j) => (prev && prev[j] !== c ? "🟧" : "⬛")).join("");
    }).join("\n");
  }, [result]);

  const perfect = result.moves === result.par;
  const headline = mode === "daily"
    ? `SHIFT № ${dayNumber} · ${result.moves}/${result.par}${perfect ? " ★" : ""}`
    : `SHIFT · ${puzzle.start}→${puzzle.target} · ${result.moves}/${result.par}${perfect ? " ★" : ""}`;
  const url = typeof window !== "undefined" ? window.location.origin : "";
  const text = `${headline}\n${fmtTime(result.seconds)}\n\n${grid}\n\n${url}`;

  const copy = async () => {
    try {
      if (navigator.share && mode === "daily") {
        await navigator.share({ title: "SHIFT", text });
        setCopied(true);
      } else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }
    } catch {
      try { await navigator.clipboard.writeText(text); setCopied(true); } catch {}
    }
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <motion.div key="share" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: "absolute", inset: 0, background: "rgba(13,13,13,0.92)",
        backdropFilter: "blur(12px)", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: 24, zIndex: 30,
      }}>
      <motion.div initial={{ scale: 0.94, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{
          width: "100%", maxWidth: 360, borderRadius: 22, padding: 22,
          border: "1px solid var(--line)", background: "linear-gradient(180deg, #161413, #0F0E0D)",
          boxShadow: "0 30px 80px -20px rgba(255,107,53,0.25), 0 0 0 1px rgba(255,255,255,0.04) inset",
        }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="display glow-orange"
            style={{ fontSize: 28, fontVariationSettings: '"opsz" 144, "SOFT" 80, "wght" 400' }}>shift</div>
          <div style={{ fontSize: 11, color: "var(--fg-3)", letterSpacing: "0.18em", textTransform: "uppercase" }}>
            {mode === "daily" ? `№ ${dayNumber}` : "Practice"}
          </div>
        </div>

        <div style={{ marginTop: 14, fontSize: 11, color: "var(--fg-3)", letterSpacing: "0.22em", textTransform: "uppercase" }}>
          {puzzle.theme}
        </div>
        <div className="display" style={{ marginTop: 4, fontSize: 22, color: "var(--fg)", letterSpacing: "0.04em" }}>
          {puzzle.start} <span style={{ color: "var(--fg-3)" }}>→</span> {puzzle.target}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 18, alignItems: "center" }}>
          {result.chain.map((w, i) => {
            const prev = i === 0 ? null : result.chain[i - 1];
            return (
              <div key={i} style={{ display: "flex", gap: 4 }}>
                {w.split("").map((c, j) => {
                  const changed = prev && prev[j] !== c;
                  return (
                    <div key={j} style={{
                      width: 18, height: 18, borderRadius: 4,
                      background: changed ? "var(--accent)" : "rgba(255,255,255,0.07)",
                      boxShadow: changed ? "0 0 10px rgba(255,107,53,0.45)" : "none",
                    }} />
                  );
                })}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between", padding: "12px 0", borderTop: "1px solid var(--line)" }}>
          <Stat label="moves" value={`${result.moves}/${result.par}`} accent={perfect ? "var(--gold)" : "var(--fg)"} />
          <Stat label="time" value={fmtTime(result.seconds)} mono />
          <Stat label="rating" value={perfect ? "★★★" : result.moves <= result.par + 1 ? "★★" : "★"} accent="var(--gold)" />
        </div>
      </motion.div>

      <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
        <button className="btn btn-primary" onClick={copy}>{copied ? "Shared" : "Share result"}</button>
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
      </div>
      <div style={{ marginTop: 12, fontSize: 11, color: "var(--fg-3)", letterSpacing: "0.16em", textTransform: "uppercase" }}>
        {copied ? "Pasted to clipboard — share anywhere" : "Spoiler-free · ready for X, Stories, TikTok"}
      </div>
    </motion.div>
  );
}

/* ----------------------------- StatsModal -------------------------------- */
function StatsModal({ stats, onClose }: { stats: Stats; onClose: () => void }) {
  const winRate = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;
  return (
    <motion.div key="stats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: "absolute", inset: 0, background: "rgba(13,13,13,0.85)",
        backdropFilter: "blur(10px)", display: "flex", alignItems: "flex-end",
        justifyContent: "center", zIndex: 40,
      }} onClick={onClose}>
      <motion.div initial={{ y: 360 }} animate={{ y: 0 }} exit={{ y: 360 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 480,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          padding: "20px 24px 28px", background: "var(--bg-1)",
          border: "1px solid var(--line)", borderBottom: "none",
        }}>
        <div style={{ width: 36, height: 4, background: "var(--fg-3)", borderRadius: 99, margin: "0 auto 14px", opacity: 0.5 }} />
        <div className="display" style={{ fontSize: 26, color: "var(--fg)" }}>Statistics</div>
        <div style={{ fontSize: 11, color: "var(--fg-3)", letterSpacing: "0.18em", textTransform: "uppercase", marginTop: 2 }}>
          Your shift history
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 18 }}>
          <Card v={stats.played} l="Played" />
          <Card v={`${winRate}%`} l="Win rate" />
          <Card v={stats.streak} l="Streak" accent="var(--gold)" />
          <Card v={stats.bestStreak} l="Best" accent="var(--accent)" />
        </div>

        <div style={{ marginTop: 22, fontSize: 11, color: "var(--fg-3)", letterSpacing: "0.18em", textTransform: "uppercase" }}>
          Move distribution
        </div>
        <Distribution dist={stats.distribution} />

        <div style={{
          marginTop: 22, padding: 16, borderRadius: 14, border: "1px solid var(--line)",
          background: "linear-gradient(180deg, rgba(255,209,102,0.04), rgba(255,107,53,0.02))",
        }}>
          <div className="display glow-gold" style={{ fontSize: 18 }}>SHIFT+</div>
          <div style={{ fontSize: 12, color: "var(--fg-2)", marginTop: 4, lineHeight: 1.5 }}>
            Unlock the daily archive, ranked play, friend battles, and signature themes.
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <button className="btn btn-primary" style={{ padding: "10px 16px", fontSize: 12 }} onClick={onClose}>Try free</button>
            <div style={{ alignSelf: "center", fontSize: 11, color: "var(--fg-3)" }}>$2.99/mo · cancel any time</div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
function Card({ v, l, accent }: { v: React.ReactNode; l: string; accent?: string }) {
  return (
    <div style={{ padding: "12px 8px", borderRadius: 12, border: "1px solid var(--line)", textAlign: "center" }}>
      <div className="display mono"
        style={{
          fontSize: 26, color: accent || "var(--fg)", lineHeight: 1,
          fontVariationSettings: '"opsz" 144, "SOFT" 30, "wght" 500',
        }}>
        {v}
      </div>
      <div style={{ fontSize: 9, color: "var(--fg-3)", letterSpacing: "0.18em", textTransform: "uppercase", marginTop: 6 }}>
        {l}
      </div>
    </div>
  );
}
function Distribution({ dist }: { dist: Record<string, number> }) {
  const entries = Object.entries(dist || {}).sort((a, b) => Number(a[0]) - Number(b[0]));
  if (!entries.length) {
    return <div style={{ marginTop: 8, fontSize: 12, color: "var(--fg-3)" }}>Solve a puzzle to start tracking.</div>;
  }
  const max = Math.max(...entries.map(e => e[1]));
  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 16, fontSize: 11, color: "var(--fg-3)" }} className="mono">{k}</div>
          <div style={{ flex: 1, height: 18, background: "rgba(255,255,255,0.04)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{
              width: `${(v / max) * 100}%`, height: "100%",
              background: "linear-gradient(90deg, var(--accent), var(--gold))",
              borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 6,
            }}>
              <span style={{ fontSize: 10, color: "#0D0D0D", fontWeight: 600 }} className="mono">{v}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ================================ App ==================================== */
type View = "home" | "game" | "win" | "share";

export default function Page() {
  const [view, setView] = useState<View>("home");
  const [statsOpen, setStatsOpen] = useState(false);
  const [puzzle, setPuzzle] = useState<Puzzle>(getDailyPuzzle());
  const [mode, setMode] = useState<"daily" | "practice" | "ai">("daily");
  const [result, setResult] = useState<WinResult | null>(null);
  const [stats, setStats] = useState<Stats>(defaultStats());
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [mounted, setMounted] = useState(false);
  const dayNumber = getDayNumber();
  const todayPuzzle = getDailyPuzzle();

  useEffect(() => {
    setStats(loadStats());
    setMounted(true);
  }, []);

  const today = new Date().toDateString();
  const hasPlayedToday = stats.lastDay === today;
  const todayWon = hasPlayedToday && stats.lastDayWon;

  const startDaily = async () => {
    await initSound();
    setMode("daily");
    setPuzzle(todayPuzzle);
    setView("game");
  };
  const startPractice = async () => {
    await initSound();
    setMode("practice");
    const todayIdx = PUZZLES.indexOf(todayPuzzle);
    const choices = PUZZLES.filter((_, i) => i !== todayIdx);
    const p = choices[Math.floor(Math.random() * choices.length)];
    setPuzzle(p);
    setView("game");
  };
  const startAI = async () => {
    await initSound();
    setAiError("");
    setAiLoading(true);
    try {
      const r = await fetch("/api/generate");
      if (!r.ok) throw new Error("api");
      const data = await r.json();
      // ensure dictionary contains generated path words
      addToDictionary(data.solution || []);
      setMode("ai");
      setPuzzle(data);
      setView("game");
    } catch {
      setAiError("Couldn't conjure a puzzle. Try again.");
      setTimeout(() => setAiError(""), 2400);
    } finally {
      setAiLoading(false);
    }
  };

  const handleWin = (r: WinResult) => {
    setResult(r);
    setView("win");
    if (mode === "daily") {
      setStats(prev => {
        const today = new Date().toDateString();
        const dayChanged = prev.lastDay !== today;
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const continuing = prev.lastDay === yesterday.toDateString();
        const newStreak = dayChanged ? (continuing ? prev.streak + 1 : 1) : prev.streak;
        const dist = { ...prev.distribution, [r.moves]: (prev.distribution[r.moves] || 0) + 1 };
        const next: Stats = {
          ...prev,
          played: dayChanged ? prev.played + 1 : prev.played,
          won: dayChanged ? prev.won + 1 : prev.won,
          streak: newStreak,
          bestStreak: Math.max(prev.bestStreak, newStreak),
          lastDay: today,
          lastDayWon: true,
          perfectSolves: prev.perfectSolves + (r.moves === r.par ? 1 : 0),
          distribution: dist,
        };
        saveStats(next);
        return next;
      });
    }
  };

  const goHome = () => { setView("home"); setResult(null); };
  const playAgain = () => { setView("home"); setTimeout(startPractice, 80); };

  if (!mounted) return <div className="shift-app"><div className="shift-frame" /></div>;

  return (
    <div className="shift-app">
      <div className="shift-frame">
        <AnimatePresence mode="wait">
          {view === "home" && (
            <HomeView key="home"
              onPlay={startDaily} onPractice={startPractice}
              onStats={() => setStatsOpen(true)}
              onAI={startAI} aiLoading={aiLoading} aiError={aiError}
              dayNumber={dayNumber} stats={stats}
              todayPuzzleTheme={todayPuzzle.theme}
              hasPlayedToday={hasPlayedToday} todayWon={todayWon} />
          )}
          {view === "game" && (
            <GameView key="game" puzzle={puzzle} mode={mode}
              onWin={handleWin} onAbort={goHome} />
          )}
          {view === "win" && result && (
            <WinView key="win" result={result} puzzle={puzzle} mode={mode} stats={stats}
              onShare={() => setView("share")} onHome={goHome} onPlayAgain={playAgain} />
          )}
          {view === "share" && result && (
            <>
              <WinView key="win-bg" result={result} puzzle={puzzle} mode={mode} stats={stats}
                onShare={() => {}} onHome={goHome} onPlayAgain={playAgain} />
              <ShareView result={result} puzzle={puzzle} mode={mode}
                dayNumber={dayNumber} onClose={() => setView("win")} />
            </>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {statsOpen && <StatsModal stats={stats} onClose={() => setStatsOpen(false)} />}
        </AnimatePresence>
      </div>
    </div>
  );
}
