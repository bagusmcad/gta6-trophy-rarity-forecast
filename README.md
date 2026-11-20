[![gta6-trophy-rarity-forecast-01](https://make.fun/badge/gta6-trophy-rarity-forecast-01.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01)
[![rank](https://make.fun/badge/gta6-trophy-rarity-forecast-01/bagusmcad/gta6-trophy-rarity-forecast/rank.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01)
[![reward](https://make.fun/badge/gta6-trophy-rarity-forecast-01/bagusmcad/gta6-trophy-rarity-forecast/reward.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01)

# Refresh-Aware Launch-Curve Forecaster — GTA VI Trophy Rarity

**Competition:** `gta6-trophy-rarity-forecast-01` — forecast, for every one of the 55
GTA VI PlayStation 5 trophies, the percent of Exophase-tracked players who will
have earned it at 2026-11-26T00:00:00Z, as five quantiles per trophy, scored by
pinball loss on the logit scale. Prize $250, 20 places. Deadline 2026-11-21T11:30:00Z.

**Entry:** `main.ts` (Node 22, standard library only). It reads every `*.in` case in
the input directory and writes one `/output/<id>.out` per case:
`{"trophies": [{"id": n, "q": [q05, q25, q50, q75, q95]}, ...]}`.

**Headline backtest (practice, reconstructed answers — see below): model pinball
loss 0.12 vs house baseline 1.40, typical miss 0.003 pp vs 0.677 pp.**

## How to run

```sh
mkdir -p out
MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

Reads `$MAKEFUN_INPUT_DIR` (else `/input`), writes `$MAKEFUN_OUTPUT_DIR` (else
`/output`). Two runs on the same input write byte-identical output (verified).
Runtime ~0.1 s per practice case, ~0.4 s for a 97-read synthetic final-style
case — far under the 8 s cap. Output files are ~2.8 KB, far under the 64 KB cap.

## The model

A trophy's earn rate is a ratio, `holders / players-tracked`, and the two sides
move for different reasons, so they are forecast separately:

```
rate_target(i) = holders_target(i) / players_target
```

**Players (`players_target`).** Exophase's tracked count does not grow smoothly:
the page is cached and refreshed in jumps — launch night showed exactly 638
players and identical rates for 4.5 hours, then one refresh to 3,868 players.
When the history shows players moving, the model fits a least-squares line of
`ln(players)` on time over the last 24 h of reads, extrapolates it to the
target, and caps the multiplier at 40x. When the history is flat (no two reads
show a different count), it assumes the overdue refresh lands before the
target: one jump of the size the practice refresh showed, 3,868 / 638 = 6.06x.

**Holders (`holders_target`).** Two sources. (a) The cohort already tracked
keeps playing: per trophy, `ln(holders)` is fitted against `ln(1 + hours since
release)` and read at the target — a launch curve, fast early then flattening;
a flat history gives slope 0. Holders of the existing cohort are capped at the
cohort's player count. (b) Newly tracked players earn trophy `i` with
probability `e(i) = kappa * r_prog + (1 - kappa) * r_prog^20`, where `r_prog`
is the existing cohort's rate at the target and
`kappa = 1 - exp(-exposure / 72 h)`, exposure being the hours from the last
players change to the target. The `r^20` term is the instant-earn term: it is
~0 for rare trophies and 1 for the 100% "start the game" trophy, which every
new player earns too. The 72 h time constant is pinned by the practice
refresh: of the 3,230 newly tracked players, only 103 new trophies outside the
100% one were earned — new players earned a typical trophy at ~6–7% of the
old cohort's rate after ~4.7 h of exposure, and `1 - exp(-4.7/72) = 0.063`.

**Spread.** The logit spread around the median combines a 0.35 base, a
`0.30 * sqrt(days)` random-walk term, a binomial term `1 / sqrt(holders at
target)` capped at 0.6 (the answering read is itself a noisy count, worst for
the rarest trophies), and, only on the flat-history path, 0.30 for refresh
timing. Full derivation, constants and the per-trophy table are in
[`CALIBRATION.md`](CALIBRATION.md).

## Practice backtest

The kit ships no practice answers, so the answers were reconstructed from the
aggregates the competition itself publishes (see `CALIBRATION.md` for the
arithmetic): pre-refresh 638 players / 943 trophies earned, post-refresh 3,868
players / 4,276 earned, every rate but the 100% one fell. The 103 new holders
outside the 100% trophy were allocated two ways — proportional to each
trophy's old holder count, and uniformly — and the model was scored against
both. Baseline = the kit's starter (house persistence baseline).

| Case | Answers | Model loss | Baseline loss | Model miss | Baseline miss | Model cov90 | Baseline cov90 |
|------|---------|-----------:|--------------:|-----------:|--------------:|------------:|---------------:|
| p00 | proportional | 0.1222 | 1.4010 | 0.003 pp | 0.677 pp | 1.000 | 0.018 |
| p01 | proportional | 0.1203 | 1.4010 | 0.002 pp | 0.677 pp | 1.000 | 0.018 |
| p00 | uniform | 0.1302 | 1.3870 | 0.011 pp | 0.677 pp | 1.000 | 0.018 |
| p01 | uniform | 0.1285 | 1.3870 | 0.011 pp | 0.677 pp | 1.000 | 0.018 |

The model beats the baseline by ~1.28 of loss on every combination. The median
trophy is forecast at 0.17% (from a last-read median of 0.78%): the refresh
dilutes every rate to roughly a fifth, and the model expects that instead of
trusting the flat history. The widest interval is trophy #20 "Baited My
Tackle" (q05–q95 = 0.86 pp); the narrowest is #2 "Just Like Paradise" at
100% (0.02 pp). Mean interval width is 0.43 pp.

## Per-trophy uncertainty panel (practice case p00)

Median, q05 and q95 for a spread of trophies; the full 55-row panel is in
[`CALIBRATION.md`](CALIBRATION.md).

| Trophy | Last % | Median % | q05 | q95 | Width |
|---|---:|---:|---:|---:|---:|
| #1 Vice Got a Price! (platinum) | 0.63 | 0.1369 | 0.0480 | 0.3900 | 0.34 pp |
| #2 Just Like Paradise (100%) | 100.00 | 99.9900 | 99.9784 | 99.9954 | 0.02 pp |
| #3 Paradise Lost | 1.25 | 0.2716 | 0.1083 | 0.6793 | 0.57 pp |
| #20 Baited My Tackle (widest) | 2.04 | 0.4432 | 0.1871 | 1.0463 | 0.86 pp |
| #38 Challenging Tank | 1.57 | 0.3411 | 0.1401 | 0.8281 | 0.69 pp |
| median trophy | 0.78 | 0.1695 | 0.0623 | 0.4601 | 0.40 pp |

## Validation and limitations

- **Validated on:** the two practice cases above (loss ~0.12 vs baseline
  ~1.40 under both reconstructions), determinism (two runs byte-identical,
  sha256 `0ebf1ed6…` for p00 and `aa2c8ba8…` for p01), output shape (55 rows,
  five non-decreasing quantiles each, all finite, in [0, 100], ~2.8 KB), and
  a synthetic final-style case (97 reads over 2 days, players growing
  638 → 68,048 with refresh steps, holders on launch curves) on which the
  trend path extrapolates players x3.59 and produces valid output in 0.4 s.
- **The practice answers are reconstructed, not published.** The kit ships no
  reference answers, so the backtest above scores against answers rebuilt
  from published aggregates. The median is nearly exact against that
  reconstruction *by construction* (both use the same dilution arithmetic),
  so the 0.12 loss flatters the model: it mostly validates the dilution
  mechanism and the 100%-trophy handling, not the exact per-trophy medians.
  The honest reading is "the model captures the refresh; the baseline does
  not", not "the model is 12x better than baseline on the true answers". The
  baseline scores 1.40 on the reconstruction while the house publishes ~1.51
  on the true answers — the same reconstruction gap, in the other direction.
- **Coverage 1.000 is too high, on purpose.** An honest 90% interval should
  cover ~0.90 of trophies; the model covers 1.000 on the reconstruction. The
  grid search over spread parameters found its minimum at the narrowest
  spread tried (loss 0.083), but that minimum trusts the reconstruction
  exactly, so the shipped spread is deliberately wider (loss 0.122): it costs
  ~0.04 on the reconstruction and buys robustness if the true per-trophy
  allocation differs from either reconstruction. If the true answers are
  close to the reconstruction, the shipped spread is wider than optimal.
- **Practice is not the final.** The practice horizon is 90 minutes; the
  final's is 6,510 minutes (4.5 days), 72x longer. The practice says nothing
  about how players and holders move over days: the final's history (two days
  of 10-minute reads) is what the trend path fits, and the flat-history
  refresh rule — the part that wins the practice — never fires on the final.
  A launch-weekend surge, a second refresh cadence, or a trophy that suddenly
  becomes farmable would all be missed the same way any history-only model
  would miss them.
- **One refresh calibrates everything fragile.** The jump size (6.06x), the
  new-cohort earn ratio (~0.067) and the 72 h time constant all come from a
  single refresh event. If Exophase's later refreshes are smaller, or the
  tracked base saturates, the final's dilution will be overstated. The 40x
  players cap and the holders cap bound the damage but do not remove it.
- **Weakest trophies.** The rarest trophies (platinum, 4 holders) carry the
  largest binomial noise: their answering-read rate is a count of ~5 players
  out of ~3,868, so a one-player difference moves the rate by ~0.03 pp and
  the logit by ~0.2. The 100% trophy is handled by the instant-earn term,
  but if some new players in the final have *not* earned it (e.g. they synced
  a profile without launching), the near-100% median will miss badly on that
  one trophy (~0.2 of loss by itself).
- **What the model cannot see.** It uses only the case file: no trophy
  descriptions or difficulty (beyond the holder counts), no tier effects, no
  playtime data, no Exophase refresh schedule. Tiers are ignored entirely —
  a gold story trophy and a bronze collectible with the same holder count get
  the same forecast, which is wrong in detail even if right on average.
- **No result is guaranteed.** A good practice score does not promise a prize;
  the final is scored on rates nobody has seen yet.

## Files

- `main.ts` — the forecaster (348 lines, Node 22 stdlib only).
- `README.md` — this file.
- `CALIBRATION.md` — how the constants were derived, the reconstructed
  practice answers, and the full 55-trophy uncertainty panel.
- `LICENSE` — MIT.
