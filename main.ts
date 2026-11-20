// gta6-trophy-rarity-forecast-01 — "Refresh-aware launch-curve forecaster"
//
// Forecasts, for every GTA VI PlayStation 5 trophy, the percent of Exophase-tracked
// players who will have earned it at the case's target, as five quantiles
// [0.05, 0.25, 0.5, 0.75, 0.95] per trophy. Node 22, standard library only.
//
// Model (written fresh for this entry; nothing is copied from the kit's starter
// beyond the shared input/output contract, and no code is copied from any other
// entry). A trophy's earn rate is a ratio, holders / players-tracked, and the two
// sides move for different reasons, so the forecast models them separately:
//
//   rate_target(i) = holders_target(i) / players_target
//
//   players_target — Exophase's tracked-player count. It does not grow smoothly:
//   the page is cached and refreshed in jumps (launch night: exactly 638 players
//   and identical rates for four and a half hours, then one refresh to 3,868).
//   When the history shows players moving, players_target comes from a least-
//   squares line of ln(players) on time over the last 24 h of reads, extrapolated
//   to the target and capped at 40x. When the history is flat (no two reads show
//   a different count), the model assumes the overdue refresh lands before the
//   target: one jump of the size the practice refresh showed, 3,868 / 638 = 6.06x.
//   That flat-history rule is the practice-calibrated part of this entry: both
//   practice cases have perfectly flat histories and both answers are the
//   refreshed page, so a model that trusts a flat history scores the house
//   baseline's ~1.5 loss. On the final case the history spans two days of
//   10-minute reads, so the fitted path governs and the flat rule never fires.
//
//   holders_target(i) — two sources. (a) The cohort already tracked keeps
//   playing: per trophy, ln(holders) is fitted against ln(1 + hours since
//   release) over the history and read at the target (a launch curve: holders
//   grow fast early, then flatten). Flat history gives slope 0, i.e. no growth.
//   (b) The newly tracked players between the checkpoint and the target earn
//   trophy i with probability e(i). A new player has only had the exposure
//   since the last refresh to play, so e(i) is a fraction kappa of the existing
//   cohort's rate, with kappa = 1 - exp(-exposure / 72 h): the practice refresh
//   pins kappa down — of the 3,230 newly tracked players only 103 new trophies
//   outside the 100% one were earned, i.e. new players earned a typical trophy
//   at ~6-7% of the old cohort's rate after ~4.7 h of exposure, which is
//   1 - exp(-4.7 / 72) = 0.063. Plus an instant-earn term: a trophy the whole
//   old cohort holds (the 100% "start the game" trophy) is earned by every new
//   player too, so e(i) also carries (1 - kappa) * r^20, which is ~0 for rare
//   trophies and 1 for a 100% trophy. Without it the 100% trophy would be
//   forecast near 20% and cost ~0.2 of loss on its own.
//
//   Spread — the logit spread around the median combines four honest sources:
//   a 0.35 base (parameter uncertainty), a random-walk term 0.30 * sqrt(days)
//   that grows with the horizon, a binomial term 1 / sqrt(holders at target)
//   (capped at 0.6; the answering read is itself a noisy count, worst for the
//   rarest trophies), and, only on the flat-history path, 0.30 for refresh
//   timing (the refresh may land twice, or later than the target). The numbers
//   were chosen on the reconstructed practice answers (see CALIBRATION.md):
//   the loss-minimising spread on that reconstruction is the narrowest tried
//   (the median is exact there by construction), so the spread used here is
//   deliberately wider — the reconstruction is an assumption, not the true
//   answer, and the wider spread costs ~0.04 of practice loss while buying
//   robustness if the true per-trophy allocation differs.
//
// Determinism: no randomness, no clock reads, no network. Input files are read
// in name order and the output is fixed JSON, so two runs write byte-identical
// files. Runs in well under a second per case.
//
// Usage (as the grader runs it):
//   MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The quantile levels the contest scores, in the order each row lists them. */
const LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95];
/** The standard normal's quantile at each level. */
const Z = [-1.645, -0.674, 0, 0.674, 1.645];
/** Release day begins here; launch curves are measured in hours since it. */
const RELEASE_MS = Date.parse('2026-11-19T00:00:00Z');

/* --- Calibration constants (derivation in CALIBRATION.md) --- */
/** Players-tracked jump of the first Exophase refresh: 3,868 / 638. */
const REFRESH_JUMP = 6.06;
/** Time constant of a new cohort catching up to the old cohort's earn rate. */
const KAPPA_TAU_H = 72;
/** Power that makes the instant-earn term bite only near a 100% rate. */
const INSTANT_POWER = 20;
/** Largest players multiplier the trend extrapolation may claim. */
const PLAYERS_CAP = 40;
/** Logit spread: base parameter uncertainty. */
const SPREAD_BASE = 0.35;
/** Logit spread: random-walk volatility per square-root day of horizon. */
const SPREAD_RW = 0.3;
/** Logit spread: extra uncertainty when the flat-history refresh rule fires. */
const SPREAD_JUMP = 0.3;
/** Logit spread: cap on the binomial (counting-noise) term. */
const BINOM_CAP = 0.6;
/** Longest window of history used for the players trend (hours). */
const TREND_WINDOW_H = 24;
/** Largest launch-curve slope (log holders per log hour) allowed. */
const MAX_HOLDER_SLOPE = 3;

