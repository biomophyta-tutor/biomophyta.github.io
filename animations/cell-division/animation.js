(() => {
  const canvas  = document.getElementById('bio-canvas');
  const ctx     = canvas.getContext('2d');
  const elTag   = document.getElementById('stage-tag');
  const elName  = document.getElementById('stage-name');
  const elDesc  = document.getElementById('stage-desc');
  const elProg  = document.getElementById('progress');
  const elBar   = document.getElementById('progress-bar');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');

  let W = 0, H = 0, current = 0;

  // ── Palette ──────────────────────────────────────────────────
  const C = {
    bg:          '#0a0f1e',
    cellFill:    '#0c1728',
    cellStroke:  '#1e3660',
    nucFill:     '#081020',
    nucStroke:   '#2a4880',
    chromatin:   '#3a5880',
    chrA:        '#4fffb0',   // chromosome pair 1
    chrB:        '#60a5fa',   // chromosome pair 2 / homolog
    spindle:     '#fbbf24',
    accent:      '#4fffb0',
    muted:       '#5a7aaa',
    white:       '#e2eaf7',
    divider:     '#1e2d50',
  };

  // ── Resize ───────────────────────────────────────────────────
  function resize() {
    W = canvas.parentElement.clientWidth;
    H = Math.max(270, Math.min(Math.round(W * 0.56), 430));
    canvas.width  = W;
    canvas.height = H;
    render();
  }
  window.addEventListener('resize', resize);

  // ── Low-level helpers ─────────────────────────────────────────

  function clear() {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
  }

  function divider() {
    const mid = W / 2;
    ctx.save();
    ctx.strokeStyle = C.divider;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(mid, 24); ctx.lineTo(mid, H - 12); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = C.chrA;
    ctx.fillText('MITOSIS', W / 4, 18);
    ctx.fillStyle = C.chrB;
    ctx.fillText('MEIOSIS I', 3 * W / 4, 18);
    ctx.restore();
  }

  // Elliptical cell
  function oval(cx, cy, rx, ry, fill, stroke, lw) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw || 2;
    ctx.stroke();
  }

  // Nucleus circle (dashed = dissolving)
  function nucleus(cx, cy, r, dissolving) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = C.nucFill;
    ctx.fill();
    ctx.strokeStyle = C.nucStroke;
    ctx.lineWidth = 1.5;
    if (dissolving) ctx.setLineDash([3, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (!dissolving) {
      ctx.fillStyle = C.nucStroke;
      ctx.beginPath();
      ctx.arc(cx, cy * 1.0, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Loose chromatin (deterministic squiggles)
  function chromatin(cx, cy, r, n) {
    n = n || 12;
    ctx.save();
    ctx.strokeStyle = C.chromatin;
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const a  = (i / n) * Math.PI * 2;
      const d  = r * (0.25 + 0.5 * ((i * 5 + 2) % 9) / 9);
      const x1 = cx + Math.cos(a) * d;
      const y1 = cy + Math.sin(a) * d;
      const x2 = cx + Math.cos(a + 1.0) * d * 0.75;
      const y2 = cy + Math.sin(a + 1.0) * d * 0.75;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(
        cx + Math.cos(a + 0.5) * d * 1.25,
        cy + Math.sin(a + 0.5) * d * 1.25,
        x2, y2
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  // X-shaped chromosome (two sister chromatids)
  function chromosome(cx, cy, sz, color, angle) {
    angle = angle || 0;
    const arm  = sz * 0.42;
    const w    = Math.max(sz * 0.13, 2.5);
    const thick = Math.max(sz * 0.14, 2.5);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.strokeStyle = color;
    ctx.lineWidth = thick;
    ctx.lineCap = 'round';
    // left chromatid
    ctx.beginPath(); ctx.moveTo(-w, -arm); ctx.quadraticCurveTo(-w * 0.25, 0, -w, arm); ctx.stroke();
    // right chromatid
    ctx.beginPath(); ctx.moveTo(w, -arm); ctx.quadraticCurveTo(w * 0.25, 0, w, arm); ctx.stroke();
    // centromere dot
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(0, 0, thick * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Single rod chromatid (used in Leptotene / Anaphase separated chromatids)
  function rod(cx, cy, len, thick, color, angle) {
    angle = angle || 0;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(thick, 2);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -len / 2);
    ctx.quadraticCurveTo(thick * 0.6, 0, 0, len / 2);
    ctx.stroke();
    ctx.restore();
  }

  // Bivalent: two homologous chromosomes side-by-side
  function bivalent(cx, cy, sz, colorA, colorB, tilt) {
    tilt = tilt || 0;
    const offset = sz * 0.22;
    const px = Math.cos(tilt) * offset;
    const py = Math.sin(tilt) * offset;
    chromosome(cx - px, cy - py, sz * 0.82, colorA, tilt);
    chromosome(cx + px, cy + py, sz * 0.82, colorB, tilt);
  }

  // Spindle fibers from two poles to each target centromere
  function spindle(p1x, p1y, p2x, p2y, targets) {
    ctx.save();
    ctx.strokeStyle = C.spindle;
    ctx.lineWidth = 0.9;
    ctx.globalAlpha = 0.45;
    targets.forEach(function(t) {
      ctx.beginPath(); ctx.moveTo(p1x, p1y); ctx.lineTo(t[0], t[1]); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p2x, p2y); ctx.lineTo(t[0], t[1]); ctx.stroke();
    });
    ctx.restore();
  }

  // Centrosome + aster rays
  function centrosome(cx, cy, r) {
    r = r || 5;
    ctx.save();
    ctx.strokeStyle = C.spindle;
    ctx.lineWidth = 0.9;
    ctx.globalAlpha = 0.55;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.lineTo(cx + Math.cos(a) * (r + 9), cy + Math.sin(a) * (r + 9));
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = C.spindle;
    ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Small canvas label
  function lbl(text, x, y, color, size) {
    ctx.save();
    ctx.fillStyle = color || C.muted;
    ctx.font = (size || 10) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // Dashed equatorial plate line
  function plate(cx, cy, rx, color) {
    ctx.save();
    ctx.strokeStyle = color || C.accent;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(cx - rx + 8, cy); ctx.lineTo(cx + rx - 8, cy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Chiasma X mark at position
  function chiasma(cx, cy, s) {
    s = s || 5;
    ctx.save();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.8;
    ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx + s, cy + s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + s, cy - s); ctx.lineTo(cx - s, cy + s); ctx.stroke();
    ctx.restore();
  }

  // ── Step data ─────────────────────────────────────────────────

  const steps = [

    // ── 1. G1 ────────────────────────────────────────────────────
    {
      stage: 'Interphase',
      name:  'G1 — Cell Growth',
      desc:  'The cell grows in size and synthesises the proteins and organelles needed for division. DNA exists as loosely coiled chromatin inside an intact nucleus — individual chromosomes are not yet visible. This phase is identical for cells entering either mitosis or meiosis.',
      draw() {
        clear(); divider();
        [W / 4, 3 * W / 4].forEach(function(cx) {
          const cy = H / 2 + 8;
          const rx = Math.min(W / 5.2, 86), ry = Math.min(H * 0.37, 78);
          oval(cx, cy, rx, ry, C.cellFill, C.cellStroke);
          const nr = ry * 0.42;
          nucleus(cx, cy, nr);
          chromatin(cx, cy, nr * 0.76);
          lbl('G1 phase', cx, cy + ry + 17);
        });
      }
    },

    // ── 2. S Phase ───────────────────────────────────────────────
    {
      stage: 'Interphase',
      name:  'S Phase — DNA Replication',
      desc:  'Each chromosome is duplicated inside the nucleus, producing two identical sister chromatids joined at the centromere. By the end of S phase the cell contains twice its normal DNA content (4N). This replication occurs the same way in cells entering both mitosis and meiosis.',
      draw() {
        clear(); divider();
        [W / 4, 3 * W / 4].forEach(function(cx) {
          const cy = H / 2 + 8;
          const rx = Math.min(W / 5.2, 86), ry = Math.min(H * 0.37, 78);
          oval(cx, cy, rx, ry, C.cellFill, C.cellStroke);
          const nr = ry * 0.42;
          nucleus(cx, cy, nr);
          chromatin(cx, cy, nr * 0.76, 20);
          // Replication fork hint
          ctx.save();
          ctx.strokeStyle = C.accent;
          ctx.lineWidth = 1.5;
          ctx.lineCap = 'round';
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          ctx.moveTo(cx - nr * 0.35, cy - nr * 0.1);
          ctx.lineTo(cx, cy - nr * 0.38);
          ctx.lineTo(cx + nr * 0.35, cy - nr * 0.1);
          ctx.stroke();
          ctx.restore();
          lbl('DNA replicating', cx, cy + ry + 17, C.accent);
        });
      }
    },

    // ── 3. G2 ────────────────────────────────────────────────────
    {
      stage: 'Interphase',
      name:  'G2 — Growth & Preparation',
      desc:  'The cell continues to grow and checks for DNA replication errors. Chromosomes remain as chromatin but are now fully duplicated. Two centrosomes have formed near the nucleus — these will organise the spindle apparatus during division.',
      draw() {
        clear(); divider();
        [W / 4, 3 * W / 4].forEach(function(cx) {
          const cy = H / 2 + 8;
          const rx = Math.min(W / 5.2, 90), ry = Math.min(H * 0.39, 82);
          oval(cx, cy, rx, ry, C.cellFill, C.cellStroke);
          const nr = ry * 0.42;
          nucleus(cx, cy, nr);
          chromatin(cx, cy, nr * 0.76, 22);
          centrosome(cx - rx * 0.52, cy, 4);
          centrosome(cx + rx * 0.52, cy, 4);
          lbl('G2 — centrosomes formed', cx, cy + ry + 17);
        });
      }
    },

    // ── 4. Prophase / Leptotene ──────────────────────────────────
    {
      stage: 'Prophase',
      name:  'Prophase / Leptotene',
      desc:  'Mitosis — Prophase: Chromatin condenses into distinct chromosomes. The mitotic spindle begins forming as centrosomes migrate toward opposite poles. The nuclear envelope starts to break down.\n\nMeiosis I — Leptotene: Chromosomes become visible as thin, thread-like filaments. Homologous chromosomes have not yet paired. The nuclear envelope is still intact.',
      draw() {
        clear(); divider();
        const sz = Math.min(W / 12, 24);
        const cy = H / 2 + 6;
        const rx = Math.min(W / 5.2, 86), ry = Math.min(H * 0.37, 78);

        // Mitosis — condensing chromosomes, dissolving nucleus
        const lx = W / 4;
        oval(lx, cy, rx, ry, C.cellFill, C.cellStroke);
        nucleus(lx, cy, ry * 0.40, true);
        centrosome(lx, cy - ry * 0.88, 5);
        centrosome(lx, cy + ry * 0.88, 5);
        const mPos = [
          [lx - sz * 0.9, cy - sz * 1.3],
          [lx + sz * 0.8, cy - sz * 1.1],
          [lx - sz * 0.7, cy + sz * 1.2],
          [lx + sz * 0.9, cy + sz * 1.0]
        ];
        mPos.forEach(function(p, i) { chromosome(p[0], p[1], sz * 0.78, i < 2 ? C.chrA : C.chrB, i * 0.35); });
        lbl('Condensing chromosomes', lx, cy + ry + 17);

        // Meiosis — Leptotene: thin thread chromosomes, intact nucleus
        const mx = 3 * W / 4;
        oval(mx, cy, rx, ry, C.cellFill, C.cellStroke);
        nucleus(mx, cy, ry * 0.42);
        const threads = [
          [mx - sz * 1.1, cy - sz * 0.6, 0.1],
          [mx + sz * 0.2, cy - sz * 1.5, -0.3],
          [mx - sz * 0.3, cy + sz * 0.7, 0.5],
          [mx + sz * 1.0, cy + sz * 0.5, -0.1]
        ];
        threads.forEach(function(t, i) { rod(t[0], t[1], sz * 1.9, 2.2, i < 2 ? C.chrA : C.chrB, t[2]); });
        lbl('Leptotene — thin threads', mx, cy + ry + 17);
      }
    },

    // ── 5. Prophase / Zygotene ───────────────────────────────────
    {
      stage: 'Prophase',
      name:  'Prophase / Zygotene',
      desc:  'Mitosis — Prophase (continued): Chromosomes continue condensing and the spindle grows as microtubules extend from centrosomes.\n\nMeiosis I — Zygotene: Homologous chromosomes begin pairing side-by-side through synapsis. The synaptonemal complex assembles between them, forming bivalents. Pairing initiates but is not yet complete.',
      draw() {
        clear(); divider();
        const sz = Math.min(W / 12, 24);
        const cy = H / 2 + 6;
        const rx = Math.min(W / 5.2, 86), ry = Math.min(H * 0.37, 78);

        // Mitosis
        const lx = W / 4;
        oval(lx, cy, rx, ry, C.cellFill, C.cellStroke);
        nucleus(lx, cy, ry * 0.36, true);
        centrosome(lx, cy - ry * 0.88, 5);
        centrosome(lx, cy + ry * 0.88, 5);
        const mPos = [
          [lx - sz * 0.9, cy - sz * 1.1],
          [lx + sz * 0.8, cy - sz * 0.9],
          [lx - sz * 0.6, cy + sz * 1.0],
          [lx + sz * 0.8, cy + sz * 1.0]
        ];
        mPos.forEach(function(p, i) { chromosome(p[0], p[1], sz * 0.88, i < 2 ? C.chrA : C.chrB, i * 0.28); });
        ctx.save(); ctx.strokeStyle = C.spindle; ctx.lineWidth = 0.9; ctx.globalAlpha = 0.25;
        [[lx - 18, cy - 5], [lx + 18, cy - 5]].forEach(function(t) {
          ctx.beginPath(); ctx.moveTo(lx, cy - ry * 0.88); ctx.lineTo(t[0], t[1]); ctx.stroke();
        });
        ctx.restore();
        lbl('Spindle forming', lx, cy + ry + 17);

        // Meiosis — Zygotene: partial synapsis
        const mx = 3 * W / 4;
        oval(mx, cy, rx, ry, C.cellFill, C.cellStroke);
        nucleus(mx, cy, ry * 0.42);
        // First pair: aligned (synapsis complete)
        rod(mx - sz * 1.3, cy - sz * 0.4, sz * 1.9, 3, C.chrA, -0.08);
        rod(mx - sz * 0.9, cy - sz * 0.4, sz * 1.9, 3, C.chrB, -0.08);
        ctx.save(); ctx.strokeStyle = C.accent; ctx.lineWidth = 0.9; ctx.globalAlpha = 0.5;
        ctx.setLineDash([3, 3]);
        for (let t = 0; t < 4; t++) {
          const yy = (cy - sz * 1.3) + t * sz * 0.65;
          ctx.beginPath(); ctx.moveTo(mx - sz * 1.3, yy); ctx.lineTo(mx - sz * 0.9, yy); ctx.stroke();
        }
        ctx.restore();
        // Second pair: not yet aligned
        rod(mx + sz * 0.3, cy + sz * 0.5, sz * 1.9, 3, C.chrA, 0.4);
        rod(mx + sz * 1.2, cy + sz * 0.2, sz * 1.9, 3, C.chrB, 0.5);
        lbl('Zygotene — synapsis starts', mx, cy + ry + 17);
      }
    },

    // ── 6. Prophase / Pachytene ──────────────────────────────────
    {
      stage: 'Prophase',
      name:  'Prophase / Pachytene',
      desc:  'Mitosis — Late Prophase: Chromosomes are fully condensed. Spindle fibers begin attaching to kinetochore proteins on each chromosome.\n\nMeiosis I — Pachytene: Synapsis is complete and all bivalents (tetrads) are fully formed. Crossing over occurs — non-sister chromatids of homologous chromosomes exchange DNA segments, generating genetic diversity.',
      draw() {
        clear(); divider();
        const sz = Math.min(W / 12, 24);
        const cy = H / 2 + 6;
        const rx = Math.min(W / 5.2, 86), ry = Math.min(H * 0.37, 78);

        // Mitosis — fully condensed, spindle attaching
        const lx = W / 4;
        oval(lx, cy, rx, ry, C.cellFill, C.cellStroke);
        centrosome(lx, cy - ry * 0.88, 6);
        centrosome(lx, cy + ry * 0.88, 6);
        const mPos = [
          [lx - sz * 0.8, cy - sz * 0.9],
          [lx + sz * 0.8, cy - sz * 0.9],
          [lx - sz * 0.8, cy + sz * 0.9],
          [lx + sz * 0.8, cy + sz * 0.9]
        ];
        mPos.forEach(function(p, i) { chromosome(p[0], p[1], sz, i < 2 ? C.chrA : C.chrB, 0); });
        spindle(lx, cy - ry * 0.88, lx, cy + ry * 0.88, mPos);
        lbl('Late Prophase', lx, cy + ry + 17);

        // Meiosis — Pachytene: full bivalents + crossing over
        const mx = 3 * W / 4;
        oval(mx, cy, rx, ry, C.cellFill, C.cellStroke);
        const bPos = [
          [mx - sz * 0.9, cy - sz * 0.6],
          [mx + sz * 0.9, cy + sz * 0.6]
        ];
        bPos.forEach(function(p) { bivalent(p[0], p[1], sz, C.chrA, C.chrB, 0); });
        chiasma(bPos[0][0], bPos[0][1]);
        chiasma(bPos[1][0], bPos[1][1]);
        lbl('Pachytene — crossing over', mx, cy + ry + 17);
      }
    },

    // ── 7. Prophase / Diplotene ──────────────────────────────────
    {
      stage: 'Prophase',
      name:  'Prophase / Diplotene',
      desc:  'Mitosis — Prometaphase: The nuclear envelope fully dissolves. Spindle fibers reach into the nucleus and attach to kinetochore proteins on each sister chromatid pair.\n\nMeiosis I — Diplotene: The synaptonemal complex disassembles and homologs begin to repel each other, but remain joined at chiasmata — the physical sites where DNA was exchanged during crossing over.',
      draw() {
        clear(); divider();
        const sz = Math.min(W / 12, 24);
        const cy = H / 2 + 6;
        const rx = Math.min(W / 5.2, 86), ry = Math.min(H * 0.37, 78);

        // Mitosis — prometaphase, no nucleus, full spindle
        const lx = W / 4;
        oval(lx, cy, rx, ry, C.cellFill, C.cellStroke);
        centrosome(lx, cy - ry * 0.88, 6);
        centrosome(lx, cy + ry * 0.88, 6);
        const mPos = [
          [lx - sz * 0.7, cy - sz * 0.8],
          [lx + sz * 0.8, cy - sz * 0.8],
          [lx - sz * 0.7, cy + sz * 0.8],
          [lx + sz * 0.8, cy + sz * 0.8]
        ];
        mPos.forEach(function(p, i) { chromosome(p[0], p[1], sz, i < 2 ? C.chrA : C.chrB, 0); });
        spindle(lx, cy - ry * 0.88, lx, cy + ry * 0.88, mPos);
        lbl('Prometaphase', lx, cy + ry + 17);

        // Meiosis — Diplotene: homologs separating, chiasmata visible
        const mx = 3 * W / 4;
        oval(mx, cy, rx, ry, C.cellFill, C.cellStroke);
        const g = sz * 0.5;
        const pairs = [
          { ax: mx - sz - g * 0.5, ay: cy - sz * 0.4, bx: mx - sz + g * 0.5, by: cy - sz * 0.4 },
          { ax: mx + sz * 0.2 - g * 0.5, ay: cy + sz * 0.4, bx: mx + sz * 0.2 + g * 0.5, by: cy + sz * 0.4 }
        ];
        pairs.forEach(function(p) {
          chromosome(p.ax, p.ay, sz * 0.85, C.chrA, 0);
          chromosome(p.bx, p.by, sz * 0.85, C.chrB, 0);
          chiasma((p.ax + p.bx) / 2, (p.ay + p.by) / 2, 4);
          ctx.save(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.globalAlpha = 0.25;
          ctx.setLineDash([2, 3]);
          ctx.beginPath(); ctx.moveTo(p.ax, p.ay); ctx.lineTo(p.bx, p.by); ctx.stroke();
          ctx.setLineDash([]); ctx.restore();
        });
        lbl('Diplotene — chiasmata', mx, cy + ry + 17);
      }
    },

    // ── 8. Prophase / Diakinesis ─────────────────────────────────
    {
      stage: 'Prophase',
      name:  'Prophase / Diakinesis',
      desc:  'Mitosis — Late Prometaphase: Chromosomes are fully captured by spindle fibers and begin moving toward the cell equator (congression).\n\nMeiosis I — Diakinesis: Bivalents reach maximum condensation. Chiasmata move toward chromosome ends (terminalization). The nuclear envelope fully dissolves and the meiotic spindle forms.',
      draw() {
        clear(); divider();
        const sz = Math.min(W / 12, 24);
        const cy = H / 2 + 6;
        const rx = Math.min(W / 5.2, 86), ry = Math.min(H * 0.37, 78);

        // Mitosis — congression: chromosomes moving to equator
        const lx = W / 4;
        oval(lx, cy, rx, ry, C.cellFill, C.cellStroke);
        centrosome(lx, cy - ry * 0.88, 6);
        centrosome(lx, cy + ry * 0.88, 6);
        const mPos = [
          [lx - sz * 0.6, cy - sz * 0.5],
          [lx + sz * 0.6, cy - sz * 0.4],
          [lx - sz * 0.6, cy + sz * 0.5],
          [lx + sz * 0.6, cy + sz * 0.4]
        ];
        mPos.forEach(function(p, i) { chromosome(p[0], p[1], sz, i < 2 ? C.chrA : C.chrB, i * 0.15); });
        spindle(lx, cy - ry * 0.88, lx, cy + ry * 0.88, mPos);
        lbl('Congression', lx, cy + ry + 17);

        // Meiosis — Diakinesis: max condensed, spindle forming
        const mx = 3 * W / 4;
        oval(mx, cy, rx, ry, C.cellFill, C.cellStroke);
        centrosome(mx, cy - ry * 0.88, 5);
        centrosome(mx, cy + ry * 0.88, 5);
        const dk = [
          { ax: mx - sz * 1.1, ay: cy - sz * 0.5, bx: mx - sz * 0.3, by: cy - sz * 0.5 },
          { ax: mx + sz * 0.3, ay: cy + sz * 0.5, bx: mx + sz * 1.1, by: cy + sz * 0.5 }
        ];
        dk.forEach(function(p) {
          chromosome(p.ax, p.ay, sz, C.chrA, 0);
          chromosome(p.bx, p.by, sz, C.chrB, 0);
          chiasma((p.ax + p.bx) / 2, (p.ay + p.by) / 2, 4);
        });
        spindle(mx, cy - ry * 0.88, mx, cy + ry * 0.88,
          dk.map(function(p) { return [(p.ax + p.bx) / 2, (p.ay + p.by) / 2]; }));
        lbl('Diakinesis — max condensed', mx, cy + ry + 17);
      }
    },

    // ── 9. Metaphase ─────────────────────────────────────────────
    {
      stage: 'Metaphase',
      name:  'Metaphase / Metaphase I',
      desc:  'Mitosis — Metaphase: Sister chromatid pairs align at the metaphase plate (cell equator). Spindle fibers from opposite poles attach to each chromatid\'s kinetochore, generating tension that ensures equal segregation.\n\nMeiosis I — Metaphase I: Bivalents (homologous pairs) align at the metaphase plate. Each homolog faces a different pole — this orientation is what will halve the chromosome number in the next step.',
      draw() {
        clear(); divider();
        const sz = Math.min(W / 12, 24);
        const cy = H / 2 + 6;
        const rx = Math.min(W / 5.2, 86), ry = Math.min(H * 0.37, 78);

        // Mitosis — chromosomes at equator
        const lx = W / 4;
        oval(lx, cy, rx, ry, C.cellFill, C.cellStroke);
        centrosome(lx, cy - ry * 0.88, 6);
        centrosome(lx, cy + ry * 0.88, 6);
        plate(lx, cy, rx);
        const mMeta = [
          [lx - sz * 1.4, cy], [lx - sz * 0.4, cy],
          [lx + sz * 0.4, cy], [lx + sz * 1.4, cy]
        ];
        mMeta.forEach(function(p, i) { chromosome(p[0], p[1], sz, i < 2 ? C.chrA : C.chrB, 0); });
        spindle(lx, cy - ry * 0.88, lx, cy + ry * 0.88, mMeta);
        lbl('Metaphase plate', lx, cy + ry + 17, C.accent);

        // Meiosis — bivalents at equator
        const mx = 3 * W / 4;
        oval(mx, cy, rx, ry, C.cellFill, C.cellStroke);
        centrosome(mx, cy - ry * 0.88, 6);
        centrosome(mx, cy + ry * 0.88, 6);
        plate(mx, cy, rx, C.chrB);
        const bMeta = [
          [mx - sz * 0.9, cy], [mx + sz * 0.9, cy]
        ];
        bMeta.forEach(function(p) { bivalent(p[0], p[1], sz, C.chrA, C.chrB, 0); });
        spindle(mx, cy - ry * 0.88, mx, cy + ry * 0.88, bMeta);
        lbl('Bivalents at plate', mx, cy + ry + 17, C.chrB);
      }
    },

    // ── 10. Anaphase ─────────────────────────────────────────────
    {
      stage: 'Anaphase',
      name:  'Anaphase / Anaphase I',
      desc:  'Mitosis — Anaphase: Protein links holding sister chromatids together are cleaved. Spindle fibers shorten, pulling each chromatid (now counted as a chromosome) to an opposite pole. The cell elongates. Each pole receives the full chromosome number (2N).\n\nMeiosis I — Anaphase I: Whole homologous chromosomes (each still with two sister chromatids) are pulled to opposite poles. Sister chromatids are NOT separated here. Each pole will receive half the original chromosome number.',
      draw() {
        clear(); divider();
        const sz = Math.min(W / 13, 22);
        const cy = H / 2 + 6;
        const rx = Math.min(W / 5.2, 84), ry = Math.min(H * 0.40, 84);

        // Mitosis — separated chromatids moving to poles
        const lx = W / 4;
        oval(lx, cy, rx, ry, C.cellFill, C.cellStroke);
        centrosome(lx, cy - ry * 0.9, 6);
        centrosome(lx, cy + ry * 0.9, 6);
        // Top: 4 single rods
        [[lx - sz * 0.7, cy - ry * 0.58], [lx, cy - ry * 0.62],
         [lx + sz * 0.7, cy - ry * 0.58], [lx - sz * 0.35, cy - ry * 0.50]].forEach(function(p, i) {
          rod(p[0], p[1], sz * 1.1, 4.5, i % 2 === 0 ? C.chrA : C.chrB, i * 0.18 - 0.27);
        });
        // Bottom: 4 single rods
        [[lx - sz * 0.7, cy + ry * 0.58], [lx, cy + ry * 0.62],
         [lx + sz * 0.7, cy + ry * 0.58], [lx - sz * 0.35, cy + ry * 0.50]].forEach(function(p, i) {
          rod(p[0], p[1], sz * 1.1, 4.5, i % 2 === 0 ? C.chrB : C.chrA, i * 0.18 - 0.27);
        });
        lbl('Chromatids to poles (2N each)', lx, cy + ry + 17);

        // Meiosis — whole X chromosomes (bivalents split) moving to poles
        const mx = 3 * W / 4;
        oval(mx, cy, rx, ry, C.cellFill, C.cellStroke);
        centrosome(mx, cy - ry * 0.9, 6);
        centrosome(mx, cy + ry * 0.9, 6);
        [[mx - sz * 0.5, cy - ry * 0.58], [mx + sz * 0.5, cy - ry * 0.58]].forEach(function(p) {
          chromosome(p[0], p[1], sz * 0.88, C.chrA, 0);
        });
        [[mx - sz * 0.5, cy + ry * 0.58], [mx + sz * 0.5, cy + ry * 0.58]].forEach(function(p) {
          chromosome(p[0], p[1], sz * 0.88, C.chrB, 0);
        });
        lbl('Homologs to poles (N each)', mx, cy + ry + 17);
      }
    },

    // ── 11. Telophase & Cytokinesis ──────────────────────────────
    {
      stage: 'Telophase & Cytokinesis',
      name:  'Telophase & Cytokinesis / Telophase I',
      desc:  'Mitosis — Telophase & Cytokinesis: Nuclear envelopes reform around each chromosome set. Chromosomes decondense back to chromatin. The spindle disassembles. Cytokinesis divides the cytoplasm, producing two genetically identical diploid (2N) daughter cells.\n\nMeiosis I — Telophase I & Cytokinesis I: Nuclear envelopes reform. The cell divides into two haploid (N) cells, each still holding chromosomes made of two sister chromatids. Meiosis II (not shown) will separate those chromatids to produce four unique haploid gametes.',
      draw() {
        clear(); divider();
        const sz   = Math.min(W / 14, 20);
        const ryd  = Math.min(H * 0.20, 56);
        const rxd  = Math.min(W / 6.5, 72);
        const gap  = ryd + Math.max(H * 0.04, 10);
        const cy   = H / 2;

        // Mitosis — two diploid daughter cells
        const lx = W / 4;
        [cy - gap, cy + gap].forEach(function(dy) {
          oval(lx, dy, rxd, ryd, C.cellFill, C.cellStroke);
          nucleus(lx, dy, ryd * 0.44);
          chromatin(lx, dy, ryd * 0.34, 9);
        });
        ctx.save(); ctx.strokeStyle = C.accent; ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(lx - rxd, cy); ctx.lineTo(lx + rxd, cy); ctx.stroke();
        ctx.setLineDash([]); ctx.restore();
        lbl('2 diploid cells (2N)', lx, cy + gap + ryd + 18, C.accent);

        // Meiosis — two haploid cells (chromosomes still X-shaped)
        const mx = 3 * W / 4;
        [cy - gap, cy + gap].forEach(function(dy, idx) {
          oval(mx, dy, rxd, ryd, C.cellFill, C.cellStroke);
          nucleus(mx, dy, ryd * 0.44);
          chromosome(mx - sz * 0.52, dy, sz * 0.78, idx === 0 ? C.chrA : C.chrB, 0);
          chromosome(mx + sz * 0.52, dy, sz * 0.78, idx === 0 ? C.chrA : C.chrB, 0);
        });
        ctx.save(); ctx.strokeStyle = C.chrB; ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(mx - rxd, cy); ctx.lineTo(mx + rxd, cy); ctx.stroke();
        ctx.setLineDash([]); ctx.restore();
        lbl('2 haploid cells (N) → Meiosis II next', mx, cy + gap + ryd + 18, C.chrB);
      }
    }
  ];

  // ── Render & UI update ────────────────────────────────────────

  function render() {
    if (W && H) steps[current].draw();
  }

  function updateUI() {
    const s = steps[current];
    elTag.textContent  = s.stage;
    elName.textContent = s.name;
    elDesc.textContent = s.desc;
    elProg.textContent = (current + 1) + ' / ' + steps.length;
    elBar.style.width  = ((current + 1) / steps.length * 100) + '%';
    btnPrev.disabled   = current === 0;
    btnNext.disabled   = current === steps.length - 1;
  }

  function go(delta) {
    const next = current + delta;
    if (next < 0 || next >= steps.length) return;
    current = next;
    updateUI();
    render();
  }

  btnPrev.addEventListener('click', function() { go(-1); });
  btnNext.addEventListener('click', function() { go(1); });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown')  go(1);
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')    go(-1);
  });

  // Boot
  resize();
  updateUI();
})();
