/*
 * What radio an antenna is for: the networks' presets, and what their settings mean.
 *
 * Bandwidth, spreading factor and coding rate don't change an antenna. A LoRa signal is far narrower than
 * a Yagi's bandwidth, so all the antenna sees is the frequency. They do decide how far and how fast
 * the link goes, and so what this antenna's gain is worth.
 *
 * Sources, as of 2026-11-02. The networks change these, so they are worth checking now and then:
 *  - MeshCore: the official app's list, "suggested_radio_settings" at https://api.meshcore.nz/api/v1/config
 *  - Meshtastic: its firmware, src/mesh/RadioInterface.cpp (regions, the channel formula) and
 *    src/mesh/MeshRadio.h (modem presets)
 *  - Philly Mesh: https://phillymesh.net
 *  - The math: Semtech AN1200.13 (time on air) and the SX1262 datasheet (sensitivity)
 *
 * No DOM: this file runs in a page and in Node.
 */
(function (root) {
  "use strict";
  const YS = root.YS || (root.YS = {});

  const RX_NOISE_FIGURE = 6;      // dB, of a typical SX126x receiver
  const THERMAL_NOISE = -174;     // dBm per Hz
  const SNR_LIMIT = { 5: -2.5, 6: -5, 7: -7.5, 8: -10, 9: -12.5, 10: -15, 11: -17.5, 12: -20 };   // dB, by spreading factor
  const LOW_RATE_SYMBOL_MS = 16;  // symbols at least this long switch on low data rate optimisation
  const PREAMBLE = 16;            // symbols: what both networks send
  const MESSAGE_BYTES = 60;       // a short text message, as sent over the air, for the airtime figure
  const WHIP_DBI = 2.15;          // a stock whip, about a dipole, to compare against

  /* The rules worth flagging. Rough guides, not legal advice: the cards say to check local rules. */
  const RULES = {
    fcc: { name: "USA, FCC Part 15.247", eirp: 36, wideOnly: true },
    ised: { name: "Canada, RSS-247", eirp: 36, wideOnly: true },
    eu868: { name: "EU and UK, 869.4 to 869.65 MHz", erp: 27, duty: 10 },
    eu433: { name: "EU and UK, 433 MHz", erp: 10, duty: 10 },
    anz: { name: "Australia and New Zealand, 915 to 928 MHz", eirp: 30 },
  };

  /* MeshCore's own list, in the app's order. path: its path hash size, in bytes, where the list gives one. */
  const MESHCORE = [
    { title: "Australia", f: 915.8, bw: 250, sf: 10, cr: 5, rule: "anz" },
    { title: "Australia (Narrow)", f: 916.575, bw: 62.5, sf: 7, cr: 7, rule: "anz" },
    { title: "Australia (Mid)", f: 915.075, bw: 125, sf: 9, cr: 5, rule: "anz" },
    { title: "Australia: SA, WA", f: 923.125, bw: 62.5, sf: 8, cr: 8, rule: "anz" },
    { title: "Australia: QLD", f: 923.125, bw: 62.5, sf: 8, cr: 5, rule: "anz" },
    { title: "Brazil", f: 923.125, bw: 62.5, sf: 8, cr: 8 },
    { title: "Canada", f: 910.525, bw: 62.5, sf: 7, cr: 5, path: 3, rule: "ised" },
    { title: "Costa Rica", f: 910.525, bw: 125, sf: 11, cr: 5 },
    { title: "EU/UK (Narrow)", f: 869.618, bw: 62.5, sf: 8, cr: 8, rule: "eu868" },
    { title: "EU/UK (Deprecated)", f: 869.525, bw: 250, sf: 11, cr: 5, rule: "eu868" },
    { title: "Czech Republic (Narrow)", f: 869.432, bw: 62.5, sf: 7, cr: 5, path: 2, rule: "eu868" },
    { title: "EU 433MHz (Long Range)", f: 433.65, bw: 250, sf: 11, cr: 5, rule: "eu433" },
    { title: "EU 433MHz (Narrow)", f: 433.65, bw: 62.5, sf: 8, cr: 8, rule: "eu433" },
    { title: "Hungary", f: 869.618, bw: 62.5, sf: 7, cr: 5, path: 2, rule: "eu868" },
    { title: "Netherlands", f: 869.618, bw: 62.5, sf: 7, cr: 5, rule: "eu868" },
    { title: "Netherlands (Limburg)", f: 869.618, bw: 62.5, sf: 8, cr: 8, path: 2, rule: "eu868" },
    { title: "New Zealand (Narrow)", f: 917.375, bw: 62.5, sf: 7, cr: 5, path: 2, rule: "anz" },
    { title: "New Zealand (Gisborne)", f: 917.375, bw: 250, sf: 11, cr: 5, path: 1, rule: "anz" },
    { title: "Portugal 433", f: 433.375, bw: 62.5, sf: 9, cr: 6, rule: "eu433" },
    { title: "Portugal 868", f: 869.618, bw: 62.5, sf: 7, cr: 6, rule: "eu868" },
    { title: "Slovakia", f: 869.618, bw: 62.5, sf: 7, cr: 5, path: 2, rule: "eu868" },
    { title: "Switzerland", f: 869.618, bw: 62.5, sf: 8, cr: 8, rule: "eu868" },
    { title: "Thailand", f: 921, bw: 62.5, sf: 7, cr: 5 },
    { title: "USA", f: 910.525, bw: 62.5, sf: 7, cr: 5, rule: "fcc" },
    { title: "USA - Southern California", f: 927.875, bw: 62.5, sf: 7, cr: 5, path: 3, rule: "fcc" },
    { title: "Vietnam (Narrow)", f: 920.25, bw: 62.5, sf: 8, cr: 5 },
    { title: "Vietnam (Deprecated)", f: 920.25, bw: 250, sf: 11, cr: 5 },
  ];

  /* Local networks that publish their own settings. Add more here as they appear. */
  const COMMUNITY = [
    { use: "meshcore", title: "Philly Mesh", where: "Greater Philadelphia", f: 919.5, bw: 500, sf: 10, cr: 5, path: 2, rule: "fcc" },
    { use: "meshtastic", title: "Philly Mesh", where: "Greater Philadelphia", region: "US", modem: "LONG_TURBO" },
  ];

  /* Meshtastic's regions: span (MHz), duty cycle (%), the firmware's power limit (dBm). */
  const REGIONS = [
    { code: "US", name: "United States", lo: 902, hi: 928, duty: 100, power: 30, rule: "fcc" },
    { code: "EU_868", name: "EU 868 MHz", lo: 869.4, hi: 869.65, duty: 10, power: 27, rule: "eu868" },
    { code: "EU_433", name: "EU 433 MHz", lo: 433, hi: 434, duty: 10, power: 10, rule: "eu433" },
    { code: "ANZ", name: "Australia and New Zealand", lo: 915, hi: 928, duty: 100, power: 30, rule: "anz" },
    { code: "ANZ_433", name: "Australia and New Zealand 433 MHz", lo: 433.05, hi: 434.79, duty: 100, power: 14 },
    { code: "BR_902", name: "Brazil", lo: 902, hi: 907.5, duty: 100, power: 30 },
    { code: "CN", name: "China", lo: 470, hi: 510, duty: 100, power: 19 },
    { code: "IN", name: "India", lo: 865, hi: 867, duty: 100, power: 30 },
    { code: "JP", name: "Japan", lo: 920.5, hi: 923.5, duty: 100, power: 13 },
    { code: "KZ_433", name: "Kazakhstan 433 MHz", lo: 433.075, hi: 434.775, duty: 100, power: 10 },
    { code: "KZ_863", name: "Kazakhstan 863 MHz", lo: 863, hi: 868, duty: 100, power: 30 },
    { code: "KR", name: "Korea", lo: 920, hi: 923, duty: 100, power: 23 },
    { code: "MY_433", name: "Malaysia 433 MHz", lo: 433, hi: 435, duty: 100, power: 20 },
    { code: "MY_919", name: "Malaysia 919 MHz", lo: 919, hi: 924, duty: 100, power: 27 },
    { code: "NP_865", name: "Nepal", lo: 865, hi: 868, duty: 100, power: 30 },
    { code: "NZ_865", name: "New Zealand 865 MHz", lo: 864, hi: 868, duty: 100, power: 36 },
    { code: "PH_433", name: "Philippines 433 MHz", lo: 433, hi: 434.7, duty: 100, power: 10 },
    { code: "PH_868", name: "Philippines 868 MHz", lo: 868, hi: 869.4, duty: 100, power: 14 },
    { code: "PH_915", name: "Philippines 915 MHz", lo: 915, hi: 918, duty: 100, power: 24 },
    { code: "RU", name: "Russia", lo: 868.7, hi: 869.2, duty: 100, power: 20 },
    { code: "SG_923", name: "Singapore", lo: 917, hi: 925, duty: 100, power: 20 },
    { code: "TW", name: "Taiwan", lo: 920, hi: 925, duty: 100, power: 27 },
    { code: "TH", name: "Thailand", lo: 920, hi: 925, duty: 10, power: 27 },
    { code: "UA_433", name: "Ukraine 433 MHz", lo: 433, hi: 434.7, duty: 10, power: 10 },
    { code: "UA_868", name: "Ukraine 868 MHz", lo: 868, hi: 868.6, duty: 1, power: 14 },
    { code: "LORA_24", name: "2.4 GHz band", lo: 2400, hi: 2483.5, duty: 100, power: 10, wide: true },
  ];

  /* Meshtastic's modem presets. name is also the channel name that sets the default frequency. */
  const MODEMS = [
    { id: "LONG_TURBO", name: "LongTurbo", bw: 500, wide: 1625, sf: 11, cr: 8 },
    { id: "LONG_FAST", name: "LongFast", bw: 250, wide: 812.5, sf: 11, cr: 5 },
    { id: "LONG_MODERATE", name: "LongMod", bw: 125, wide: 406.25, sf: 11, cr: 8 },
    { id: "LONG_SLOW", name: "LongSlow", bw: 125, wide: 406.25, sf: 12, cr: 8 },
    { id: "MEDIUM_FAST", name: "MediumFast", bw: 250, wide: 812.5, sf: 9, cr: 5 },
    { id: "MEDIUM_SLOW", name: "MediumSlow", bw: 250, wide: 812.5, sf: 10, cr: 5 },
    { id: "SHORT_TURBO", name: "ShortTurbo", bw: 500, wide: 1625, sf: 7, cr: 5 },
    { id: "SHORT_FAST", name: "ShortFast", bw: 250, wide: 812.5, sf: 7, cr: 5 },
    { id: "SHORT_SLOW", name: "ShortSlow", bw: 250, wide: 812.5, sf: 8, cr: 5 },
  ];

  /** The firmware's hash of a channel name (djb2), which picks the default frequency slot. */
  function channelHash(name) {
    let h = 5381;
    const bytes = unescape(encodeURIComponent(name));
    for (let i = 0; i < bytes.length; i++) h = (Math.imul(h, 33) + bytes.charCodeAt(i)) >>> 0;
    return h;
  }

  /**
   * What a Meshtastic node ends up on, as the firmware works it out. slot: 0 or nothing for the default,
   * as in its settings, or 1 and up. channel: a primary channel's name, if it isn't the preset's own.
   * The small allowance in the count is for rounding: EU_868's span is exactly one 250 kHz channel.
   */
  function meshtastic(regionCode, modemId, slot, channel) {
    const region = REGIONS.find((r) => r.code === regionCode), modem = MODEMS.find((m) => m.id === modemId);
    if (!region || !modem) return null;
    const bw = region.wide ? modem.wide : modem.bw, width = bw / 1000, span = region.hi - region.lo;
    const out = { use: "meshtastic", region: region.code, regionName: region.name, modem: modem.id, title: `${modem.name}, ${region.name}`,
      name: modem.name, bw, sf: modem.sf, cr: modem.cr, duty: region.duty, powerLimit: region.power, rule: region.rule };
    if (span + 1e-6 < width) return Object.assign(out, { tooWide: true });
    const slots = Math.floor((span + 1e-6) / width);
    const home = channelHash(channel || modem.name) % slots;
    const at = slot ? (slot - 1) % slots : home;
    return Object.assign(out, { f: round3(region.lo + width / 2 + at * width), slot: at + 1, slots, homeSlot: home + 1 });
  }

  function round3(v) { return Math.round(v * 1000) / 1000; }

  /** A MeshCore or community entry as a radio setting. */
  function fromEntry(e) {
    if (e.use === "meshtastic") return Object.assign(meshtastic(e.region, e.modem), { community: e.title, where: e.where, title: e.title });
    return { use: "meshcore", title: e.title, community: e.use ? e.title : undefined, where: e.where, f: e.f, bw: e.bw, sf: e.sf, cr: e.cr, path: e.path, rule: e.rule };
  }

  /** "919.500 MHz / 500 kHz / SF10 / CR 4/5": the settings to type into a node. */
  function describe(r) {
    const parts = [`${r.f.toFixed(3)} MHz`];
    if (r.sf) parts.push(`${r.bw} kHz`, `SF${r.sf}`, `CR 4/${r.cr}`);
    if (r.path) parts.push(`${r.path}-byte path hash`);
    return parts.join(" / ");
  }

  /** What the settings mean for the link. payload in bytes. */
  function linkStats(r, payload) {
    if (!r.sf) return null;
    const bytes = payload === undefined ? MESSAGE_BYTES : payload, hz = r.bw * 1000, symbolMs = Math.pow(2, r.sf) / r.bw;
    const low = symbolMs >= LOW_RATE_SYMBOL_MS ? 1 : 0;
    const bits = 8 * bytes - 4 * r.sf + 28 + 16;       // explicit header, CRC on
    const symbols = 8 + Math.max(Math.ceil(bits / (4 * (r.sf - 2 * low))) * r.cr, 0);
    return {
      symbolMs,
      bitrate: r.sf * hz / Math.pow(2, r.sf) * 4 / r.cr,
      sensitivity: THERMAL_NOISE + 10 * Math.log10(hz) + RX_NOISE_FIGURE + SNR_LIMIT[r.sf],
      airtimeMs: (PREAMBLE + 4.25 + symbols) * symbolMs,
    };
  }

  /**
   * What this antenna does with those settings. tx: the node's power, dBm. gainDbi: the antenna's gain.
   * Returns radiated power, the link's budget to a stock whip, and any rule it's worth flagging.
   */
  function linkBudget(r, tx, gainDbi) {
    const stats = linkStats(r), gainDbd = gainDbi - 2.15, overWhip = gainDbi - WHIP_DBI;
    const out = { eirp: tx + gainDbi, erp: tx + gainDbd, overWhip, rangeTimes: Math.pow(10, overWhip / 20) };
    if (stats) out.budget = tx + gainDbi + WHIP_DBI - stats.sensitivity;
    const rule = RULES[r.rule];
    if (rule) {
      out.rule = rule;
      const limit = rule.eirp !== undefined ? rule.eirp : rule.erp, now = rule.eirp !== undefined ? out.eirp : out.erp;
      out.limit = limit;
      out.over = now - limit;
      out.maxTx = tx - out.over;
      out.narrow = !!rule.wideOnly && r.sf && r.bw < 500;
    }
    return out;
  }

  /**
   * Points a design at a radio setting. Rods stay as they are unless asked to scale them with the
   * wavelength; rod diameters never scale, since nobody's rod stock does.
   */
  function applyRadio(design, r, scaleRods) {
    const old = design.f0, ratio = r.f / old;
    if (scaleRods) design.elements.forEach((e) => { e.x = round3(e.x / ratio); e.L = round3(e.L / ratio); });
    const half = 0.5 * (design.band[1] - design.band[0]) * ratio;
    design.f0 = r.f;
    design.band = [round3(r.f - half), round3(r.f + half)];
    design.radio = r;
    if (design.tune) design.tune.target = null;
    return design;
  }

  Object.assign(YS, { RADIO: { MESHCORE, COMMUNITY, REGIONS, MODEMS, RULES, WHIP_DBI, MESSAGE_BYTES }, channelHash, meshtastic, radioFromEntry: fromEntry,
    describeRadio: describe, linkStats, linkBudget, applyRadio });
})(typeof globalThis !== "undefined" ? globalThis : this);