interface TrophyIn {
  id: number;
  name: string;
  tier: string;
}

interface ReadIn {
  at: string;
  players_tracked: number;
  trophies_earned: number;
  rates: Array<number | null>;
}

interface CaseIn {
  id: string;
  at: string;
  horizon_minutes: number;
  target: string;
  levels: number[];
  trophies: TrophyIn[];
  history: ReadIn[];
}

/** Percent clamped into the scorer's [0.01, 99.99] range before any logit. */
const clampPct = (x: number): number => Math.min(99.99, Math.max(0.01, x));
/** logit of a percent (p = x / 100). */
const logit = (pct: number): number => {
  const p = clampPct(pct) / 100;
  return Math.log(p / (1 - p));
};
/** Inverse logit, back to a percent. */
const invLogit = (l: number): number => 100 / (1 + Math.exp(-l));
/** x rounded to 4 decimals, as the house baseline rounds its rows. */
const round4 = (x: number): number => Math.round(x * 10_000) / 10_000;
/** Mean of a non-empty list. */
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Least-squares slope of y on x, or null when x does not vary (a flat series
 * has no trend to fit, which is a real answer here, not an error).
 */
function slope(xs: number[], ys: number[]): number | null {
  if (xs.length < 2) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) * (xs[i] - mx);
  }
  if (sxx <= 0) return null;
  return sxy / sxx;
}

/** Hours from the release instant to a timestamp. Never negative. */
const hoursSinceRelease = (iso: string): number =>
  Math.max(0, (Date.parse(iso) - RELEASE_MS) / 3_600_000);

/**
 * The trophy's last non-null rate, scanning the history backwards. A trophy
 * the reads never list falls back to 0.5%: rare, but present, rather than
 * absent — an absent rate would force a 0% forecast the scorer cannot use.
 */
function lastRate(c: CaseIn, i: number): number {
  for (let h = c.history.length - 1; h >= 0; h--) {
    const r = c.history[h].rates[i];
    if (typeof r === 'number' && Number.isFinite(r)) return r;
  }
  return 0.5;
}

/**
 * Analyse the players-tracked series: whether it ever moves, the multiplier
 * to the target, and when it last changed (which sets the new cohort's
 * exposure). Returns the multiplier, the flat flag, and the last-change time.
 */
function analysePlayers(c: CaseIn): {
  multiplier: number;
  flat: boolean;
  lastChangeAt: string;
} {
  const last = c.history[c.history.length - 1];
  const tLast = Date.parse(last.at);
  const horizonDays = c.horizon_minutes / 1440;
  const distinct = new Set(c.history.map((h) => h.players_tracked)).size;
  let lastChangeAt = c.history[0].at;
  for (let i = 1; i < c.history.length; i++) {
    if (c.history[i].players_tracked !== c.history[i - 1].players_tracked) {
      lastChangeAt = c.history[i].at;
    }
  }
  if (distinct < 2) {
    // Flat history: the page has not refreshed since the first read, so the
    // overdue refresh is assumed to land before the target (practice rule).
    return { multiplier: REFRESH_JUMP, flat: true, lastChangeAt };
  }
  // Moving history: log-linear trend over the last day of reads, extrapolated
  // to the target. The window is the recent day because launch growth
  // decelerates — the whole-history slope would overstate it.
  const windowStart = tLast - TREND_WINDOW_H * 3_600_000;
  const recent = c.history.filter((h) => Date.parse(h.at) >= windowStart);
  const rows = recent.length >= 2 ? recent : c.history;
  const xs = rows.map((h) => (Date.parse(h.at) - tLast) / 86_400_000);
  const ys = rows.map((h) => Math.log(Math.max(1, h.players_tracked)));
  const s = slope(xs, ys);
  const growth = s !== null && s > 0 ? Math.exp(s * horizonDays) : 1;
  return {
    multiplier: Math.min(PLAYERS_CAP, Math.max(1, growth)),
    flat: false,
    lastChangeAt,
  };
}

/**
 * Per-trophy launch-curve slope: least squares of ln(holders) on
 * ln(1 + hours since release). Reads where the trophy has no holders carry
 * no log, so they are skipped; fewer than three usable reads, or no time
 * variation, means slope 0 (holders flat). Slopes are floored at 0 — holders
 * of a cohort that is only tracked, never untracked, cannot fall — and
 * capped, so one noisy early read cannot launch a trophy to the moon.
 */
