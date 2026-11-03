/*
 * Yagi Studio app: what the antenna is for. It asks which network, offers that network's own presets, sets
 * the target from the choice, and shows what the radio settings mean for the link. Data and math: radio.js.
 */
(function (root) {
  "use strict";
  const YS = root.YS, A = YS.app, S = A.S;
  const { $, $$, esc, fmt } = A;
  const R = YS.RADIO;
  const USES = { meshcore: "MeshCore", meshtastic: "Meshtastic", other: "Your own settings" };
  const DEFAULT_TX = 22;          // dBm: what most LoRa nodes send at full power
  const ALREADY_THERE = 1e-4;     // a move in frequency smaller than this share doesn't need new rods
  let cardKey = "";

  /* ---------- the picker ---------- */
  function open() {
    A.modal(`<div id="radio-step"></div>`, (back, close) => {
      back.querySelector(".modal").classList.add("radio-modal");
      stepUse(back, close);
    });
  }

  const host = (back) => back.querySelector("#radio-step");

  function stepUse(back, close) {
    host(back).innerHTML = `
      <h2>What's this antenna for?</h2>
      <p>This sets the frequency it's tuned for. You can change it any time.</p>
      <div class="pick-list">
        <button class="pick" data-use="meshcore"><b>MeshCore</b><small>The list from the MeshCore app, and local networks</small></button>
        <button class="pick" data-use="meshtastic"><b>Meshtastic</b><small>Your region and a modem preset, and local networks</small></button>
        <button class="pick" data-use="other"><b>Something else</b><small>Type a frequency, and LoRa settings if it uses LoRa</small></button>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn" id="radio-later">Not now</button></div>`;
    $("#radio-later", back).onclick = close;
    $$("[data-use]", back).forEach((b) => {
      b.onclick = () => ({ meshcore: stepMeshCore, meshtastic: stepMeshtastic, other: stepOther })[b.dataset.use](back, close);
    });
  }

  const backButton = `<button class="btn" id="radio-back">Back</button>`;

  /** As the MeshCore app writes them, so the two lists are easy to compare. */
  function meshCoreLine(e) {
    return `${e.f.toFixed(e.f % 1 ? 3 : 0)}MHz / SF${e.sf} / BW${e.bw} / CR${e.cr}${e.path ? ` / ${e.path}B` : ""}`;
  }

  function stepMeshCore(back, close) {
    const local = R.COMMUNITY.filter((c) => c.use === "meshcore");
    const row = (e, i, kind) => `<button class="pick" data-kind="${kind}" data-i="${i}" data-find="${esc((e.title + " " + (e.where || "")).toLowerCase())}"><b>${esc(e.title)}</b><small>${e.where ? esc(e.where) + " · " : ""}${meshCoreLine(e)}</small></button>`;
    host(back).innerHTML = `
      <h2>MeshCore</h2>
      <input class="num pick-search" id="radio-search" placeholder="Search" aria-label="Search the presets" autocomplete="off">
      <div class="pick-list scroll">
        <h3>Local networks</h3>
        ${local.map((e, i) => row(e, i, "local")).join("")}
        <h3>In the MeshCore app</h3>
        ${R.MESHCORE.map((e, i) => row(e, i, "app")).join("")}
      </div>
      <p class="note" style="margin-top:8px">The app's list changes now and then, as of November 2026 here. If yours differs, use Something else.</p>
      <div class="row" style="justify-content:flex-end">${backButton}</div>`;
    $("#radio-back", back).onclick = () => stepUse(back, close);
    $("#radio-search", back).oninput = (e) => {
      const q = e.target.value.trim().toLowerCase();
      $$(".pick", back).forEach((b) => { b.hidden = !!q && !b.dataset.find.includes(q); });
    };
    $$("[data-kind]", back).forEach((b) => {
      b.onclick = () => {
        const e = (b.dataset.kind === "local" ? local : R.MESHCORE)[+b.dataset.i];
        stepRods(back, close, YS.radioFromEntry(b.dataset.kind === "local" ? e : Object.assign({}, e)), () => stepMeshCore(back, close));
      };
    });
  }

  let lastRegion = "US", lastSlot = 0;

  function stepMeshtastic(back, close) {
    const local = R.COMMUNITY.filter((c) => c.use === "meshtastic");
    host(back).innerHTML = `
      <h2>Meshtastic</h2>
      <div class="field-grid" style="margin-bottom:8px">
        <div class="field"><label for="radio-region">Region</label><select class="sel" id="radio-region">${R.REGIONS.map((r) => `<option value="${r.code}" ${r.code === lastRegion ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select></div>
        <div class="field"><label for="radio-slot">Frequency slot, 0 is the default</label><input class="num" id="radio-slot" inputmode="numeric" value="${lastSlot}"></div>
      </div>
      <div class="pick-list scroll" id="radio-modems"></div>
      <p class="note" style="margin-top:8px">A node works out its frequency from these, the same way as here. Every node on a network needs the same preset and slot.</p>
      <div class="row" style="justify-content:flex-end">${backButton}</div>`;
    const draw = () => {
      lastRegion = $("#radio-region", back).value;
      lastSlot = Math.max(0, Math.round(+$("#radio-slot", back).value) || 0);
      const line = (r) => `${r.f.toFixed(3)} MHz / ${r.bw} kHz / SF${r.sf} / CR 4/${r.cr} / slot ${r.slot}`;
      const here = local.filter((c) => c.region === lastRegion);
      $("#radio-modems", back).innerHTML = (here.length ? `<h3>Local networks</h3>${here.map((c, i) => {
        const r = YS.radioFromEntry(c);
        return `<button class="pick" data-local="${i}"><b>${esc(c.title)}</b><small>${esc(c.where)} · ${esc(r.name)} · ${line(r)}</small></button>`;
      }).join("")}` : "") + `<h3>Modem presets</h3>` + R.MODEMS.map((m) => {
        const r = YS.meshtastic(lastRegion, m.id, lastSlot);
        return r.tooWide
          ? `<button class="pick" disabled><b>${esc(m.name)}</b><small>${r.bw} kHz is too wide for this region</small></button>`
          : `<button class="pick" data-modem="${m.id}"><b>${esc(m.name)}</b><small>${line(r)}</small></button>`;
      }).join("");
      $$("[data-local]", back).forEach((b) => { b.onclick = () => stepRods(back, close, YS.radioFromEntry(here[+b.dataset.local]), () => stepMeshtastic(back, close)); });
      $$("[data-modem]", back).forEach((b) => { b.onclick = () => stepRods(back, close, YS.meshtastic(lastRegion, b.dataset.modem, lastSlot), () => stepMeshtastic(back, close)); });
    };
    $("#radio-region", back).onchange = draw;
    $("#radio-slot", back).oninput = draw;
    $("#radio-back", back).onclick = () => stepUse(back, close);
    draw();
  }

  function stepOther(back, close) {
    const options = (list, value, label) => list.map((v) => `<option value="${v}" ${v === value ? "selected" : ""}>${label(v)}</option>`).join("");
    host(back).innerHTML = `
      <h2>Your own settings</h2>
      <div class="stack">
        <div class="field"><label for="radio-f">Frequency, MHz</label><input class="num" id="radio-f" inputmode="decimal" value="${S.design.f0}"></div>
        <label class="check"><input type="checkbox" id="radio-lora" checked> It uses LoRa</label>
        <div class="field-grid three" id="radio-lora-fields">
          <div class="field"><label for="radio-bw">Bandwidth</label><select class="sel" id="radio-bw">${options([62.5, 125, 250, 500], 250, (v) => `${v} kHz`)}</select></div>
          <div class="field"><label for="radio-sf">Spreading factor</label><select class="sel" id="radio-sf">${options([7, 8, 9, 10, 11, 12], 11, (v) => `SF${v}`)}</select></div>
          <div class="field"><label for="radio-cr">Coding rate</label><select class="sel" id="radio-cr">${options([5, 6, 7, 8], 5, (v) => `4/${v}`)}</select></div>
        </div>
      </div>
      <p class="note" id="radio-other-err" style="margin-top:6px"></p>
      <div class="row" style="justify-content:flex-end;margin-top:8px">${backButton}<button class="btn primary" id="radio-next">Next</button></div>`;
    $("#radio-lora", back).onchange = (e) => { $("#radio-lora-fields", back).hidden = !e.target.checked; };
    $("#radio-back", back).onclick = () => stepUse(back, close);
    $("#radio-next", back).onclick = () => {
      const f = +$("#radio-f", back).value;
      if (!(f >= 1 && f <= 30000)) { $("#radio-other-err", back).textContent = "Enter a frequency in MHz, such as 146.52 or 910.525."; return; }
      const r = { use: "other", title: "Your own settings", f };
      if ($("#radio-lora", back).checked) Object.assign(r, { bw: +$("#radio-bw", back).value, sf: +$("#radio-sf", back).value, cr: +$("#radio-cr", back).value });
      stepRods(back, close, r, () => stepOther(back, close));
    };
  }

  /** Last step: what happens to the rods. Each option shows what it would give at the new frequency. */
  function stepRods(back, close, radio, goBack) {
    const try_ = (scale) => {
      const d = JSON.parse(JSON.stringify(S.design));
      YS.applyRadio(d, radio, scale);
      return YS.sweep(YS.toSolver(d), [radio.f], { quality: "draft" })[0];
    };
    if (Math.abs(radio.f / S.design.f0 - 1) < ALREADY_THERE) { apply(radio, false); close(); return; }
    const keep = try_(false), scaled = try_(true), ratio = S.design.f0 / radio.f;
    const best = (a, b) => (a.swr <= b.swr ? `<span class="pill good">Closer match</span>` : "");
    host(back).innerHTML = `
      <h2>${esc(radio.title)}</h2>
      <p class="mono-line">${esc(YS.describeRadio(radio))}</p>
      <p>The rods are set for ${fmt(S.design.f0, 3)} MHz. What should happen to them?</p>
      <div class="pick-list">
        <button class="pick" data-scale="0"><b>Keep them as they are</b>${best(keep, scaled)}<small>SWR ${fmt(keep.swr, 2)} at the new frequency, ${fmt(keep.gainDbd, 2)} dBd, F/B ${fmt(keep.fb, 1)} dB. For an antenna you've already built.</small></button>
        <button class="pick" data-scale="1"><b>Scale them to the new frequency</b>${best(scaled, keep)}<small>SWR ${fmt(scaled.swr, 2)}, ${fmt(scaled.gainDbd, 2)} dBd, F/B ${fmt(scaled.fb, 1)} dB. Every length and spacing × ${ratio.toFixed(4)}, for a new build. Rod diameters stay.</small></button>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:10px">${backButton}</div>`;
    $("#radio-back", back).onclick = goBack;
    $$("[data-scale]", back).forEach((b) => { b.onclick = () => { apply(radio, b.dataset.scale === "1"); close(); }; });
  }

  function apply(radio, scale) {
    YS.applyRadio(S.design, radio, scale);
    S.cursor = radio.f;
    S.rangeAuto = true;
    A.commit();
    A.designChanged(true);
    cardKey = "";
    renderCard();
    A.toast(`Set for ${radio.title}, ${fmt(radio.f, 3)} MHz.`);
  }

  /* ---------- the card on the Design view ---------- */
  function renderCard() {
    const box = $("#radio-card");
    if (!box) return;
    const d = S.design, r = d.radio, key = JSON.stringify([r, d.f0]);
    if (key === cardKey && box.childElementCount) { updateLink(); return; }
    cardKey = key;
    if (!r) {
      box.innerHTML = `<div class="radio-head"><span class="note">Pick your network, and the target follows.</span><button class="btn small" id="radio-pick">Choose a network</button></div>`;
    } else {
      const off = Math.abs(r.f - d.f0) > 0.0005;
      const name = r.community && r.name ? `${r.community}, ${r.name}` : r.community || r.title;
      box.innerHTML = `
        <div class="radio-head"><span><b>${esc(USES[r.use])}</b> · ${esc(name)}</span><button class="btn small" id="radio-pick">Change</button></div>
        <div class="mono-line">${esc(YS.describeRadio(r))}${r.slot ? ` / slot ${r.slot} of ${r.slots}` : ""}</div>
        ${off ? `<p class="note"><span class="pill warn">Different target</span> You've set the target to ${fmt(d.f0, 3)} MHz, and this preset uses ${fmt(r.f, 3)} MHz. <button class="linkish" id="radio-back-to">Go back to it</button></p>` : ""}
        <details class="radio-more" id="radio-more"><summary>What this means for your link ${A.help("radio")}</summary>
          <div class="field" style="margin:6px 0"><label for="radio-tx">Your node's power, dBm</label><input class="num" id="radio-tx" inputmode="decimal" style="max-width:110px"></div>
          <div id="radio-link" class="stack"></div>
        </details>`;
      A.bindNum($("#radio-tx"), { get: () => (d.txDbm === undefined ? DEFAULT_TX : d.txDbm), min: -10, max: 40, decimals: 1, set: (v, c) => { S.design.txDbm = v; if (c) A.commit(); updateLink(); } });
      const toPreset = $("#radio-back-to");
      if (toPreset) toPreset.onclick = () => apply(r, false);
    }
    $("#radio-pick").onclick = open;
    // inside a summary: the page's help tip opens, and the section doesn't fold
    box.querySelectorAll("[data-help]").forEach((b) => { b.onclick = (e) => e.preventDefault(); });
    updateLink();
  }

  /** The gain at the target, from the last sweep. */
  function gainNow() {
    if (!S.rows || !S.rows.length) return null;
    return S.rows.reduce((a, b) => (Math.abs(b.f - S.design.f0) < Math.abs(a.f - S.design.f0) ? b : a)).gainDbi;
  }

  function updateLink() {
    const box = $("#radio-link"), d = S.design, r = d.radio;
    if (!box || !r) return;
    const stats = YS.linkStats(r), g = gainNow();
    if (g === null) return;
    const tx = d.txDbm === undefined ? DEFAULT_TX : d.txDbm, b = YS.linkBudget(r, tx, g);
    let html = "";
    if (stats) {
      html += `<div class="kv-row">
        <span>Hears down to<b>${fmt(stats.sensitivity, 1)} dBm</b></span>
        <span>Speed<b>${stats.bitrate >= 1000 ? fmt(stats.bitrate / 1000, 2) + " kbit/s" : fmt(stats.bitrate, 0) + " bit/s"}</b></span>
        <span>${R.MESSAGE_BYTES}-byte message<b>${stats.airtimeMs >= 1000 ? fmt(stats.airtimeMs / 1000, 2) + " s" : fmt(stats.airtimeMs, 0) + " ms"} on air</b></span>
      </div>`;
    }
    html += `<p class="note">This antenna: ${fmt(g, 1)} dBi, so ${fmt(tx, 1)} dBm in radiates ${fmt(b.eirp, 1)} dBm. Against a stock whip that's ${b.overWhip >= 0 ? "+" : ""}${fmt(b.overWhip, 1)} dB, about ${fmt(b.rangeTimes, 1)} times the range in open air.${stats ? ` To another node on a stock whip the link has ${fmt(b.budget, 0)} dB to spend.` : ""}</p>`;
    if (b.rule) {
      const unit = b.rule.eirp !== undefined ? "EIRP" : "ERP";
      html += b.over > 0
        ? `<p class="note"><span class="pill warn">Too much power</span> ${esc(b.rule.name)} allows ${b.limit} dBm ${unit}${b.rule.duty ? ` at ${b.rule.duty}% duty` : ""}. At ${fmt(tx, 1)} dBm this antenna is ${fmt(b.over, 1)} dB over, so set the node to ${fmt(b.maxTx, 1)} dBm or less.</p>`
        : `<p class="note"><span class="pill good">Within the limit</span> ${esc(b.rule.name)} allows ${b.limit} dBm ${unit}${b.rule.duty ? ` at ${b.rule.duty}% duty` : ""}. Up to ${fmt(b.maxTx, 1)} dBm is within it with this antenna.</p>`;
    } else if (r.powerLimit !== undefined) {
      html += `<p class="note">Meshtastic limits this region to ${r.powerLimit} dBm from the radio, without counting the antenna's gain. Local rules may count it.</p>`;
    }
    if (b.narrow) {
      html += `<p class="note"><span class="pill warn">Under 500 kHz</span> FCC Part 15.247 asks at least 500 kHz of bandwidth from systems that don't hop frequencies. Whether that covers these nodes is debated, and the FCC hasn't said. Some networks have moved to 500 kHz because of it.</p>`;
    }
    if (r.duty !== undefined && r.duty < 100 && !(b.rule && b.rule.duty)) html += `<p class="note">This region limits sending to ${r.duty}% of the time.</p>`;
    html += `<p class="note">${r.bw ? `The signal is only ${r.bw} kHz wide, so the antenna sees it as one frequency. ` : ""}These figures are estimates and a rough guide to the rules, not legal advice. Check yours.</p>`;
    box.innerHTML = html;
  }

  /** For the cut list: what to set on the node. */
  function sheetLine() {
    const r = S.design.radio;
    if (!r) return "";
    const how = r.use === "meshtastic" ? `Set the region to ${esc(r.regionName)} and the preset to ${esc(r.name)}, with the frequency slot at ${r.slot === r.homeSlot ? "0 (the default)" : r.slot}.` : "Set these on your node.";
    return `<p><b>Your radio.</b> ${esc(USES[r.use])}, ${esc(r.title)}: ${esc(YS.describeRadio(r))}. ${how}</p>`;
  }

  A.radio = { open, renderCard, update: updateLink, sheetLine };
})(typeof globalThis !== "undefined" ? globalThis : this);
