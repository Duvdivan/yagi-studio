/*
 * The search for a gain, on one thread with no page: node tests/find_gain.js
 *
 * Every row it offers is solved again here, from its rounded lengths and at the finest accuracy,
 * rather than taking the search's word for it. Exits non-zero on a failure.
 */
const path = require("path");
for (const f of ["solver", "crooked", "rf", "radio", "guide", "tasks", "engine"]) require(path.join(__dirname, "..", "src", f + ".js"));
const YS = globalThis.YS;

let failed = 0;
const truth = (name, pass, detail) => {
  if (!pass) failed++;
  console.log(`${pass ? "pass" : "FAIL"}  ${name}${detail !== undefined ? ": " + detail : ""}`);
};

// the same calls as the worker pool, here on this thread
const pool = {
  batchCount: 1,
  run: async (type, payload) => YS.dispatch(type, payload),
  broadcast: async (type, payload) => YS.dispatch(type, payload),
};

const F0 = 910.525, BAND = [903.525, 917.525];
const template = { f0: F0, d: 3, material: "aluminium", gap: 3 };
const goals = { band: BAND, fbMin: 15, swrMax: 1.5, minGap: 16, changeLengths: true, changeSpacing: true, seed: 7 };

/** The worst figures across the band, from a design's own rounded lengths. */
function across(design, quality) {
  const f = [];
  for (let i = 0; i <= 8; i++) f.push(BAND[0] + (BAND[1] - BAND[0]) * i / 8);
  const rows = YS.sweep(YS.toSolver(design), f, { quality });
  return { gain: Math.min(...rows.map((r) => r.gainDbd)), swr: Math.max(...rows.map((r) => r.swr)), fb: Math.min(...rows.map((r) => r.fb)) };
}

(async () => {
  console.log("1. 7 dBd: it should need few rods, and every row should really do it");
  const started = Date.now();
  const low = await YS.findForGain(pool, template, goals, 7, {});
  console.log(`  ${((Date.now() - started) / 1000).toFixed(0)} s`);
  truth("it found something", low.rows.length > 0, low.rows.map((r) => `${r.rods} rods ${r.boom} mm`).join(", "));
  low.rows.forEach((r) => {
    const a = across(r.design, "fine");
    truth(`${r.rods} rods, ${r.boom} mm, holds the gain over the band`, a.gain >= 6.97, `${a.gain.toFixed(2)} dBd, SWR ${a.swr.toFixed(2)}, F/B ${a.fb.toFixed(1)}`);
    truth("  and the limits", a.swr <= 1.53 && a.fb >= 14.7);
    truth("  and the boom is what it says", Math.abs(YS.boomLength(r.design) - r.boom) < 0.5, YS.boomLength(r.design).toFixed(1));
    truth("  and the rod count", r.design.elements.length === r.rods);
  });
  truth("more rods always means a shorter boom", low.rows.every((r, i) => !i || r.boom < low.rows[i - 1].boom));
  // that it's the least it can be, by asking the older Which boom? search directly
  const first = low.rows[0], lam = 299792.458 / F0;
  const fewer = await YS.exploreBooms(pool, template, goals, { rods: [first.rods - 1], booms: [0.15, 0.25, 0.35].map((s) => Math.round(s * (first.rods - 2) * lam)), gens: 90 }, {});
  truth("a rod fewer doesn't reach it", fewer.every((r) => r.gain < 7), fewer.map((r) => r.gain.toFixed(2)).join(", "));
  const shorter = await YS.exploreBooms(pool, template, Object.assign({}, goals, { seed: 11 }), { rods: [first.rods], booms: [Math.round(0.9 * first.boom)], gens: 90 }, {});
  truth("a boom 10% shorter doesn't, from another start", shorter[0].gain < 7, shorter[0].gain.toFixed(2));

  console.log("\n2. Past what it searches: an answer straight away, with no search");
  const t = Date.now(), high = await YS.findForGain(pool, template, goals, 25, {});
  truth("says it's too much", high.tooHigh === 16 && high.rows.length === 0);
  truth("without searching", Date.now() - t < 100, `${Date.now() - t} ms`);

  console.log("\n3. Limits that can't be met: no row, and no false claim");
  const strict = await YS.findForGain(pool, template, Object.assign({}, goals, { swrMax: 1.02 }), 6.5, { cancelled: (() => { let n = 0; return () => ++n > 40; })() });
  truth("offers nothing that breaks the limit", strict.rows.every((r) => r.swr <= 1.03), strict.rows.map((r) => r.swr.toFixed(2)).join(", ") || "no rows");

  console.log("\n4. Stopping keeps what it has");
  let calls = 0;
  const stopped = await YS.findForGain(pool, template, goals, 7, { cancelled: () => ++calls > 3 });
  truth("stops without an error", Array.isArray(stopped.rows));

  console.log("\n5. Making the best of SWR and F/B at a gain, with a limit on the boom and a ceiling on the gain");
  const shortest = low.rows[0];
  const both = await YS.findForGain(pool, template, Object.assign({}, goals, { favor: "both", gainMax: 7.6, boomTop: 300 }), 7, {});
  truth("it found something", both.rows.length > 0, both.rows.map((r) => `${r.rods} rods ${r.boom} mm`).join(", "));
  both.rows.forEach((r) => {
    const a = across(r.design, "fine");
    truth(`${r.rods} rods, ${r.boom.toFixed(0)} mm, holds the gain, its ceiling and the limits`, a.gain >= 6.97 && a.gain <= 7.65 && a.swr <= 1.53 && a.fb >= 14.7, `${a.gain.toFixed(2)} dBd, SWR ${a.swr.toFixed(2)}, F/B ${a.fb.toFixed(1)}`);
    truth("  and the boom limit", YS.boomLength(r.design) <= 300.05, YS.boomLength(r.design).toFixed(1));
  });
  const bestBoth = across(both.rows[both.rows.length - 1].design, "fine"), plain = across(shortest.design, "fine");
  truth("and it beats the shortest boom on both", bestBoth.swr < plain.swr && bestBoth.fb > plain.fb, `SWR ${plain.swr.toFixed(2)} to ${bestBoth.swr.toFixed(2)}, F/B ${plain.fb.toFixed(1)} to ${bestBoth.fb.toFixed(1)}`);

  console.log(failed ? `\n${failed} FAILED` : "\nAll passed");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
