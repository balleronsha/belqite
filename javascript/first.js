/* =========================
   SAFE INIT (не запускать дважды)
========================= */
(() => {
  if (window.__BELQITE_INIT__) return;
  window.__BELQITE_INIT__ = true;

  /* =========================
     BASE PATH (GitHub Pages / локально)
     - если сайт в подпапке /repo/, BASE будет "/repo/"
========================= */
  const BASE = (() => {
    const seg = location.pathname.split('/').filter(Boolean)[0];
    // если это github.io и есть подпапка — берём её как base
    if (location.host.includes('github.io') && seg) return `/${seg}/`;
    return '/';
  })();

  const url = (p) => (p.startsWith('/') ? p : BASE + p.replace(/^\.\//, ''));

  /* =========================
     1) CANVAS HYPNO
========================= */
  (() => {
    const bgCanvas = document.getElementById('bgCanvas');
    const centerCanvas = document.getElementById('centerCanvas');
    const frameEl = document.querySelector('.hypno-frame');

    if (!bgCanvas || !centerCanvas || !frameEl) return;

    const bgCtx = bgCanvas.getContext('2d', { willReadFrequently: true });

    const sceneCanvas = document.createElement('canvas');
    const sceneCtx = sceneCanvas.getContext('2d', { willReadFrequently: true });

    function resize() {
      const w = bgCanvas.clientWidth;
      const h = bgCanvas.clientHeight;

      bgCanvas.width = w;
      bgCanvas.height = h;

      centerCanvas.width = centerCanvas.clientWidth;
      centerCanvas.height = centerCanvas.clientHeight;

      sceneCanvas.width = w;
      sceneCanvas.height = h;
    }

    resize();
    window.addEventListener('resize', resize);

    const COLORS = {
      background: '#FFFFFF',
      rayLight: '#FFFFFF',
      rayDark: '#FF7723',
      hypno: '#FF7723',
    };

    const RINGS = 50;
    const SECTORS = 24;

    const BG_SPEED = -0.00025;
    const CENTER_SPEED = 0.0005;

    let bgAngle = 0;
    let centerAngle = 0;
    let last = performance.now();
    let time = 0;

    function drawRays(ctx, w, h, angle) {
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.max(w, h) * 0.75;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);

      const rays = 16;
      const step = (Math.PI * 2) / rays;
      const rayWidth = radius * 0.65;

      for (let i = 0; i < rays; i++) {
        const a = i * step;

        ctx.save();
        ctx.rotate(a);

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(radius, -rayWidth * 0.4);
        ctx.lineTo(radius, rayWidth * 0.4);
        ctx.closePath();
        ctx.fillStyle = COLORS.rayLight;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(radius * 1.12, -rayWidth * 0.15);
        ctx.lineTo(radius * 1.12, rayWidth * 0.15);
        ctx.closePath();
        ctx.fillStyle = COLORS.rayDark;
        ctx.globalAlpha = 0.95;
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.restore();
      }

      ctx.restore();
    }

    function drawHypnoCircle(ctx, w, h, angle) {
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.48;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);

      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();

      ctx.clip();

      const dR = radius / RINGS;
      const dA = (Math.PI * 2) / SECTORS;

      for (let r = 0; r < RINGS; r++) {
        const r0 = r * dR;
        const r1 = (r + 1) * dR;

        for (let s = 0; s < SECTORS; s++) {
          const a0 = s * dA;
          const a1 = (s + 1) * dA;

          ctx.fillStyle = (r + s) % 2 === 0 ? '#FFFFFF' : COLORS.hypno;

          ctx.beginPath();
          ctx.arc(0, 0, r1, a0, a1);
          ctx.arc(0, 0, r0, a1, a0, true);
          ctx.closePath();
          ctx.fill();
        }
      }

      ctx.restore();
    }

    let brushTargetX = null;
    let brushTargetY = null;
    let brushX = null;
    let brushY = null;
    let lastMoveTime = null;

    frameEl.addEventListener('mousemove', (e) => {
      const rect = frameEl.getBoundingClientRect();
      brushTargetX = e.clientX - rect.left;
      brushTargetY = e.clientY - rect.top;
      lastMoveTime = performance.now();
    });

    function applyDistortion(cx, cy, radius, strengthBase, t) {
      const w = bgCanvas.width;
      const h = bgCanvas.height;

      const sx = Math.max(0, Math.floor(cx - radius));
      const sy = Math.max(0, Math.floor(cy - radius));
      const ex = Math.min(w, Math.floor(cx + radius));
      const ey = Math.min(h, Math.floor(cy + radius));

      const sw = ex - sx;
      const sh = ey - sy;
      if (sw <= 0 || sh <= 0) return;

      const srcData = sceneCtx.getImageData(sx, sy, sw, sh);
      const src = srcData.data;
      const dstData = bgCtx.createImageData(sw, sh);
      const dst = dstData.data;

      const cxLocal = cx - sx;
      const cyLocal = cy - sy;

      for (let y0 = 0; y0 < sh; y0++) {
        for (let x0 = 0; x0 < sw; x0++) {
          const dx = x0 - cxLocal;
          const dy = y0 - cyLocal;
          const dist = Math.sqrt(dx * dx + dy * dy);

          const dstIndex = (y0 * sw + x0) * 4;

          if (dist > radius || dist === 0) {
            dst[dstIndex] = src[dstIndex];
            dst[dstIndex + 1] = src[dstIndex + 1];
            dst[dstIndex + 2] = src[dstIndex + 2];
            dst[dstIndex + 3] = src[dstIndex + 3];
            continue;
          }

          const rNorm = dist / radius;
          const edge = 1 - rNorm;

          const wave = Math.sin(12 * rNorm - t * 4) * strengthBase * edge * 23;
          const srcR = dist + wave;

          const nx = dx / dist;
          const ny = dy / dist;

          const srcXf = cxLocal + nx * srcR;
          const srcYf = cyLocal + ny * srcR;

          let sx0 = Math.round(srcXf);
          let sy0 = Math.round(srcYf);

          if (sx0 < 0) sx0 = 0;
          if (sx0 >= sw) sx0 = sw - 1;
          if (sy0 < 0) sy0 = 0;
          if (sy0 >= sh) sy0 = sh - 1;

          const srcIndex = (sy0 * sw + sx0) * 4;

          dst[dstIndex] = src[srcIndex];
          dst[dstIndex + 1] = src[srcIndex + 1];
          dst[dstIndex + 2] = src[srcIndex + 2];
          dst[dstIndex + 3] = src[srcIndex + 3];
        }
      }

      bgCtx.putImageData(dstData, sx, sy);
    }

    function render(now) {
      const dt = now - last;
      last = now;
      time += dt;

      const w = bgCanvas.width;
      const h = bgCanvas.height;

      bgAngle += BG_SPEED * dt;
      centerAngle += CENTER_SPEED * dt;

      sceneCtx.clearRect(0, 0, w, h);
      sceneCtx.fillStyle = COLORS.background;
      sceneCtx.fillRect(0, 0, w, h);

      drawRays(sceneCtx, w, h, bgAngle);
      drawHypnoCircle(sceneCtx, w, h, centerAngle);

      bgCtx.clearRect(0, 0, w, h);
      bgCtx.drawImage(sceneCanvas, 0, 0);

      if (lastMoveTime !== null) {
        const nowT = performance.now();
        const FADE_MS = 2600;

        const age = nowT - lastMoveTime;
        if (age < FADE_MS) {
          const fade = 1 - age / FADE_MS;

          if (brushTargetX !== null && brushTargetY !== null) {
            if (brushX === null) {
              brushX = brushTargetX;
              brushY = brushTargetY;
            } else {
              brushX += (brushTargetX - brushX) * 0.8;
              brushY += (brushTargetY - brushY) * 0.8;
            }
          }

          if (brushX !== null && brushY !== null) {
            const brushRadius = Math.min(w, h) * 0.32;
            const strengthBase = 0.8 * fade;
            const t = time * 0.007;
            applyDistortion(brushX, brushY, brushRadius, strengthBase, t);
          }
        }
      }

      requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
  })();

  /* =========================
     2) GLITCH (hover)
========================= */
  document.addEventListener('DOMContentLoaded', () => {
    const chars = 'belqitebelqitebelqite';
    const interval = 30;

    const glitchElements = document.querySelectorAll(
      '.go, .bro1, .bro2, .bro3, .bro4, .bro5, .site-header__cta'
    );

    glitchElements.forEach((el) => {
      const originalText = el.dataset.text || el.textContent;
      let lock = false;

      el.addEventListener('mouseenter', () => {
        if (lock) return;
        lock = true;

        let frame = 0;
        const length = originalText.length;
        const randomChar = () =>
          chars[Math.floor(Math.random() * chars.length)];

        const id = setInterval(() => {
          let output = '';
          for (let i = 0; i < length; i++)
            output += i < frame ? originalText[i] : randomChar();
          el.textContent = output;

          frame++;
          if (frame > length) {
            clearInterval(id);
            el.textContent = originalText;
            lock = false;
          }
        }, interval);
      });
    });
  });

  /* =========================
     3) PARALLAX
========================= */
  (() => {
    const area = document.querySelector('.bibi1');
    if (!area) return;

    let targetX = 0,
      targetY = 0;
    let currentX = 0,
      currentY = 0;
    const maxMove = 55;

    area.addEventListener('mousemove', (e) => {
      const r = area.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      targetX = nx * maxMove;
      targetY = ny * maxMove;
    });

    area.addEventListener('mouseleave', () => {
      targetX = 0;
      targetY = 0;
    });

    function tick() {
      currentX += (targetX - currentX) * 0.52;
      currentY += (targetY - currentY) * 0.52;
      document.documentElement.style.setProperty('--mx', `${currentX}px`);
      document.documentElement.style.setProperty('--my', `${currentY}px`);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  })();

  /* =========================
     4) CLOUDS + HEADER (один observer вместо двух)
========================= */
  (() => {
    const firstBlock = document.querySelector('.bibi1');
    const clouds = document.querySelector('.cloud-overlay');
    const header = document.getElementById('siteHeader');

    if (!firstBlock || !clouds || !header) return;

    let cloudsShown = false;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // мы в первом блоке — шапку скрываем
          header.classList.remove('is-visible');
        } else {
          // ушли с первого блока
          if (!cloudsShown) {
            cloudsShown = true;
            clouds.classList.add('is-visible');
            setTimeout(() => header.classList.add('is-visible'), 800);
          } else {
            header.classList.add('is-visible');
          }
        }
      },
      { threshold: 0.6 }
    );

    io.observe(firstBlock);
  })();

  /* =========================
     5) PLAYER (без AbortError, с GitHub Pages BASE)
========================= */
  (() => {
    const audio = document.getElementById('audio');
    const playBtn = document.getElementById('playBtn');
    const playIcon = document.getElementById('playIcon');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const volumeRange = document.getElementById('volumeRange');

    if (!audio || !playBtn || !playIcon || !prevBtn || !nextBtn || !volumeRange)
      return;

    const tracks = [
      url('music/track1.mp3'),
      url('music/track2.mp3'),
      url('music/track3.mp3'),
      url('music/track4.mp3'),
      url('music/track5.mp3'),
    ];

    const ICON_PLAY = url('images/play.svg');
    const ICON_PAUSE = url('images/pause.svg');

    let currentTrack = 0;
    let lock = false;

    function loadTrack(index) {
      audio.src = tracks[index];
      audio.load();
    }

    function setIcon(isPlaying) {
      playIcon.src = isPlaying ? ICON_PAUSE : ICON_PLAY;
    }

    // синхронизация состояния с реальными событиями
    audio.addEventListener('play', () => setIcon(true));
    audio.addEventListener('pause', () => setIcon(false));
    audio.addEventListener('ended', () => setIcon(false));

    loadTrack(currentTrack);
    audio.volume = Number(volumeRange.value || 0.6);
    setIcon(false);

    async function safePlay() {
      try {
        await audio.play();
      } catch (e) {
        // AbortError/NotAllowedError — не ломаем консолью
        if (e?.name !== 'AbortError') console.warn('Audio play blocked:', e);
      }
    }

    playBtn.addEventListener('click', async () => {
      if (lock) return;
      lock = true;
      setTimeout(() => (lock = false), 120);

      if (audio.paused) await safePlay();
      else audio.pause();
    });

    nextBtn.addEventListener('click', async () => {
      currentTrack = (currentTrack + 1) % tracks.length;
      loadTrack(currentTrack);
      await safePlay();
    });

    prevBtn.addEventListener('click', async () => {
      currentTrack = (currentTrack - 1 + tracks.length) % tracks.length;
      loadTrack(currentTrack);
      await safePlay();
    });

    volumeRange.addEventListener('input', () => {
      audio.volume = Number(volumeRange.value);
    });
  })();

  /* =========================
     6) LIQUID (если есть svg-фильтр внутри .card__imgwrap.liquid)
========================= */
  (() => {
    const wraps = document.querySelectorAll('.card__imgwrap.liquid');
    if (!wraps.length) return;

    wraps.forEach((wrap) => {
      const turb = wrap.querySelector('feTurbulence');
      const disp = wrap.querySelector('feDisplacementMap');
      if (!turb || !disp) return;

      let t = 0;
      function tick() {
        t += 0.01;
        const f = 0.012 + Math.sin(t) * 0.004;
        turb.setAttribute('baseFrequency', f.toFixed(4));

        const s = 16 + (Math.sin(t * 1.6) + 1) * 8;
        disp.setAttribute('scale', s.toFixed(1));

        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  })();

  /* =========================
     7) LIKE FUNNEL (сердечки)
========================= */
  (() => {
    const label = document.querySelector('.card--more .more__label');
    const card = document.querySelector('.card--more');
    const more = document.querySelector('.card--more .more');

    if (!label || !card) return;

    let running = false;
    let intervalId = null;

    const SETTINGS = {
      burstCount: 12,
      spawnEveryMs: 140,
      minRiseVw: 10,
      maxRiseVw: 18,
      funnelWidthVw: 12,
      driftCurve: 1.0,
    };

    function spawnHeart() {
      const rectCard = card.getBoundingClientRect();
      const rectLabel = label.getBoundingClientRect();

      const startX = rectLabel.left - rectCard.left + rectLabel.width / 2;
      const startY = rectLabel.top - rectCard.top + rectLabel.height / 2;

      const heart = document.createElement('img');
      heart.src = url('images/heart.svg');
      heart.className = 'like-heart';
      heart.style.left = `${startX}px`;
      heart.style.top = `${startY}px`;

      const sizeVW = 1.4 + Math.random() * 1.3;
      heart.style.width = `${sizeVW}vw`;
      heart.style.height = `${sizeVW}vw`;
      heart.style.opacity = '0';

      if (more) card.insertBefore(heart, more);
      else card.appendChild(heart);

      const vw = window.innerWidth / 100;

      const rise =
        (SETTINGS.minRiseVw +
          Math.random() * (SETTINGS.maxRiseVw - SETTINGS.minRiseVw)) *
        vw;

      const side = Math.random() < 0.5 ? -1 : 1;
      const spreadTop = Math.random() * SETTINGS.funnelWidthVw * vw * side;
      const spreadMid = spreadTop * 0.25;

      const rotate = -35 + Math.random() * 70;
      const duration = 1100 + Math.random() * 800;

      const x1 = spreadMid * SETTINGS.driftCurve;
      const y1 = -rise * 0.45;

      const x2 = spreadTop * SETTINGS.driftCurve;
      const y2 = -rise;

      const anim = heart.animate(
        [
          {
            transform: `translate(-50%, -50%) translate(0px, 0px) scale(0.5) rotate(0deg)`,
            opacity: 0,
          },
          {
            transform: `translate(-50%, -50%) translate(${x1}px, ${y1}px) scale(1.05) rotate(${
              rotate * 0.45
            }deg)`,
            opacity: 0.95,
            offset: 0.35,
          },
          {
            transform: `translate(-50%, -50%) translate(${x2}px, ${y2}px) scale(0.9) rotate(${rotate}deg)`,
            opacity: 0,
          },
        ],
        {
          duration,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'forwards',
        }
      );

      anim.onfinish = () => heart.remove();
      setTimeout(() => heart.remove(), duration + 250);
    }

    function startBurst() {
      if (running) return;
      running = true;

      for (let i = 0; i < SETTINGS.burstCount; i++) {
        setTimeout(spawnHeart, i * 45);
      }

      intervalId = setInterval(spawnHeart, SETTINGS.spawnEveryMs);
    }

    function stopBurst() {
      running = false;
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
    }

    label.addEventListener('mouseenter', startBurst);
    label.addEventListener('mouseleave', stopBurst);
    card.addEventListener('mouseleave', stopBurst);
  })();
})();