function holderSlope(c: CaseIn, i: number): number {
  const pts: Array<{ x: number; y: number }> = [];
  for (const h of c.history) {
    const r = h.rates[i];
    if (typeof r !== 'number' || !Number.isFinite(r) || r <= 0) continue;
    const holders = (r / 100) * Math.max(1, h.players_tracked);
    if (holders <= 0) continue;
    pts.push({ x: Math.log1p(hoursSinceRelease(h.at)), y: Math.log(holders) });
  }
  if (pts.length < 3) return 0;
  const s = slope(
    pts.map((p) => p.x),
    pts.map((p) => p.y),
  );
  if (s === null) return 0;
  return Math.min(MAX_HOLDER_SLOPE, Math.max(0, s));
}

/**
 * Forecast one trophy: median percent at the target and the logit spread.
 * The median is holders / players at the target (see the header comment);
 * the spread adds base, random-walk, binomial and (flat history only)
 * refresh-timing uncertainty in quadrature.
 */
function forecastTrophy(
  c: CaseIn,
  i: number,
  players: { multiplier: number; flat: boolean; lastChangeAt: string },
  kappa: number,
  horizonDays: number,
): number[] {
  const last = c.history[c.history.length - 1];
  const playersLast = Math.max(1, last.players_tracked);
  const playersTarget = playersLast * players.multiplier;
  const newPlayers = playersTarget - playersLast;

  const rateLast = lastRate(c, i);
  const holdersLast = (rateLast / 100) * playersLast;

  // Existing cohort: launch curve read at the target.
  const xLast = Math.log1p(hoursSinceRelease(last.at));
  const xTarget = Math.log1p(hoursSinceRelease(c.target));
  const b = holderSlope(c, i);
  // The existing cohort cannot hold a trophy more times than it has players.
  const holdersExisting = Math.min(
    playersLast,
    holdersLast * Math.exp(b * (xTarget - xLast)),
  );

  // New cohort: earn probability from the existing cohort's rate at target.
  const rateProg = holdersExisting / playersLast;
  const earnProb =
    kappa * rateProg + (1 - kappa) * Math.pow(rateProg, INSTANT_POWER);
  const holdersTarget = holdersExisting + newPlayers * earnProb;
  const median = (holdersTarget / playersTarget) * 100;

  // Spread in logit units.
  const binom = Math.min(BINOM_CAP, 1 / Math.sqrt(Math.max(1, holdersTarget)));
  const jumpVar = players.flat ? SPREAD_JUMP * SPREAD_JUMP : 0;
  const spread = Math.sqrt(
    SPREAD_BASE * SPREAD_BASE +
      (SPREAD_RW * Math.sqrt(horizonDays)) ** 2 +
      binom * binom +
      jumpVar,
  );

  const centre = logit(median);
  const qs: number[] = [];
  let prev = 0;
  for (const z of Z) {
    // Clamp into (0, 100) and keep the row non-decreasing after rounding.
    let q = round4(Math.min(99.9999, Math.max(0.0001, invLogit(centre + z * spread))));
    if (q < prev) q = prev;
    prev = q;
    qs.push(q);
  }
  return qs;
}

/** Forecast one whole case: its output object plus the players analysis, so
 * the caller can report both without analysing the series twice. */
function forecastCase(c: CaseIn): {
  out: { trophies: Array<{ id: number; q: number[] }> };
  players: { multiplier: number; flat: boolean; lastChangeAt: string };
} {
  if (c.levels.length !== LEVELS.length || c.levels.some((t, j) => t !== LEVELS[j])) {
    throw new Error(`${c.id} asks for levels ${JSON.stringify(c.levels)}`);
  }
  if (c.history.length === 0) throw new Error(`${c.id} has no history`);
  const horizonDays = c.horizon_minutes / 1440;
  const players = analysePlayers(c);
  // Exposure of the newly tracked cohort: from the last players change (or
  // the first read, when it never changed) to the target.
  const exposureH = Math.max(
    0,
    (Date.parse(c.target) - Date.parse(players.lastChangeAt)) / 3_600_000,
  );
  const kappa = 1 - Math.exp(-exposureH / KAPPA_TAU_H);
  const trophies = c.trophies.map((t, i) => ({
    id: t.id,
    q: forecastTrophy(c, i, players, kappa, horizonDays),
  }));
  return { out: { trophies }, players };
}

mkdirSync(OUTPUT_DIR, { recursive: true });
// Every case file, in name order, so two runs write the same bytes.
const inputs = readdirSync(INPUT_DIR)
  .filter((f) => f.endsWith('.in'))
  .sort();
if (inputs.length === 0) throw new Error(`no .in case files in ${INPUT_DIR}`);
for (const file of inputs) {
  const id = file.slice(0, -'.in'.length);
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as CaseIn;
  const { out, players } = forecastCase(c);
  writeFileSync(join(OUTPUT_DIR, `${id}.out`), `${JSON.stringify(out)}\n`);
  const medians = out.trophies.map((t) => t.q[2]);
  const medianOf = (xs: number[]): number => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  console.error(
    `${id}: players x${players.multiplier.toFixed(2)}${players.flat ? ' (flat-history refresh rule)' : ''}, ` +
      `median trophy ${medianOf(medians).toFixed(2)}%, ` +
      `widest q05-q95 ${(Math.max(...out.trophies.map((t) => t.q[4] - t.q[0]))).toFixed(2)}pp`,
  );
}
