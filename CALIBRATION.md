# Calibration — how the constants were derived

This file records exactly how the numbers baked into `main.ts` were obtained,
so the entry can be re-derived (and challenged) from the kit alone. Nothing
here is tuned on the final case, which nobody has seen.

## 1. The practice situation

Both practice cases have perfectly flat histories: 7 reads (p00) and 8 reads
(p01), every one 638 players tracked, 943 trophies earned, every rate
identical. The answers are the refreshed page: at 04:30Z the read shows 3,868
players tracked and 4,276 trophies earned, and the rules state every rate but
the one at 100% fell. The 05:00Z read is unchanged again, so p00 and p01
share the same answer rates.

A persistence forecast (the house baseline) therefore scores ~1.5 of pinball
loss: the refresh moves every rate's logit by about −1.5, outside its narrow
90-minute band. Any model that trusts the flat history loses the same way.

## 2. Reconstructing the practice answers

The kit ships no reference answers. The per-trophy answers below are
reconstructed from the aggregates the competition itself publishes:

- Pre-refresh holder counts: `count(i) = rate(i) / 100 * 638`, from the
  printed 2-decimal rates, rescaled so the 54 non-100% trophies sum to the
  published 943 − 638 = 305 holders. (The raw counts sum to 304.8, so the
  rescale factor is 1.0005 — rounding noise, not a modelling choice.)
