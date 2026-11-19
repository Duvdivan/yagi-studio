/*
 * A sleeve dipole's printed parts (src/dipole.js): the hub at the feed, which holds the rod above, the tube below and the
 * match; and its foot: a cap over the top of a mast, or an insert in the node pod's top hole (pod.js's tubeInsert), with the
 * pod itself, its top hole through and no boom socket. Made with pod.js's kit; parts.js places and meshes them as it does
 * the boom's.
 *
 * A collinear (the owner's choice, 2026-11-18) adds a joint between each two rods: a slim sleeve that holds their ends apart,
 * with a window at the gap where each rod's end goes out to a leg of the stub, and a shelf below whose groove takes the
 * stub's short, so the legs hang beside the rod below in open air.
 *
 * Not printed or built yet (2026-11-18). Frame: z up as it stands, the feed gap's middle at z 0 on the hub, the joint's gap's
 * middle at z 0 on a joint; mm.
 */
(function (root) {
  "use strict";
  const YS = root.YS || (root.YS = {});

  const HUB = { r: 11, above: 22, below: 22, win: [10, 16], rodFit: 0.05, tubeFit: 0.25 };
  // r: its radius; above, below: how far it holds the rod and the tube, from the gap; win: the window at the feed, wide and
  // tall, open to one side, for soldering the coax and the match (the hairpin runs out of it into the open air); the rod's
  // hole over the rod (the slicer's hole compensation as for the boom) and the tube's socket over the tube
  const CAP = { wall: 3, depth: 35, play: 1.0, slits: 4, slit: [2.5, 26], post: 24, socket: 20, coax: 3.2 };
  const PIPES = { pvc125: { name: "1 1/4 in Schedule 40 PVC", od: 42.2, id: 35.05 } };
  const RADOME = { play: 0.6, rim: 3, holes: 4, hole: 2.5, grip: 25, drain: 2.5 };
  // the radome (the owner's choice, 2026-11-18): white Schedule 40 PVC over the antenna, for wind and weather. PIPES: its
  // outside and inside, mm (US nominal: measure yours). RADOME: the room round each spacer in the bore, across; the spacers'
  // rim, tall; holes through each spacer so condensation drains down past it (count, across); the mast cap's socket, deep
  // over the pipe's end; the drain hole at the socket's low edge, across
  // the mast cap: its skirt's wall and depth over the mast's top, the room round the mast, four slits up from the skirt's
  // edge (wide, tall) so a hose clamp squeezes it on and the coax can leave; the post over its 45 degree top, the tube's
  // socket in it, and the coax's hole on down into the cap (and a hollow mast)

  const JOINT = { r: 5.5, hold: 18, win: 2, side: 1.5, shelf: 3, groove: 1.3 };
  // r: the sleeve's radius round the rods; hold: how far it holds the upper rod above the gap (the lower rod it holds over
  // the stub's whole run, and down to the foot of the shelf's slope); win: how far the window at the joint reaches past each
  // rod end, up and down, and side: past each leg's line, across (it stays inside the sleeve, which joins round it); shelf: the shelf under the short, thick, its groove (wide, deep half of it) for the short.
  // The legs touch plastic only where they're soldered and at the short: plastic beside a line slows it, and the stub's
  // length can't afford it. None between the legs, where the line's field is

  /**
   * A collinear's joint (the owner's choice, 2026-11-18: the stub folded down beside the rod below), as it stands: a slim
   * sleeve holding the upper rod from the top and the lower rod from the bottom, a window at the gap where each rod's end goes
   * straight out to its leg, and a shelf under the stub's short with a groove for it. The legs hang in the air beside the
   * sleeve, side by side. Printed upright on its flat bottom; the shelf rests on a 45 degree slope down to the sleeve.
   */
  function joint(K, design, o) {
    const e = design.elements[0], co = e.colin, st = co.stub, R = JOINT.r, rr = e.d / 2, h = st.spacing / 2, X = st.out, w = st.d / 2;
    const pipe = pipeOf(o), lo = -h, hi = h, zend = lo - st.length;
    // the shelf under the short, out past the legs, and the 45 degree slope under it down to the sleeve, whose foot is the
    // sleeve's bottom
    const x1 = X + w + 2, top = zend - w, base = top - JOINT.shelf, yw = h + w + 2, zb = base - (x1 - R + 1);
    // its top: the rain cone, or with a pipe a centring collar, starting above the window's peak
    const wpk = hi + JOINT.win + Math.min(st.spacing + 2 * JOINT.side, 2 * R - 2) / 2;
    const tp = topProfile(R, pipe ? Math.max(wpk + 1, hi + JOINT.hold - (R - rr - 1.5)) : hi + JOINT.hold - (R - rr - 1.5), rr, pipe), zt = tp.top;
    let s = K.revolve([[0, zb], [R, zb]].concat(tp.pts, [[0, zt]]));
    const slope = K.xz([[R - 1, base], [x1, base], [R - 1, base - (x1 - R + 1)]], -yw, yw);
    s = K.fuse([s, K.box(R - 1, x1, -yw, yw, base, top), slope]);
    // the window at the gap: from the axis out past the sleeve, as tall as the gap and win more each way, its roof peaked
    const wt = hi + JOINT.win, wb = lo - JOINT.win, ww = Math.min(st.spacing + 2 * JOINT.side, 2 * R - 2);
    const win = K.yz([[-ww / 2, wb], [ww / 2, wb], [ww / 2, wt], [0, wt + ww / 2], [-ww / 2, wt]], 0, R + 1);
    const cuts = [K.cylZ(0, 0, e.d + HUB.rodFit, hi, zt + 1), K.cylZ(0, 0, e.d + HUB.rodFit, zb - 1, lo), win,
      K.box(X - JOINT.groove / 2, X + JOINT.groove / 2, -yw - 1, yw + 1, top - JOINT.groove / 2, top + 1)];
    if (pipe) cuts.push(...drainHoles(K, R, pipe, tp.pts[0][1] - 1, zt + 1));
    return K.cut(s, cuts);
  }

  /** The pipe a design's parts fit, from the print options, or null. */
  const pipeOf = (o) => (o && o.radome && PIPES[o.radome]) || null;

  /**
   * A body of revolution's top, with a centring collar for the radome's bore if there's a pipe: from radius r at height z0, out
   * at 45 degrees to the bore (so it prints with nothing in mid-air), up its rim, then flat across to the rod's hole. Without a
   * pipe, the 45 degree cone in to the rod that sheds rain. Returns the profile's points from (r, z0) on, and its top.
   */
  function topProfile(r, z0, rr, pipe) {
    if (!pipe) { const cone = r - rr - 1.5; return { pts: [[r, z0], [rr + 1.5, z0 + cone]], top: z0 + cone }; }
    const rb = pipe.id / 2 - RADOME.play / 2, up = z0 + (rb - r);
    return { pts: [[r, z0], [rb, up], [rb, up + RADOME.rim], [rr + 1.5, up + RADOME.rim]], top: up + RADOME.rim };
  }
  /** Holes down through a collar, between r0 and the bore, so water drains past it. */
  function drainHoles(K, r0, pipe, z0, z1, skip) {
    const rb = pipe.id / 2 - RADOME.play / 2, rm = (r0 + rb) / 2 + 1, out = [];
    for (let k = 0; k < RADOME.holes; k++) {
      const a = (360 * k / RADOME.holes + 45) * Math.PI / 180;
      out.push(K.cylZ(rm * Math.cos(a), rm * Math.sin(a), RADOME.hole, z0, z1));
    }
    return out;
  }

  /** The hub, as it stands: the rod's hole from the top down to the gap, the tube's socket from the bottom up to it. */
  function hub(K, design, o) {
    const e = design.elements[0], g = design.gap || 3, sl = e.sleeve, rr = e.d / 2, R = HUB.r, pipe = pipeOf(o);
    const zb = -g / 2 - HUB.below, [w, h] = HUB.win;
    // without a pipe, a 45 degree top that sheds rain onto the rod; with one, a collar above the window that centres it
    const z0 = pipe ? Math.max(g / 2 + HUB.above - (R - rr - 2), h / 2 + w / 2 + 1) : g / 2 + HUB.above - (R - rr - 1.5);
    const t = topProfile(R, z0, rr, pipe);
    let s = K.revolve([[0, zb], [R, zb]].concat(t.pts, [[0, t.top]]));
    const peak = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [0, h / 2 + w / 2], [-w / 2, h / 2]];
    const cuts = [K.cylZ(0, 0, e.d + HUB.rodFit, g / 2, t.top + 1), K.cylZ(0, 0, sl.d + HUB.tubeFit, zb - 1, -g / 2), K.yz(peak, 0, R + 1)];
    if (pipe) cuts.push(...drainHoles(K, R, pipe, z0 - 1, t.top + 1));
    return K.cut(s, cuts);
  }

  /** The mast cap, as it stands: a skirt over the mast's top, a 45 degree top up to the post that holds the tube's lower end. */
  function mastCap(K, design, o) {
    const e = design.elements[0], sl = e.sleeve, d = design.mast && design.mast.d ? design.mast.d : 42, pipe = pipeOf(o);
    const ri = d / 2 + CAP.play / 2, pr = sl.d / 2 + 3.5;
    if (pipe) {
      // with the radome: a socket over the pipe's end, its floor sloping down from the post to the wall at 45 degrees (so it
      // prints upside down with nothing in mid-air, and water runs to the drain at its low edge); the post and the socket's
      // rim end level, both on the bed as it prints
      const rs = pipe.od / 2 + RADOME.play / 2, ro = Math.max(ri, rs) + CAP.wall, zw = 0, zp = Math.max(zw + (rs - pr) + 10, zw + RADOME.grip);
      let s = K.revolve([[0, -CAP.depth], [ro, -CAP.depth], [ro, zp], [rs, zp], [rs, zw], [pr, zw + (rs - pr)], [pr, zp], [0, zp]]);
      const cuts = [K.cylZ(0, 0, 2 * ri, -CAP.depth - 1, Math.min(0, zw - 2)), K.cylZ(0, 0, sl.d + HUB.tubeFit, zp - CAP.socket, zp + 1), K.cylZ(0, 0, CAP.coax, -CAP.depth, zp)];
      // the drain through the wall at the floor's low edge, its point toward the post's end, which is up as it prints
      const dr = RADOME.drain;
      cuts.push(K.yz([[-dr / 2, zw + dr], [dr / 2, zw + dr], [dr / 2, zw], [0, zw - dr / 2], [-dr / 2, zw]], rs - 1, ro + 1));
      const [sw, sh] = CAP.slit;
      for (let k = 0; k < CAP.slits; k++) cuts.push(K.turn(K.box(ri - 1, ro + 1, -sw / 2, sw / 2, -CAP.depth - 1, -CAP.depth + sh), 360 * k / CAP.slits + 45));
      return K.cut(s, cuts);
    }
    const ro = ri + CAP.wall, top = ro - pr, zp = top + CAP.post;
    let s = K.revolve([[0, -CAP.depth], [ro, -CAP.depth], [ro, 0], [pr, top], [pr, zp], [0, zp]]);
    const cuts = [K.cylZ(0, 0, 2 * ri, -CAP.depth - 1, 0), K.cylZ(0, 0, sl.d + HUB.tubeFit, zp - CAP.socket, zp + 1), K.cylZ(0, 0, CAP.coax, -1, zp)];
    const [sw, sh] = CAP.slit;
    for (let k = 0; k < CAP.slits; k++) cuts.push(K.turn(K.box(ri - 1, ro + 1, -sw / 2, sw / 2, -CAP.depth - 1, -CAP.depth + sh), 360 * k / CAP.slits + 45));
    return K.cut(s, cuts);
  }

  /**
   * The parts, each { id, name, solid, turn, print } for parts.js to place: the hub, and the cap or the pod's insert (with the
   * pod's own parts for mount "pod"). o: parts.js's print options; tail: a stand-in for the boom's tail, which the pod
   * doesn't use without its socket.
   */
  function solids(wasm, K, design, o, podOptions) {
    const out = [], sl = design.elements[0].sleeve, coax = (YS.dipole.COAX[sl.coax] || YS.dipole.COAX.rg316).od + 0.7;
    out.push({ id: "sleeve_hub", name: `${design.elements[0].colin ? "Collinear" : "Sleeve dipole"}: hub at the feed`, solid: hub(K, design, o), turn: null,
      print: "Upright, as the file has it: the tube's socket on the bed, the rod's hole up, the window's roof peaked so it needs no support. 5 walls, 40%." });
    const co = design.elements[0].colin;
    if (co) out.push({ id: "colin_joint", name: `Collinear: joint (print ${co.sections.length - 1})`, solid: joint(K, design, o), turn: null,
      print: `Upright, as the file has it: on its flat bottom, the rods' holes vertical so they come out round, the window's roof peaked, the shelf on a 45 degree slope. 5 walls, 40%. Print ${co.sections.length - 1}, one for each joint.` });
    if (design.mount === "pod" && o.mount === "pod") {
      const ins = YS.POD.tubeInsert(K, sl.d, coax);
      out.push({ id: "pod_top_tube", name: "Pod: the sleeve's insert for its top", solid: ins.solid, turn: null,
        print: "Standing on its post's end, as the file has it: the tube's socket on the bed, the thread up. 40%. No supports." });
      const P = YS.POD.build(wasm, Object.assign({}, podOptions, { top: "sma", socket: "none" }), { Ht: 38.3, w: 16, m: 0, zb: () => -19.15 });
      return { out, pod: P };
    }
    if (o.mount !== "none") out.push({ id: "sleeve_mast_cap", name: `${co ? "Collinear" : "Sleeve dipole"}: cap over the mast's top`, solid: mastCap(K, design, o), turn: [180, 0, 0],
      print: "Upside down, as the file has it: standing on its post's end, the tube's socket on the bed, the skirt up. Its top's 45 degree cone carries it out, so it needs no support. 5 walls, 40%." });
    return { out, pod: null };
  }

  /** What to print, buy and do, as text to keep with the files. */
  function notes(design, result) {
    if (design.elements[0].colin) return colinNotes(design, result);
    const e = design.elements[0], sl = e.sleeve, h = YS.dipole.halves(design), g = design.gap || 3;
    const tube = YS.dipole.TUBES[sl.tube] || YS.dipole.TUBES.k14, coax = YS.dipole.COAX[sl.coax] || YS.dipole.COAX.rg316;
    const pin = design.hairpin && design.hairpin.length > 0 ? design.hairpin : null, cap = design.seriesC > 0 ? design.seriesC : 0;
    const st = design.seriesStub && design.seriesStub.length > 0 ? design.seriesStub : null, pod = design.mount === "pod";
    const L = [`${design.name}: printing and building`, "",
      "NOT YET BUILT: a sleeve dipole from Yagi Studio hasn't been printed, built or swept. Its model is checked against a full-surface model of the stepped rod (within about 0.7 ohm), but the choke is taken as perfect and what's under it isn't in the model.", "",
      "PRINTING", "PETG or ASA, 0.2 mm layers. Not carbon fiber filled filament: its fibers conduct.", ""];
    result.parts.forEach((p) => L.push(`${p.file}: ${p.size.map((v) => v.toFixed(1)).join(" x ")} mm. ${p.print}${p.placing ? " " + p.placing : ""}`));
    L.push("", "WHAT TO CUT",
      `  The rod above the feed: ${e.d} mm ${e.material || design.material}, cut ${(h.up - g / 2 + 4).toFixed(1)} mm, to be trimmed on the VNA toward ${(h.up - g / 2).toFixed(1)} mm.`,
      `  The sleeve: ${tube.name}, cut square to ${(h.low - g / 2).toFixed(1)} mm and left so: it's the choke, a quarter wave of the line it makes round the coax's braid inside.`,
      `  The coax: ${coax.name}, up through the tube from its open end to the hub, and on down ${pod ? "into the pod" : "the mast"}.`);
    if (pin) L.push(`  The hairpin: ${pin.d} mm bare copper wire, a U with its legs ${pin.spacing.toFixed(1)} mm apart and ${pin.length.toFixed(1)} mm long.`);
    if (cap) L.push(`  A ${cap} pF C0G (NP0) chip capacitor, 0805 or 0603, 50 V or more.`);
    if (st) L.push(`  The coax stub: ${(st.length + 2).toFixed(1)} mm of ${(YS.CABLES[st.cable] || { name: st.cable }).name}, to be trimmed toward ${st.length.toFixed(1)} mm.`);
    L.push("", "PUTTING IT TOGETHER",
      `  1. Push the tube up into the hub's socket until it stops at the gap, ${g} mm under where the rod will end, and the rod down into its hole from the top until its end shows in the window at the gap's upper edge. A drop of CA on each holds them.`,
      `  2. Thread the coax up through the tube. Solder its braid all round the tube's top edge in the window, quickly, with a heat sink clipped on the tube: the plastic softens at 80 to 100 C.`,
      pin ? `  3. Solder the hairpin's legs across the feed, one to the rod and one to the tube, each ${((pin.spacing - g) / 2).toFixed(1)} mm from the gap so the legs stand ${pin.spacing.toFixed(1)} mm apart, running out of the window sideways into the open air, shorted ${pin.length.toFixed(1)} mm out.` : "  3. No hairpin.",
      cap ? "  4. The capacitor in series: the coax's centre conductor, the capacitor, then the rod." : st ? "  4. The stub in series: the coax's centre conductor to the stub's braid, the stub's centre conductor to the rod. Seal its open end." : "  4. The coax's centre conductor straight to the rod.",
      `  5. ${pod ? "Push the tube's lower end into the insert's socket, the coax on down through it, screw the insert into the pod's top over its 18 x 2.5 mm O-ring, greased, and plug the coax into the board's U.FL through its pigtail." : "Push the tube's lower end into the cap's post, the coax on down through it, put the cap over the mast's top and squeeze its skirt with a hose clamp."} Clip a ferrite choke on the coax below the tube.`,
      "  6. Sweep it on the VNA where it will stand, and trim the rod's tip, or move the hairpin's short, as the Tune tab says. Then fill the window with neutral cure silicone round the joints (the vinegar kind attacks brass), keeping it off the hairpin's open run, and seal the tube's top so rain can't run down inside it" + (pod ? " and into the pod." : "."),
      "", "IF IT GOES ON A ROOF OR A MAST", "Look up first and stay well clear of power lines, including while raising it. Ground the mast and coax as your local rules require, and check any permits. Don't raise it in wind or near storms.",
      "", "These parts come from Yagi Studio. They're a model's answer until you've swept the real antenna with a VNA.");
    return L.join("\n") + "\n";
  }

  /** A collinear's notes: the sleeve dipole's, with the rods in pieces, the stubs and the joints. */
  function colinNotes(design, result) {
    const e = design.elements[0], sl = e.sleeve, co = e.colin, h = YS.dipole.halves(design), g = design.gap || 3, n = co.sections.length, j = co.joint, st = co.stub;
    const tube = YS.dipole.TUBES[sl.tube] || YS.dipole.TUBES.k14, coax = YS.dipole.COAX[sl.coax] || YS.dipole.COAX.rg316;
    const pin = design.hairpin && design.hairpin.length > 0 ? design.hairpin : null, cap = design.seriesC > 0 ? design.seriesC : 0;
    const cs = design.seriesStub && design.seriesStub.length > 0 ? design.seriesStub : null, pod = design.mount === "pod";
    const pcs = co.sections.map((v, i) => v - (i === 0 ? g / 2 : j / 2) - (i === n - 1 ? 0 : j / 2));
    const L = [`${design.name}: printing and building`, "",
      "NOT YET BUILT: a collinear from Yagi Studio hasn't been printed, built or swept. Its model, the rods and the stubs as one wire, agrees with nec2++ within about 1.5 ohm where nec2++ holds (thin wire, or the stub's wire as thick as the rod) and with line theory where it doesn't, but the choke is taken as perfect and what's under it isn't in the model.", "",
      "PRINTING", "PETG or ASA, 0.2 mm layers. Not carbon fiber filled filament: its fibers conduct.", ""];
    result.parts.forEach((p) => L.push(`${p.file}: ${p.size.map((v) => v.toFixed(1)).join(" x ")} mm. ${p.print}${p.placing ? " " + p.placing : ""}`));
    L.push("", "WHAT TO CUT",
      `  The sleeve: ${tube.name}, cut square to ${(h.low - g / 2).toFixed(1)} mm and left so: it's the choke.`,
      ...pcs.map((v, i) => `  Rod ${i + 1} of ${n}${i === 0 ? " (above the feed)" : i === n - 1 ? " (the top)" : ""}: ${e.d} mm ${e.material || design.material}, ${i === n - 1 ? `cut ${(v + 4).toFixed(1)} mm, to be trimmed on the VNA toward ${v.toFixed(1)} mm` : `${v.toFixed(1)} mm, square`}.`),
      `  ${n - 1} stub${n > 2 ? "s" : ""}: ${st.d} mm bare copper wire (use this size: the stub's wire and spacing matter nearly as much as its length), each a U with its legs side by side ${st.spacing.toFixed(1)} mm apart and ${st.out.toFixed(1)} mm out from the rod, running ${st.length.toFixed(1)} mm down beside the rod below to the short (about ${(2 * (st.length + st.out) + 2 * st.spacing + 10).toFixed(0)} mm of wire each, with 5 mm at each end to solder).`,
      `  The coax: ${coax.name}, up through the tube from its open end to the hub, and on down ${pod ? "into the pod" : "the mast"}.`);
    if (pin) L.push(`  The hairpin: ${pin.d} mm bare copper wire, a U with its legs ${pin.spacing.toFixed(1)} mm apart and ${pin.length.toFixed(1)} mm long.`);
    if (cap) L.push(`  A ${cap} pF C0G (NP0) chip capacitor, 0805 or 0603, 50 V or more.`);
    if (cs) L.push(`  The coax stub: ${(cs.length + 2).toFixed(1)} mm of ${(YS.CABLES[cs.cable] || { name: cs.cable }).name}, to be trimmed toward ${cs.length.toFixed(1)} mm.`);
    L.push("", "PUTTING IT TOGETHER",
      `  1. The feed, as a sleeve dipole's: push the tube up into the hub's socket until it stops at the gap, and rod 1 down into its hole from the top until its end shows in the window, ${g} mm above the tube. A drop of CA on each.`,
      `  2. Thread the coax up through the tube. Solder its braid all round the tube's top edge in the window, quickly, with a heat sink clipped on the tube: the plastic softens at 80 to 100 C.`,
      pin ? `  3. The hairpin across the feed, one leg to rod 1 and one to the tube, ${pin.spacing.toFixed(1)} mm apart, out of the window sideways, shorted ${pin.length.toFixed(1)} mm out.` : "  3. No hairpin.",
      cap ? "  4. The capacitor in series: the coax's centre conductor, the capacitor, then rod 1." : cs ? "  4. The stub in series: the coax's centre conductor to the stub's braid, its centre conductor to rod 1. Seal its open end." : "  4. The coax's centre conductor straight to rod 1.",
      `  5. Each joint: slide it down over the rod below until the rod's end shows at the window's lower edge, and push the next rod down into it from the top until its end shows ${j} mm above. CA on each. The joints' windows all face the same way, and away from the hub's.`,
      `  6. Each stub: bend the U, its legs ${st.spacing.toFixed(1)} mm apart, and the end of each leg in at right angles to its rod, ${st.out.toFixed(1)} mm long. Lay the short in the groove of the shelf at the joint's foot, ${st.length.toFixed(1)} mm below the lower rod's end, and solder one leg to the lower rod's end and the other to the upper rod's end in the window, the legs straight, side by side, in the air beside the sleeve. A dab of CA holds the short in its groove.`,
      `  7. ${pod ? "Push the tube's lower end into the insert's socket, the coax on down through it, screw the insert into the pod's top over its 18 x 2.5 mm O-ring, greased, and plug the coax into the board's U.FL through its pigtail." : "Push the tube's lower end into the cap's post, the coax on down through it, put the cap over the mast's top and squeeze its skirt with a hose clamp."} Clip a ferrite choke on the coax below the tube.`,
      "  8. Sweep it on the VNA where it will stand, and trim the top rod's tip, or move the hairpin's short, as the Tune tab says. Then fill the windows with neutral cure silicone round the joints (the vinegar kind attacks brass), keeping it off the stubs' and the hairpin's open runs, and seal the tube's top.",
      pipeOf(result.plan && result.plan.o) ? `  9. The pipe: slide it down over the antenna into the cap's socket (the collars on the hub and the joints centre the rod), glue or screw it there, and close its top with a standard PVC end cap. Keep the drain at the socket's low edge open. Sweep it in the pipe: the plastic lowers its frequency a little, and the model leaves it out.` : `  At ${(e.L / 1000).toFixed(2)} m of 1/8 in rod it bends in the wind: a pipe over it (the 3D print tab's "In a pipe") stiffens and protects it, but it detunes it a little: sweep it with the pipe on.`,
      "", "IF IT GOES ON A ROOF OR A MAST", "Look up first and stay well clear of power lines, including while raising it. Ground the mast and coax as your local rules require, and check any permits. Don't raise it in wind or near storms.",
      "", "These parts come from Yagi Studio. They're a model's answer until you've swept the real antenna with a VNA.");
    return L.join("\n") + "\n";
  }

  YS.SLEEVE = { solids, notes, hub, mastCap, joint, pipeOf, HUB, CAP, JOINT, PIPES, RADOME };
})(typeof globalThis !== "undefined" ? globalThis : this);
