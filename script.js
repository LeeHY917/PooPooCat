    (() => {
      const canvas = document.querySelector("#game");
      const ctx = canvas.getContext("2d");
      const textCanvas = document.querySelector("#text-layer");
      const textCtx = textCanvas.getContext("2d");
      const hint = document.querySelector("#hint");
      const W = canvas.width, H = canvas.height;
      const PIXEL_GRID = 2;
      const foodModes = {
        rice: { name: "Rice", label: "EASY MODE", time: 2, color: "#68402c", kind: "classic" },
        corn: { name: "Corn", label: "HARD MODE", time: 10.43 / 3, color: "#242127", kind: "corn" },
        beet: { name: "Beetroot", label: "NORMAL MODE", time: 1.5, color: "#ff1744", kind: "beet" },
        dragon: { name: "Dragon Fruit", label: "EXPERT MODE", time: 3.14 / 3, color: "#f0d743", kind: "dragon" }
      };
      let scene = "title";
      let food = foodModes.rice;
      let playMode = "hold";
      let progress = 0;
      let pushStartedAt = 0;
      let lastTapAt = 0;
      let ignoredTapUntil = 0;
      let fastPressCount = 0;
      let playStartedAt = 0;
      let pushing = false;
      let result = "";
      let poops = [];
      let sceneStartedAt = performance.now();
      let audioContext;
      let masterGain;
      let audioMuted = false;
      let bgmTimer;
      let bgmStep = 0;
      let lastFrame = 0;
      const buttons = {
        start: { x: 176, y: 248, w: 128, h: 34 },
        fastPress: { x: 54, y: 211, w: 180, h: 28 },
        keepPressing: { x: 246, y: 211, w: 180, h: 28 },
        speaker: { x: 430, y: 8, w: 40, h: 30 },
        push: { x: 161, y: 244, w: 130, h: 40 },
        restart: { x: 355, y: 246, w: 112, h: 38 }
      };

      function ensureAudio() {
        audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
        if (!masterGain) {
          masterGain = audioContext.createGain();
          masterGain.gain.value = audioMuted ? 0 : .18;
          masterGain.connect(audioContext.destination);
        }
      }

      function sound(kind) {
        try {
          if (audioMuted) return;
          ensureAudio();
          if (audioContext.state === "suspended") audioContext.resume();
          startBgm();
          if (kind === "meow") {
            const now = audioContext.currentTime;
            [[620, 0, .18], [850, .18, .32]].forEach(([frequency, offset, duration]) => {
              const osc = audioContext.createOscillator();
              const gain = audioContext.createGain();
              osc.type = "triangle";
              osc.frequency.setValueAtTime(frequency, now + offset);
              osc.frequency.exponentialRampToValueAtTime(frequency * .72, now + offset + duration);
              gain.gain.setValueAtTime(.0001, now + offset);
              gain.gain.exponentialRampToValueAtTime(.08, now + offset + .025);
              gain.gain.exponentialRampToValueAtTime(.0001, now + offset + duration);
              osc.connect(gain); gain.connect(masterGain);
              osc.start(now + offset); osc.stop(now + offset + duration);
            });
            return;
          }
          if (kind === "splat") {
            const now = audioContext.currentTime;
            [[180, 0, .16], [95, .18, .45]].forEach(([frequency, offset, duration]) => {
              const osc = audioContext.createOscillator();
              const gain = audioContext.createGain();
              osc.type = offset ? "sawtooth" : "square";
              osc.frequency.setValueAtTime(frequency, now + offset);
              osc.frequency.exponentialRampToValueAtTime(frequency * (offset ? .35 : .55), now + offset + duration);
              gain.gain.setValueAtTime(.0001, now + offset);
              gain.gain.exponentialRampToValueAtTime(offset ? .1 : .07, now + offset + .02);
              gain.gain.exponentialRampToValueAtTime(.0001, now + offset + duration);
              osc.connect(gain); gain.connect(masterGain);
              osc.start(now + offset); osc.stop(now + offset + duration);
            });
            return;
          }
          const osc = audioContext.createOscillator();
          const gain = audioContext.createGain();
          osc.connect(gain); gain.connect(masterGain);
          const now = audioContext.currentTime;
          osc.type = kind === "flush" ? "sawtooth" : "square";
          osc.frequency.setValueAtTime(kind === "flush" ? 280 : 760, now);
          osc.frequency.exponentialRampToValueAtTime(kind === "flush" ? 95 : 390, now + (kind === "flush" ? .55 : .08));
          gain.gain.setValueAtTime(.055, now);
          gain.gain.exponentialRampToValueAtTime(.001, now + (kind === "flush" ? .58 : .09));
          osc.start(now); osc.stop(now + (kind === "flush" ? .6 : .1));
        } catch (_) {}
      }

      function startBgm() {
        if (bgmTimer || !audioContext) return;
        const melody = [523.25, 659.25, 783.99, 659.25, 493.88, 587.33, 698.46, 587.33];
        bgmTimer = window.setInterval(() => {
          if (audioContext.state !== "running") return;
          const step = bgmStep++;
          const osc = audioContext.createOscillator();
          const gain = audioContext.createGain();
          osc.type = "triangle";
          osc.frequency.value = melody[step % melody.length];
          gain.gain.setValueAtTime(.0001, audioContext.currentTime);
          gain.gain.exponentialRampToValueAtTime(.018, audioContext.currentTime + .025);
          gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + .2);
          osc.connect(gain); gain.connect(masterGain);
          osc.start(); osc.stop(audioContext.currentTime + .21);
          if (step % 4 === 3 && !(scene === "play" && pushing)) {
            const plop = audioContext.createOscillator();
            const plopGain = audioContext.createGain();
            plop.type = "sine";
            plop.frequency.setValueAtTime(165, audioContext.currentTime);
            plop.frequency.exponentialRampToValueAtTime(62, audioContext.currentTime + .14);
            plopGain.gain.setValueAtTime(.0001, audioContext.currentTime);
            plopGain.gain.exponentialRampToValueAtTime(.035, audioContext.currentTime + .012);
            plopGain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + .15);
            plop.connect(plopGain); plopGain.connect(masterGain);
            plop.start(); plop.stop(audioContext.currentTime + .16);
          }
        }, 280);
      }

      function box(x, y, w, h, color, stroke) {
        const snap = value => Math.round(value / PIXEL_GRID) * PIXEL_GRID;
        const left = snap(x), top = snap(y);
        const width = Math.max(PIXEL_GRID, snap(w)), height = Math.max(PIXEL_GRID, snap(h));
        ctx.fillStyle = color; ctx.fillRect(left, top, width, height);
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = PIXEL_GRID; ctx.strokeRect(left, top, width, height); }
      }
      function pixelText(text, x, y, size = 10, color = "#59402e", align = "center", outline = null) {
        const readableSize = Math.max(size, size <= 8 ? 8 : 10);
        const transform = ctx.getTransform();
        const scaleX = textCanvas.width / W, scaleY = textCanvas.height / H;
        textCtx.save();
        textCtx.setTransform(
          transform.a * scaleX, transform.b * scaleY,
          transform.c * scaleX, transform.d * scaleY,
          transform.e * scaleX, transform.f * scaleY
        );
        textCtx.globalAlpha = ctx.globalAlpha;
        textCtx.font = `600 ${readableSize}px Arial, "Noto Sans TC", "Microsoft JhengHei", sans-serif`;
        textCtx.textAlign = align;
        textCtx.textBaseline = "middle";
        textCtx.letterSpacing = ".2px";
        if (outline) { textCtx.lineWidth = 3; textCtx.strokeStyle = outline; textCtx.strokeText(text, x, y); }
        textCtx.fillStyle = color;
        textCtx.fillText(text, x, y);
        textCtx.restore();
      }
      function button(rect, label, active = false) {
        box(rect.x, rect.y + 4, rect.w, rect.h, "#94601f");
        box(rect.x, rect.y, rect.w, rect.h, active ? "#f5bd43" : "#ffd766", "#fff4bf");
        box(rect.x + 5, rect.y + 4, rect.w - 10, 3, "#fff1b1");
        pixelText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1, 15, "#80501e");
      }
      function drawSpeaker() {
        const { x, y, w, h } = buttons.speaker;
        box(x, y, w, h, "#fff8df", "#b48743");
        box(x + 7, y + 11, 6, 8, "#80501e");
        box(x + 13, y + 7, 5, 16, "#80501e");
        if (audioMuted) {
          box(x + 23, y + 7, 11, 16, "#d95659");
          pixelText("×", x + 28, y + 15, 13, "#fff");
        } else {
          box(x + 21, y + 9, 2, 12, "#80501e");
          box(x + 25, y + 6, 2, 18, "#80501e");
          box(x + 29, y + 11, 2, 8, "#80501e");
        }
      }
      function toggleSound() {
        audioMuted = !audioMuted;
        try {
          ensureAudio();
          masterGain.gain.setTargetAtTime(audioMuted ? 0 : .18, audioContext.currentTime, .02);
          if (!audioMuted) {
            if (audioContext.state === "suspended") audioContext.resume();
            startBgm();
          }
        } catch (_) {}
      }
      function sparkle(x, y, color = "#fffbe1", phase = 0, size = 6) {
        const s = size + (Math.sin(phase) + 1) * 2;
        box(x - s / 2, y - 1, s, 2, color); box(x - 1, y - s / 2, 2, s, color);
      }
      function cat(x, y, scale = 1, tired = false, pose = "sit") {
        ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
        const gold = tired ? "#d9b866" : "#f7c84c";
        const shade = tired ? "#aa925c" : "#d99b2e";
        const now = performance.now();
        const bob = pose === "dance" || pose === "head" || pose === "twist" || pose === "reveal" ? Math.sin(now / 90) * 3 : 0;
        if (pose === "twist") ctx.rotate(Math.sin(now / 100) * .16);
        ctx.translate(0, bob);
        // Wings
        box(-27, -35, 12, 21, "#fff"); box(-32, -31, 7, 11, "#fff"); box(15, -35, 12, 21, "#fff"); box(25, -31, 7, 11, "#fff");
        box(-26, -18, 8, 5, "#e5e3d6"); box(18, -18, 8, 5, "#e5e3d6");
        // Tail and body
        box(18, 13, 14, 7, gold); box(27, 8, 7, 10, gold);
        if (tired) {
          box(-15, -2, 30, 37, gold); box(-12, 27, 9, 8, shade); box(3, 27, 9, 8, shade);
          box(-7, 6, 14, 24, "#fff8de");
        } else {
          box(-21, -2, 42, 37, gold); box(-17, 26, 13, 8, shade); box(5, 26, 13, 8, shade);
          box(-12, 5, 24, 23, "#fff8de"); box(-8, 11, 16, 13, "#fff");
        }
        // Head, ears, cheeks
        box(-24, -33, 48, 37, gold); box(-23, -40, 13, 13, gold); box(10, -40, 13, 13, gold);
        box(-19, -36, 7, 6, "#ff6b78"); box(12, -36, 7, 6, "#ff6b78");
        box(-17, -25, 5, 7, "#392f30"); box(12, -25, 5, 7, "#392f30");
        box(-14, -11, 4, 3, "#ef9588"); box(10, -11, 4, 3, "#ef9588");
        box(-3, -15, 6, 4, "#b97359"); box(-1, -11, 2, 4, "#6a493c");
        if (pose === "frown") {
          box(-18, -18, 7, 3, "#8c6738"); box(11, -18, 7, 3, "#8c6738");
          box(-4, -8, 3, 3, "#392f30"); box(-1, -11, 3, 3, "#392f30"); box(2, -8, 3, 3, "#392f30");
        }
        // Halo
        box(-11, -52, 22, 3, "#e0b83d"); box(-8, -56, 16, 3, "#ffe891");
        // Arms / expression
        if (pose === "strain") {
          box(-29, -5, 9, 17, gold); box(20, -5, 9, 17, gold);
          box(-31, -8, 7, 7, "#fff1d2"); box(24, -8, 7, 7, "#fff1d2");
          box(-15, -24, 4, 8, "#392f30"); box(11, -24, 4, 8, "#392f30");
        } else if (pose === "dance") {
          box(-34, -18, 11, 7, gold); box(23, -18, 11, 7, gold);
          box(-37, -22, 8, 8, "#fff1d2"); box(29, -22, 8, 8, "#fff1d2");
        } else if (pose === "head") {
          box(-29, -35, 9, 17, gold); box(20, -35, 9, 17, gold);
          box(-31, -40, 8, 8, "#fff1d2"); box(23, -40, 8, 8, "#fff1d2");
        } else if (pose === "reveal") {
          box(-29, 1, 9, 16, gold); box(20, -21, 10, 17, gold);
          box(-27, 13, 8, 6, "#fff1d2"); box(26, -27, 8, 8, "#fff1d2");
        } else {
          box(-27, 2, 8, 15, gold); box(19, 2, 8, 15, gold);
          box(-26, 14, 7, 5, "#fff1d2"); box(20, 14, 7, 5, "#fff1d2");
        }
        if (tired) {
          box(-19, -30, 12, 3, "#7498c7"); box(7, -30, 12, 3, "#7498c7");
          box(18, -39, 5, 5, "#80b9e8"); box(22, -35, 3, 3, "#80b9e8");
          pixelText("...", 30, -42, 8, "#6d9cd6");
        }
        ctx.restore();
      }
      function background(color = "#e7f4ff") {
        box(0, 0, W, H, color);
        box(0, 260, W, 40, "#c9e4f2");
        for (let x = 10; x < W; x += 32) for (let y = 12; y < 250; y += 28) {
          if ((x + y) % 4 === 0) sparkle(x, y, "#ffc928", x * .2 + y);
        }
      }
      function drawTitle(now) {
        background();
        pixelText("A TINY ANGEL CAT ADVENTURE", 240, 32, 9, "#a4793c");
        pixelText("Poo Poo Cat", 240, 69, 31, "#a96716", "center", "#fff");
        // Each pair of cats repeats the center cat's gesture with an outward delay.
        const cycle = 3000;
        for (let i = -2; i <= 2; i++) {
          const distance = Math.abs(i);
          const localTime = now - sceneStartedAt - distance * 340;
          let pose = "sit";
          let reveal = false;
          if (localTime >= 0) {
            const phase = localTime % cycle;
            if (phase < 850) pose = "head";
            else if (phase < 1700) pose = "twist";
            else if (phase < 2450) { pose = "reveal"; reveal = true; }
            else pose = "head";
          }
          const x = 240 + i * 78;
          const y = 160;
          const scale = distance === 0 ? 1 : .58;
          cat(x, y, scale, false, pose);
          if (reveal) {
            const blink = .72 + (Math.sin(now / 95 + distance) + 1) * .12;
            ctx.save(); ctx.globalAlpha = blink;
            drawPoop("classic", x + 28 * scale, y - 25 * scale + Math.sin(now / 100 + distance) * 2, .78 * scale, 0);
            sparkle(x + 13 * scale, y - 37 * scale, "#ffc928", now / 90 + distance, 6);
            ctx.restore();
          }
        }
        for (let i = 0; i < 8; i++) sparkle(31 + i * 60, 104 + Math.sin(now / 250 + i) * 10, "#ffc928", now / 240 + i);
        button(buttons.fastPress, "FAST PRESS", playMode === "hold");
        button(buttons.keepPressing, "KEEP PRESS", playMode === "tap");
        button(buttons.start, "Start!");
        pixelText("CHOOSE A PLAY STYLE · SPACE TO START", 240, 293, 8, "#8d693f");
      }
      function foodIcon(kind, x, y, scale = 1) {
        ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
        if (kind === "rice") {
          box(-15, 1, 30, 13, "#76a6bb"); box(-13, -2, 26, 10, "#fff"); box(-10, -6, 20, 8, "#fff8e4"); box(-4, -10, 12, 6, "#fff");
        } else if (kind === "corn") {
          box(-8, -13, 16, 29, "#f8cd4d", "#d3972d");
          for (let yy = -9; yy < 12; yy += 6) for (let xx = -4; xx < 6; xx += 6) box(xx, yy, 3, 3, "#fff18a");
          box(-13, 5, 7, 13, "#6a9c51"); box(6, 5, 7, 13, "#6a9c51");
        } else if (kind === "beet") {
          box(-12, -8, 24, 22, "#ff1744"); box(-8, -13, 16, 8, "#ff4d68"); box(-2, 12, 4, 7, "#628c4a"); box(-8, -14, 7, 6, "#7ca85a"); box(2, -15, 7, 7, "#7ca85a");
        } else {
          box(-16, -11, 32, 22, "#ff5b91"); box(-12, -15, 24, 8, "#ffdce0"); box(-11, 10, 22, 6, "#8e594c");
          box(-13, -17, 7, 4, "#4f9b58"); box(-7, -19, 7, 4, "#68b75b"); box(0, -19, 7, 4, "#4f9b58"); box(7, -17, 7, 4, "#68b75b");
          box(-18, -9, 4, 9, "#4f9b58"); box(14, -9, 4, 9, "#4f9b58");
          for (const [sx, sy] of [[-8,-4],[2,-6],[8,2],[-2,5],[5,-1]]) box(sx, sy, 2, 2, "#34313a");
        }
        ctx.restore();
      }
      function drawFood(now, eating = false) {
        background();
        box(0, 0, W, 40, "#d5ecfa");
        pixelText("Food for Poop", 240, 65, 23, "#a96716", "center", "#fff");
        const decorateX = 92 + ((Math.sin(now / 1700) + 1) * 90);
        pixelText("Decorate your Poop", decorateX, 88, 10, "#ff1744", "center", "#fff5b8");
        sparkle(decorateX - 83, 88, "#ffc928", now / 130, 4);
        sparkle(decorateX + 83, 88, "#24b9db", now / 130 + 1, 4);
        // Table and seated angel cat
        box(0, 176, W, 17, "#b77e4c"); box(0, 193, W, 8, "#8b5a36"); box(34, 201, 15, 65, "#b77e4c"); box(430, 201, 15, 65, "#b77e4c");
        box(171, 101, 138, 82, "#b78455"); box(177, 108, 126, 67, "#dfb67c");
        cat(240, 131 + (eating ? Math.sin(now / 70) * 2 : 0), .85, false, eating ? "dance" : "sit");
        foodIcon("rice", 240, 181, .95);
        pixelText("Easy Mode", 240, 158, 9, "#6b542b");
        pixelText("Rice / 米飯", 240, 170, 7, "#8b6849");
        const cards = [
          { key: "corn", x: 48, en: "CORN", zh: "玉米" },
          { key: "beet", x: 160, en: "BEETROOT", zh: "紅菜頭" },
          { key: "dragon", x: 272, en: "DRAGON FRUIT", zh: "火龍果" }
        ];
        cards.forEach((card, index) => {
          ctx.save();
          ctx.fillStyle = "#b77e4c";
          ctx.beginPath(); ctx.ellipse(card.x + 46, 240, 45, 32, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#fffdf2";
          ctx.beginPath(); ctx.ellipse(card.x + 46, 237, 43, 30, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#d9cdb5"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(card.x + 46, 237, 37, 24, 0, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
          foodIcon(card.key, card.x + 46, 220, .62);
          pixelText(card.key === "corn" ? "Hard Mode" : card.key === "beet" ? "Normal Mode" : "Expert Mode", card.x + 46, 237, 7, "#61472d");
          pixelText(card.en, card.x + 46, 250, 7, "#965d31");
          pixelText(card.zh, card.x + 46, 262, 7, "#8b6849");
        });
        if (eating) {
          const elapsed = now - sceneStartedAt;
          const t = Math.min(1, elapsed / 850);
          const scale = Math.max(.08, .9 * (1 - t));
          foodIcon(food.kind === "classic" ? "rice" : food.kind, 240, 173 - t * 38, scale);
          pixelText("NOM NOM!", 240, 93, 10, "#9a652e");
          for (let i = 0; i < 3; i++) pixelText("•", 222 + i * 18, 122 + (i % 2) * 8, 8, "#fff");
        }
        box(383, 206, 83, 67, "#ffedb9", "#d7a45e");
        pixelText("CHOOSE A", 424, 225, 7, "#965d31"); pixelText("TREAT!", 424, 237, 9, "#965d31");
        pixelText("CLICK A DISH", 424, 258, 7, "#8b6849");
      }
      function tilePattern() {
        box(0, 0, W, H, "#dceef2");
        for (let y = 0; y < 260; y += 32) for (let x = 0; x < W; x += 48) {
          box(x, y, 46, 30, "#f9ffff", "#c5e0e8");
          box(x + 2, y + 2, 42, 26, "#fff");
        }
        box(0, 260, W, 40, "#b8d8e2");
        for (let x = 0; x < W; x += 48) box(x, 260, 46, 38, "#c8e3e9", "#a9cdd7");
      }
      function drawBathroom(now, intro = false) {
        tilePattern();
        // Enlarged tub and green curtain
        box(10, 174, 136, 55, "#faffff", "#9fc7d2"); box(18, 183, 120, 38, "#addce8"); box(8, 166, 140, 12, "#fff", "#9fc7d2");
        box(14, 117, 128, 10, "#5e9d72"); box(14, 127, 128, 40, "#70ad7e");
        for (let x = 22; x < 138; x += 16) box(x, 127, 4, 38, "#83bc88");
        // Sink and mirror
        box(364, 56, 75, 58, "#a9d8e3", "#9bc5ce"); box(369, 61, 65, 48, "#efffff");
        sparkle(384, 74, "#fff", now / 300); sparkle(421, 93, "#fff", now / 300 + 2);
        box(369, 139, 60, 19, "#fff", "#91bfc9"); box(374, 157, 50, 45, "#fbffff", "#91bfc9"); box(386, 133, 24, 5, "#a9d8e3");
        // Target poster
        box(181, 74, 118, 38, "#fff", "#bfdae0");
        pixelText("POOP TARGET", 240, 83, 8, "#315d70"); pixelText("0.3 kg", 240, 99, 11, "#ff1744");
        // Toilet
        box(170, 190, 140, 13, "#fff", "#9cbfc8"); box(181, 202, 118, 48, "#fff", "#9cbfc8"); box(194, 242, 92, 12, "#d9e8e9");
        box(188, 184, 106, 18, "#e9f9fb", "#9cbfc8"); box(197, 187, 88, 10, "#70bbd1");
        for (let i = 0; i < 8; i++) sparkle(184 + ((i * 43) % 112), 189 + ((i * 17) % 53), "#fff", now / 140 + i);
        // The transition features the strained cat holding its wooden sign;
        // during play the same cat sits quietly on the toilet.
        cat(239, 156, .72, false, intro ? "strain" : "sit");
        if (intro) {
          box(276, 130, 8, 24, "#a36d3d");
          box(268, 118, 63, 23, "#b77b42", "#704b2d");
          pixelText("Pooping Time", 299, 130, 8, "#fff8da");
        }
        for (let i = 0; i < 12; i++) sparkle(13 + i * 39, 78 + (i % 3) * 48, "#ffc928", now / 110 + i);
      }
      function drawPoop(kind, x, y, scale = 1, wobble = 0) {
        ctx.save(); ctx.translate(x, y + wobble); ctx.scale(scale, scale);
        if (kind === "classic") {
          box(-12, 8, 24, 8, "#68402c"); box(-9, 0, 18, 9, "#68402c"); box(-6, -7, 13, 8, "#68402c"); box(-3, -13, 8, 7, "#68402c"); box(0, -17, 3, 5, "#9a6a47");
          box(-8, 2, 4, 2, "#a97852"); box(-5, -5, 4, 2, "#ba8a60"); box(2, 10, 5, 2, "#89583c");
        } else if (kind === "corn") {
          box(-14, 4, 28, 12, "#242127"); box(-10, -4, 21, 10, "#242127"); box(-5, -12, 12, 9, "#242127");
          [[-8,8],[1,6],[8,10],[-3,0],[6,-2]].forEach(([sx,sy]) => box(sx, sy, 4, 4, "#f5c839"));
        } else if (kind === "beet") {
          box(-15, 2, 29, 13, "#ff1744"); box(-11, -4, 23, 9, "#ff4964"); box(-4, -9, 12, 8, "#ff1744"); box(-8, 7, 5, 3, "#ff7287");
        } else {
          box(-16, 2, 32, 14, "#f0d743"); box(-11, -4, 24, 9, "#ffed70"); box(-4, -8, 11, 7, "#f0d743");
          [[-9,6],[1,4],[8,9],[-3,-1],[7,-2]].forEach(([sx,sy]) => box(sx, sy, 2, 2, "#242127"));
        }
        ctx.restore();
      }
      function drawMeter() {
        const x = 414, y = 65, h = 168, w = 28;
        const zone = meterZone();
        pixelText("PULL", x + w / 2, 50, 9, "#57433a");
        box(x - 5, y - 5, w + 10, h + 10, "#fff", "#785a48");
        // Progress climbs from the bottom through red, green, then yellow.
        box(x, y, w, h * zone.start, "#df6270");
        box(x, y + h * zone.start, w, h * (zone.end - zone.start), "#5ea96b");
        box(x, y + h * zone.end, w, h * (1 - zone.end), "#e5bb54");
        const target = (zone.start + zone.end) / 2;
        box(x - 7, y + h * target - 1, w + 14, 2, "#ff1744");
        pixelText("0.3kg", x + w / 2, y + h * target - 12, 8, "#ce3948");
        const markerY = y + h * progress;
        box(x - 5, markerY - 4, w + 10, 8, "#fff", "#795034");
        pixelText("▲", x - 11, markerY, 9, "#795034");
      }
      function meterZone() {
        const center = 7 / 12;
        const halfWidth = food.kind === "corn" ? .035 : food.kind === "dragon" ? .025 : 1 / 12;
        return { start: center - halfWidth, end: center + halfWidth };
      }
      function drawGameTwoRoom(now) {
        box(0, 0, W, H, "#e5f3fc");
        for (let y = 0; y < 224; y += 32) for (let x = 0; x < W; x += 48) {
          box(x, y, 46, 30, "#d2e8f5", "#bdd9e8");
          box(x + 2, y + 2, 42, 26, "#eaf6fd");
        }
        box(0, 260, W, 40, "#c2deed");
        for (let x = 0; x < W; x += 48) box(x, 260, 46, 38, "#d5eaf5", "#b4d2e1");
        ctx.save();
        ctx.fillStyle = "#b7d0de";
        ctx.beginPath(); ctx.ellipse(241, 259, 91, 9, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // Enlarged close-up toilet with a raised cistern, porcelain bowl, seat, and water.
        box(177, 69, 126, 87, "#f8fdff", "#9bbbc9");
        box(184, 76, 112, 73, "#fff", "#d0e3eb");
        box(190, 83, 100, 4, "#e2eff4");
        box(250, 88, 14, 4, "#b6cbd3");
        box(250, 92, 14, 3, "#e8f2f5");
        box(204, 145, 72, 39, "#f8fdff", "#9bbbc9");
        box(188, 148, 104, 13, "#d8e8ee", "#9bbbc9");
        box(184, 159, 112, 19, "#fff", "#93b7c7");
        box(194, 163, 92, 10, "#e8f7fb");
        box(177, 174, 126, 18, "#fcffff", "#9bbbc9");
        box(183, 180, 114, 7, "#b8e4ed");
        box(185, 190, 110, 53, "#f7fcfe", "#9bbbc9");
        box(192, 198, 96, 38, "#fff", "#d3e4ea");
        box(203, 236, 74, 19, "#e5f0f3", "#9bbbc9");
        box(211, 250, 58, 7, "#c6dce4");
        cat(239, 166, .78, false, "frown");
        for (let i = 0; i < 5; i++) sparkle(164 + i * 36, 82 + (i % 2) * 32, "#fff", now / 190 + i, 4);
      }
      function drawPlay(now) {
        drawGameTwoRoom(now);
        box(0, 0, W, 35, "#fff9e6cc");
        pixelText("YOUR CHALLENGE", 240, 13, 7, "#8a704f");
        pixelText(`${food.name} · ${food.label}`, 240, 48, 8, "#69533b");
        const titleFade = Math.max(0, 1 - (now - sceneStartedAt) / 4000);
        if (titleFade > 0) {
          ctx.globalAlpha = titleFade;
          pixelText("Pooping Time", 240, 125, 23, "#a96716", "center", "#fff");
          ctx.globalAlpha = 1;
        }
        // The food-specific poop emerges as the meter advances.
        poops.forEach(poop => drawPoop(poop.kind, poop.x, poop.y, poop.scale, 0));
        drawPoop(food.kind, 322, 39 + progress * 132, 1.35, pushing && playMode === "hold" ? Math.sin(now / 24) * 7 : 0);
        drawMeter();
        const instruction = playMode === "hold"
          ? (pushing ? "FAST MOVING — RELEASE TO STOP!" : "FAST PRESS: 3 PRESSES = 1 STEP")
          : pushing ? "HOLD FOR 1 SECOND TO COUNT"
          : now < ignoredTapUntil ? "SHORT PRESS IGNORED; HOLD FOR 1 SECOND"
          : "KEEP PRESSING; WAIT 0.5S TO SETTLE";
        pixelText(instruction, 226, 231, 7, "#584638");
        const pressLabel = playMode === "hold"
          ? pushing ? "MOVING..." : "Fast Press"
          : pushing ? `HOLD ${(Math.max(0, 1000 - (now - pushStartedAt)) / 1000).toFixed(1)}s` : "Keep Press";
        button(buttons.push, pressLabel, pushing);
        const remaining = playStartedAt ? Math.max(0, 10 - (now - playStartedAt) / 1000) : 10;
        pixelText(`TIME ${remaining.toFixed(1)}s`, 63, 48, 9, "#bd3d50", "left", "#fff");
        pixelText(playMode === "hold" ? `3 press/release cycles = 1 step (${fastPressCount % 3}/3)` : "Hold each press for 1 second or it won't count.", 226, 294, 7, "#765a44");
      }
      function drawBathroomTransition(now) {
        const elapsed = now - sceneStartedAt;
        const progress = Math.min(1, Math.max(0, (elapsed - 2800) / 1200));
        const eased = 1 - (1 - progress) ** 3;
        const zoom = 1 + .3 * Math.min(1, elapsed / 2800);
        ctx.save();
        ctx.translate(W / 2, 156);
        ctx.scale(zoom, zoom);
        ctx.translate(-W / 2, -156);
        drawBathroom(now, true);
        ctx.restore();
        if (progress > 0) {
          const panelX = W * (1 - eased);
          ctx.save();
          ctx.translate(panelX, 0);
          drawPlay(now);
          ctx.restore();
        }
        for (let i = 0; i < 5; i++) {
          const startAt = 200 + i * 190;
          if (elapsed < startAt) continue;
          const x = W + 30 - (elapsed - startAt) * .14;
          const y = 252 - i * 41;
          if (x > -20) cat(x, y, .23, false, "dance");
        }
      }
      function drawResultPoops() {
        if (!poops.length) return;
        const columns = Math.min(8, Math.ceil(Math.sqrt(poops.length * W / H)));
        const rows = Math.ceil(poops.length / columns);
        ctx.save(); ctx.globalAlpha = .5;
        for (let i = 0; i < poops.length; i++) {
          const poop = poops[i % poops.length];
          const x = columns > 1 ? 18 + (i % columns) * (444 / (columns - 1)) : 36;
          const y = rows > 1 ? 16 + Math.floor(i / columns) * (264 / (rows - 1)) : 36;
          drawPoop(poop.kind, x, y, Math.max(.55, poop.scale * .85), 0);
        }
        ctx.restore();
      }
      function resultCat(x, y, scale, tired, pose) {
        ctx.save(); ctx.shadowColor = "#fff"; ctx.shadowBlur = 7;
        cat(x, y, scale, tired, pose);
        ctx.restore();
        cat(x, y, scale, tired, pose);
      }
      function drawSuccess(now) {
        background("#dceeff");
        drawResultPoops();
        for (let i = 0; i < 18; i++) sparkle(12 + i * 27, 20 + ((i * 39) % 228), "#fff", now / 80 + i);
        resultCat(116, 179, .75, false, "dance"); resultCat(364, 179, .75, false, "dance");
        pixelText("✦  POP!  ✦", 116, 118, 9, "#db8b44", "center", "#fff");
        pixelText("✦  POP!  ✦", 364, 118, 9, "#db8b44", "center", "#fff");
        pixelText("Congratulations!", 240, 199, 21, "#a96716", "center", "#fff");
        pixelText("Perfect aim! The target is yours!", 240, 223, 9, "#6c543d", "center", "#fff");
        pixelText(`POOPS: ${poops.length}`, 240, 26, 10, "#59402e", "center", "#fff");
        button(buttons.restart, "Restart!");
      }
      function drawFail(now) {
        background("#dfeeff");
        box(0, 0, W, 250, "#e8f4ff");
        drawResultPoops();
        for (let i = 0; i < 7; i++) pixelText("〰", 70 + i * 57, 55 + Math.sin(now / 250 + i) * 9, 17, "#80a8da");
        resultCat(240, 168, 1.25, true, "frown");
        pixelText("OOPS!", 240, 224, 11, "#6792c5", "center", "#fff");
        pixelText("Fail", 240, 253, 23, "#6587b0", "center", "#fff");
        pixelText(progress < meterZone().start ? "Not quite enough!" : "Too much oomph!", 240, 276, 9, "#6783a2", "center", "#fff");
        pixelText(`POOPS: ${poops.length}`, 240, 26, 10, "#59402e", "center", "#fff");
        button(buttons.restart, "Restart!");
      }
      function updateHint() {
        if (scene === "title") hint.innerHTML = "Choose <strong>Fast Press</strong> or <strong>Keep Press</strong>, then click Start or press <strong>Space</strong> · <strong>M</strong> toggles sound";
        else if (scene === "food") hint.innerHTML = "Pick a dish to feed your angel cat. Each food changes your challenge!";
        else if (scene === "eating" || scene === "transition") hint.innerHTML = "Yum! Your angel cat is getting ready...";
        else if (scene === "play") hint.innerHTML = playMode === "hold"
          ? "Press and release rapidly: every three cycles advances one step. The run ends after 10 seconds."
          : "Hold the Keep Press button or Spacebar for at least one second per press. Release in the green zone, then wait half a second.";
        else if (scene === "result") hint.innerHTML = result === "success" ? "A sparkling success! Click Restart or press Space to play again." : "Try another food and find your rhythm. Click Restart or press Space.";
      }
      function finish(success) {
        if (scene !== "play") return;
        pushing = false; result = success ? "success" : "fail"; scene = "result"; sceneStartedAt = performance.now();
        sound("splat"); updateHint();
      }
      function settleProgress() {
        const zone = meterZone();
        finish(progress >= zone.start && progress <= zone.end);
      }
      function dropPoop() {
        const index = poops.length;
        poops.push({
          kind: food.kind,
          x: 183 + (index % 5) * 32,
          y: 207 + Math.floor(index / 5) * 13,
          scale: Math.max(.35, 1.15 - index * .035)
        });
      }
      function startPush() {
        if (scene !== "play" || pushing) return;
        if (playMode === "tap") {
          pushing = true;
          pushStartedAt = performance.now();
          return;
        }
        pushing = true; pushStartedAt = performance.now(); sound("tap");
      }
      function stopPush() {
        if (scene !== "play" || !pushing) return;
        const now = performance.now();
        if (playMode === "tap") {
          pushing = false;
          if (now - pushStartedAt < 1000) {
            ignoredTapUntil = now + 800;
            return;
          }
          progress = Math.min(1, progress + .025);
          dropPoop();
          lastTapAt = now;
          sound("tap");
          return;
        }
        if (playMode === "hold") {
          pushing = false;
          fastPressCount++;
          if (fastPressCount % 3 === 0) {
            progress = Math.min(1, progress + .04);
            dropPoop();
            if (progress >= meterZone().start && progress <= meterZone().end) finish(true);
            else if (progress > meterZone().end) finish(false);
          }
          return;
        }
      }
      function beginFood(key) {
        food = { ...foodModes[key] };
        if (key === "dragon") food.time = .6 + Math.random() * .8;
        scene = "eating"; sceneStartedAt = performance.now(); progress = 0; lastTapAt = 0; ignoredTapUntil = 0; fastPressCount = 0; playStartedAt = 0; poops = [];
        sound("tap"); updateHint();
      }
      function restart() {
        scene = "title"; progress = 0; pushing = false; lastTapAt = 0; ignoredTapUntil = 0; fastPressCount = 0; playStartedAt = 0; poops = []; result = ""; sceneStartedAt = performance.now(); updateHint();
      }
      function point(event) {
        const rect = canvas.getBoundingClientRect();
        return { x: (event.clientX - rect.left) * W / rect.width, y: (event.clientY - rect.top) * H / rect.height };
      }
      function inside(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
      canvas.addEventListener("pointerdown", event => {
        const p = point(event); canvas.setPointerCapture(event.pointerId);
        if (inside(p, buttons.speaker)) toggleSound();
        else if (scene === "title" && inside(p, buttons.fastPress)) playMode = "hold";
        else if (scene === "title" && inside(p, buttons.keepPressing)) playMode = "tap";
        else if (scene === "title" && inside(p, buttons.start)) { scene = "food"; sceneStartedAt = performance.now(); sound("tap"); updateHint(); }
        else if (scene === "food") {
          if (p.y >= 206 && p.y <= 276) {
            if (p.x >= 48 && p.x < 141) beginFood("corn");
            else if (p.x >= 160 && p.x < 253) beginFood("beet");
            else if (p.x >= 272 && p.x < 365) beginFood("dragon");
          } else if (p.x >= 202 && p.x <= 278 && p.y >= 157 && p.y <= 200) beginFood("rice");
        } else if (scene === "play" && inside(p, buttons.push)) startPush();
        else if (scene === "result" && inside(p, buttons.restart)) restart();
      });
      canvas.addEventListener("pointerup", stopPush);
      canvas.addEventListener("pointercancel", stopPush);
      window.addEventListener("pointerup", stopPush);
      window.addEventListener("pointercancel", stopPush);
      window.addEventListener("blur", stopPush);
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) stopPush();
      });
      window.addEventListener("keydown", event => {
        if (event.code === "KeyM" && !event.repeat) {
          toggleSound();
          return;
        }
        if (event.code !== "Space" || event.repeat) return;
        event.preventDefault();
        if (scene === "title") { scene = "food"; sceneStartedAt = performance.now(); sound("tap"); updateHint(); }
        else if (scene === "play") startPush();
        else if (scene === "result") restart();
      });
      window.addEventListener("keyup", event => { if (event.code === "Space") stopPush(); });

      function frame(now) {
        if (scene === "eating" && now - sceneStartedAt >= 1000) {
          scene = "transition"; sceneStartedAt = now; sound("meow");
        } else if (scene === "transition" && now - sceneStartedAt >= 4000) {
          sound("flush"); scene = "play"; sceneStartedAt = now; playStartedAt = now; updateHint();
        }
        if (scene === "play" && !pushing && playMode === "tap" && lastTapAt && now - lastTapAt >= 500) settleProgress();
        if (scene === "play" && playStartedAt && now - playStartedAt >= 10000) settleProgress();
        textCtx.clearRect(0, 0, textCanvas.width, textCanvas.height);
        if (scene === "title") drawTitle(now);
        else if (scene === "food") drawFood(now);
        else if (scene === "eating") drawFood(now, true);
        else if (scene === "transition") drawBathroomTransition(now);
        else if (scene === "play") drawPlay(now);
        else if (scene === "result") result === "success" ? drawSuccess(now) : drawFail(now);
        drawSpeaker();
        lastFrame = now; requestAnimationFrame(frame);
      }
      updateHint(); requestAnimationFrame(frame);
    })();