- The 100% trophy (#2 "Just Like Paradise") stays at 100%: 3,868 holders.
- Remaining new trophies: 4,276 − 3,868 = 408, minus the 305 old non-100%
  holders = **103 new holders** spread over the 54 trophies.
- **Proportional allocation (main):** the 103 are split in proportion to each
  trophy's old holder count — a new player earns a trophy at a rate
  proportional to how easy it was for the old cohort.
- **Uniform allocation (sensitivity):** the 103 are split evenly, 103/54 ≈
  1.9 per trophy.

The two allocations barely differ (worst trophy moves by ~0.06 pp), because
the old counts are all small (4–13 holders) — the reconstruction is robust
to the allocation choice, which is why both are reported in the README. What
the reconstruction *cannot* show is whether a particular trophy's new
holders really followed its old count; a trophy that suddenly became easy
(e.g. a discovered exploit) would break it. The backtest is therefore a
check of the dilution mechanism, not of exact per-trophy medians.

## 3. Constants derived from the refresh

| Constant | Value | Derivation |
|---|---|---|
| `REFRESH_JUMP` | 6.06 | 3,868 / 638 players tracked. |
| New-cohort earn ratio | ~0.067 | 103 new non-100% trophies / 3,230 new players = 0.032 trophies per new player, vs 305 / 638 = 0.478 per old player; ratio 0.067. |
| `KAPPA_TAU_H` | 72 h | `1 − exp(−4.7/72) = 0.063 ≈ 0.067`: the exposure from the first read (23:50Z) to the refresh (04:30Z) is ~4.7 h, and that exposure must reproduce the observed earn ratio. |
| `SPREAD_BASE` / `SPREAD_RW` / `SPREAD_JUMP` | 0.35 / 0.30 / 0.30 | Grid-searched on the reconstructed answers (see §4); the shipped values are deliberately wider than the grid minimum. |
| `PLAYERS_CAP` | 40x | A guardrail, not a fit: the trend extrapolation may not claim more than 40x players growth over the horizon. |
| `INSTANT_POWER` | 20 | Chosen so `r^20` is negligible below ~50% and ~1 at 100%: it only fires for the start-the-game trophy. |

## 4. Spread grid search (and why the minimum was not shipped)

On the proportional reconstruction, a grid over
`SPREAD_BASE ∈ {0.15, 0.25, 0.35, 0.5}`, `SPREAD_RW ∈ {0.1, 0.3, 0.5}`,
`SPREAD_JUMP ∈ {0, 0.3, 0.5}`, `KAPPA_TAU_H ∈ {48, 72, 120}` found its
minimum loss 0.083 at the narrowest corner (`0.15, 0.1, 0`). That corner is
what you get by trusting the reconstruction exactly — the median is exact
there by construction, so narrower always wins. Shipping it would be
overfitting to an assumption. The shipped spread (`0.35, 0.30, 0.30`,
`KAPPA_TAU_H = 72`) scores 0.122 on the proportional and 0.130 on the
uniform reconstruction: ~0.04 worse on the reconstruction, with coverage
1.000 instead of the ~0.90 an honest interval should have, in exchange for
robustness if the true allocation differs. If the true answers are close to
the reconstruction, the shipped spread is wider than optimal — that is the
documented cost.

## 5. The full 55-trophy uncertainty panel (practice case p00)

`*Answer` is the reconstructed answer (proportional allocation, §2), not a
published value. `Median`, `q05`, `q95` are this entry's forecast. The panel
is the entry's original visible element: it shows, trophy by trophy, where
the forecast is confident (narrow band) and where it is guessing (wide
band). The widest band is #20 "Baited My Tackle" (0.86 pp); the narrowest
is #2 (0.02 pp). Mean width 0.43 pp, median width 0.40 pp.

| # | Trophy | Tier | Last % | Holders | +New | Answer* % | Median % | q05 | q95 | Width pp |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | Vice Got a Price! | platinum | 0.63 | 4.0 | 1.4 | 0.139 | 0.1369 | 0.048 | 0.39 | 0.34 |
| 2 | Just Like Paradise | bronze | 100 | 638.0 | 3230.0 | 100.000 | 99.99 | 99.9784 | 99.9954 | 0.02 |
| 3 | Paradise Lost | bronze | 1.25 | 8.0 | 2.7 | 0.276 | 0.2716 | 0.1083 | 0.6793 | 0.57 |
| 4 | T**s Ass Drug Money | bronze | 1.1 | 7.0 | 2.4 | 0.243 | 0.239 | 0.0935 | 0.6094 | 0.52 |
| 5 | Vice City, Baby! | bronze | 1.1 | 7.0 | 2.4 | 0.243 | 0.239 | 0.0935 | 0.6094 | 0.52 |
| 6 | Top Of The World, Ma | bronze | 1.1 | 7.0 | 2.4 | 0.243 | 0.239 | 0.0935 | 0.6094 | 0.52 |
| 7 | You Gotta Know When to Get Off | gold | 1.1 | 7.0 | 2.4 | 0.243 | 0.239 | 0.0935 | 0.6094 | 0.52 |
| 8 | Trust | bronze | 1.1 | 7.0 | 2.4 | 0.243 | 0.239 | 0.0935 | 0.6094 | 0.52 |
| 9 | Break the Bank | bronze | 1.1 | 7.0 | 2.4 | 0.243 | 0.239 | 0.0935 | 0.6094 | 0.52 |
| 10 | Family Matters | bronze | 1.1 | 7.0 | 2.4 | 0.243 | 0.239 | 0.0935 | 0.6094 | 0.52 |
| 11 | DWNFALL | bronze | 1.1 | 7.0 | 2.4 | 0.243 | 0.239 | 0.0935 | 0.6094 | 0.52 |
| 12 | Hi-Jacked | bronze | 1.1 | 7.0 | 2.4 | 0.243 | 0.239 | 0.0935 | 0.6094 | 0.52 |
| 13 | Snow Storm | bronze | 1.1 | 7.0 | 2.4 | 0.243 | 0.239 | 0.0935 | 0.6094 | 0.52 |
| 14 | A Long Road | gold | 0.63 | 4.0 | 1.4 | 0.139 | 0.1369 | 0.048 | 0.39 | 0.34 |
| 15 | Cunning Stunts | silver | 0.63 | 4.0 | 1.4 | 0.139 | 0.1369 | 0.048 | 0.39 | 0.34 |
| 16 | Master of None | bronze | 0.78 | 5.0 | 1.7 | 0.172 | 0.1695 | 0.0623 | 0.4601 | 0.40 |
| 17 | The Shootist | silver | 0.63 | 4.0 | 1.4 | 0.139 | 0.1369 | 0.048 | 0.39 | 0.34 |
| 18 | Top Fun | bronze | 0.63 | 4.0 | 1.4 | 0.139 | 0.1369 | 0.048 | 0.39 | 0.34 |
| 19 | Earn Cash, Not Kudos | bronze | 0.78 | 5.0 | 1.7 | 0.172 | 0.1695 | 0.0623 | 0.4601 | 0.40 |
| 20 | Baited My Tackle | bronze | 2.04 | 13.0 | 4.4 | 0.450 | 0.4432 | 0.1871 | 1.0463 | 0.86 |
| 21 | Stick Fiddler | bronze | 0.94 | 6.0 | 2.0 | 0.208 | 0.2042 | 0.0778 | 0.5348 | 0.46 |
| 22 | Road to Rehabilitation | bronze | 0.78 | 5.0 | 1.7 | 0.172 | 0.1695 | 0.0623 | 0.4601 | 0.40 |
| 23 | This Was No Boat Accident | bronze | 0.78 | 5.0 | 1.7 | 0.172 | 0.1695 | 0.0623 | 0.4601 | 0.40 |
| 24 | The Lone Rider | bronze | 0.78 | 5.0 | 1.7 | 0.172 | 0.1695 | 0.0623 | 0.4601 | 0.40 |
| 25 | Strangers & Freaks | silver | 0.63 | 4.0 | 1.4 | 0.139 | 0.1369 | 0.048 | 0.39 | 0.34 |
| 26 | Supply & Demand | bronze | 0.63 | 4.0 | 1.4 | 0.139 | 0.1369 | 0.048 | 0.39 | 0.34 |
| 27 | Spin On This! | bronze | 0.78 | 5.0 | 1.7 | 0.172 | 0.1695 | 0.0623 | 0.4601 | 0.40 |
| 28 | Positive Mental Attitude | bronze | 0.63 | 4.0 | 1.4 | 0.139 | 0.1369 | 0.048 | 0.39 | 0.34 |
| 29 | Fair Game | bronze | 0.78 | 5.0 | 1.7 | 0.172 | 0.1695 | 0.0623 | 0.4601 | 0.40 |
| 30 | Don't Touch My Deck | silver | 0.63 | 4.0 | 1.4 | 0.139 | 0.1369 | 0.048 | 0.39 | 0.34 |
| 31 | You WAiNKer! | silver | 0.63 | 4.0 | 1.4 | 0.139 | 0.1369 | 0.048 | 0.39 | 0.34 |
| 32 | One Last Thing | bronze | 0.63 | 4.0 | 1.4 | 0.139 | 0.1369 | 0.048 | 0.39 | 0.34 |
| 33 | Hot Together | bronze | 0.94 | 6.0 | 2.0 | 0.208 | 0.2042 | 0.0778 | 0.5348 | 0.46 |
| 34 | Retail Therapy | bronze | 0.78 | 5.0 | 1.7 | 0.172 | 0.1695 | 0.0623 | 0.4601 | 0.40 |
| 35 | Whip It Good | bronze | 1.25 | 8.0 | 2.7 | 0.276 | 0.2716 | 0.1083 | 0.6793 | 0.57 |
| 36 | Gunslinger | bronze | 0.78 | 5.0 | 1.7 | 0.172 | 0.1695 | 0.0623 | 0.4601 | 0.40 |
| 37 | Catch Me If You Can | bronze | 0.94 | 6.0 | 2.0 | 0.208 | 0.2042 | 0.0778 | 0.5348 | 0.46 |
| 38 | Challenging Tank | bronze | 1.57 | 10.0 | 3.4 | 0.347 | 0.3411 | 0.1401 | 0.8281 | 0.69 |
| 39 | Sneakthief | bronze | 0.94 | 6.0 | 2.0 | 0.208 | 0.2042 | 0.0778 | 0.5348 | 0.46 |
| 40 | Maximum Withdrawal | silver | 0.78 | 5.0 | 1.7 | 0.172 | 0.1695 | 0.0623 | 0.4601 | 0.40 |
| 41 | A Classic Blitz Play | bronze | 0.94 | 6.0 | 2.0 | 0.208 | 0.2042 | 0.0778 | 0.5348 | 0.46 |
| 42 | The Goodtime State | bronze | 0.78 | 5.0 | 1.7 | 0.172 | 0.1695 | 0.0623 | 0.4601 | 0.40 |
| 43 | Pest Control | bronze | 0.78 | 5.0 | 1.7 | 0.172 | 0.1695 | 0.0623 | 0.4601 | 0.40 |
| 44 | In The Beginning… | bronze | 0.94 | 6.0 | 2.0 | 0.208 | 0.2042 | 0.0778 | 0.5348 | 0.46 |
| 45 | Capital Offense | bronze | 0.78 | 5.0 | 1.7 | 0.172 | 0.1695 | 0.0623 | 0.4601 | 0.40 |
| 46 | Let’s Go Bowling | bronze | 0.78 | 5.0 | 1.7 | 0.172 | 0.1695 | 0.0623 | 0.4601 | 0.40 |
| 47 | Personal Best | bronze | 0.78 | 5.0 | 1.7 | 0.172 | 0.1695 | 0.0623 | 0.4601 | 0.40 |
| 48 | Actions Speak Louder | bronze | 0.78 | 5.0 | 1.7 | 0.172 | 0.1695 | 0.0623 | 0.4601 | 0.40 |
| 49 | Bad Luck, I Guess | bronze | 0.78 | 5.0 | 1.7 | 0.172 | 0.1695 | 0.0623 | 0.4601 | 0.40 |
| 50 | The Truth Is Out There | bronze | 0.78 | 5.0 | 1.7 | 0.172 | 0.1695 | 0.0623 | 0.4601 | 0.40 |
| 51 | Ten Pin | bronze | 0.78 | 5.0 | 1.7 | 0.172 | 0.1695 | 0.0623 | 0.4601 | 0.40 |
| 52 | Dime on the Dollar | bronze | 0.78 | 5.0 | 1.7 | 0.172 | 0.1695 | 0.0623 | 0.4601 | 0.40 |
| 53 | Treat Yo Self | bronze | 0.94 | 6.0 | 2.0 | 0.208 | 0.2042 | 0.0778 | 0.5348 | 0.46 |
| 54 | Little Boxes | bronze | 0.78 | 5.0 | 1.7 | 0.172 | 0.1695 | 0.0623 | 0.4601 | 0.40 |
| 55 | On the Spot | bronze | 0.78 | 5.0 | 1.7 | 0.172 | 0.1695 | 0.0623 | 0.4601 | 0.40 |
