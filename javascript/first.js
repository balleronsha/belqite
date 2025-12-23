(() => {
  const bgCanvas = document.getElementById('bgCanvas');
  const centerCanvas = document.getElementById('centerCanvas');

  if (!bgCanvas || !centerCanvas) {
    console.error('Canvas elements not found: #bgCanvas or #centerCanvas');
    return;
  }

  const bgCtx = bgCanvas.getContext('2d', { willReadFrequently: true });
  const centerCtx = centerCanvas.getContext('2d'); // сейчас не используется, но оставим

  // offscreen-канвас для чистой сцены
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

  /* Цвета */
  const COLORS = {
    background: '#FFFFFF',
    rayLight: '#FFFFFF',
    rayDark: '#FF7723',
    hypno: '#FF7723',
  };

  /* Параметры паттерна */
  const RINGS = 50;
  const SECTORS = 24;

  /* Скорости */
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

      // белый луч
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(radius, -rayWidth * 0.4);
      ctx.lineTo(radius, rayWidth * 0.4);
      ctx.closePath();
      ctx.fillStyle = COLORS.rayLight;
      ctx.fill();

      // оранжевая часть
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

    // белая подложка
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

  // положение кисти
  let brushTargetX = null;
  let brushTargetY = null;
  let brushX = null;
  let brushY = null;

  // время последнего движения мыши (для затухания)
  let lastMoveTime = null;

  const frameEl = document.querySelector('.hypno-frame');

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
          const srcIndex = dstIndex;
          dst[dstIndex] = src[srcIndex];
          dst[dstIndex + 1] = src[srcIndex + 1];
          dst[dstIndex + 2] = src[srcIndex + 2];
          dst[dstIndex + 3] = src[srcIndex + 3];
          continue;
        }

        const rNorm = dist / radius; // 0..1
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

    // рисуем чистую сцену
    sceneCtx.clearRect(0, 0, w, h);
    sceneCtx.fillStyle = COLORS.background;
    sceneCtx.fillRect(0, 0, w, h);

    drawRays(sceneCtx, w, h, bgAngle);
    drawHypnoCircle(sceneCtx, w, h, centerAngle);

    // выводим сцену
    bgCtx.clearRect(0, 0, w, h);
    bgCtx.drawImage(sceneCanvas, 0, 0);

    // искажение после движения мыши
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

// Глитчик для текста соооочныыый
document.addEventListener('DOMContentLoaded', () => {
  const chars = 'belqitebelqitebelqite';
  const glitchDuration = 500;
  const interval = 30;

  const glitchElements = document.querySelectorAll(
    '.go, .bro1, .bro2, .bro3, .bro4, .bro5, .site-header__cta '
  );

  glitchElements.forEach((el) => {
    const originalText = el.dataset.text || el.textContent;

    el.addEventListener('mouseenter', () => {
      let frame = 0;
      const length = originalText.length;

      const randomChar = () => chars[Math.floor(Math.random() * chars.length)];

      const glitchInterval = setInterval(() => {
        let output = '';

        for (let i = 0; i < length; i++) {
          if (i < frame) {
            output += originalText[i];
          } else {
            output += randomChar();
          }
        }

        el.textContent = output;

        frame++;

        if (frame > length) {
          clearInterval(glitchInterval);
          el.textContent = originalText;
        }
      }, interval);
    });
  });
});
// ПАРАЛЛАКС
(() => {
  const area = document.querySelector('.bibi1');
  if (!area) return;

  let targetX = 0,
    targetY = 0;
  let currentX = 0,
    currentY = 0;

  const maxMove = 55; // сила движения (px)

  area.addEventListener('mousemove', (e) => {
    const r = area.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1; // -1..1
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1; // -1..1
    targetX = nx * maxMove;
    targetY = ny * maxMove;
  });

  area.addEventListener('mouseleave', () => {
    targetX = 0;
    targetY = 0;
  });

  function tick() {
    currentX += (targetX - currentX) * 0.52; // плавность
    currentY += (targetY - currentY) * 0.52;

    document.documentElement.style.setProperty('--mx', `${currentX}px`);
    document.documentElement.style.setProperty('--my', `${currentY}px`);

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
})();
//
//
//ОТВЕЧАЮ
(() => {
  const target = document.querySelector('.perehod'); // секция, которая появляется
  const clouds = document.querySelector('.cloud-overlay');
  if (!target || !clouds) return;

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        clouds.classList.add('is-visible');
        observer.disconnect();
      }
    },
    { threshold: 0.15 }
  );

  observer.observe(target);
})();
// ШАППППКА
// ОБЛАКА (1 раз) + ШАПКА (появляется/пропадает в зависимости от .bibi1)
(() => {
  const firstBlock = document.querySelector('.bibi1');
  const clouds = document.querySelector('.cloud-overlay');
  const header = document.getElementById('siteHeader');

  if (!firstBlock || !clouds || !header) {
    console.warn('Not found:', { firstBlock, clouds, header });
    return;
  }

  let cloudsShown = false;

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        header.classList.remove('is-visible');
      } else {
        if (!cloudsShown) {
          cloudsShown = true;
          clouds.classList.add('is-visible');
          setTimeout(() => header.classList.add('is-visible'), 800);
        } else {
          header.classList.add('is-visible');
        }
      }
    },
    {
      threshold: 0.6,
    }
  );

  observer.observe(firstBlock);
})();
// ПРОИГРЫВАТЕЛЬ
// ПРОИГРЫВАТЕЛЬ
(() => {
  const tracks = [
    '../music/track1.mp3',
    '../music/track2.mp3',
    '../music/track3.mp3',
    '../music/track4.mp3',
    '../music/track5.mp3',
  ];

  const audio = document.getElementById('audio');

  const playBtn = document.getElementById('playBtn');
  const playIcon = document.getElementById('playIcon');

  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');

  const volumeRange = document.getElementById('volumeRange');

  const ICON_PLAY = './images/play.svg';
  const ICON_PAUSE = './images/pause.svg';

  let currentTrack = 0;

  function loadTrack(index) {
    audio.src = tracks[index];
    audio.load();
  }

  function setPlayState(isPlaying) {
    playIcon.src = isPlaying ? ICON_PAUSE : ICON_PLAY;
  }

  loadTrack(currentTrack);
  audio.volume = Number(volumeRange.value || 0.6);
  setPlayState(false);

  playBtn.addEventListener('click', async () => {
    try {
      if (audio.paused) {
        await audio.play();
        setPlayState(true);
      } else {
        audio.pause();
        setPlayState(false);
      }
    } catch (e) {
      console.error('Audio error:', e);
    }
  });

  nextBtn.addEventListener('click', async () => {
    currentTrack = (currentTrack + 1) % tracks.length;
    loadTrack(currentTrack);
    try {
      await audio.play();
      setPlayState(true);
    } catch {}
  });

  prevBtn.addEventListener('click', async () => {
    currentTrack = (currentTrack - 1 + tracks.length) % tracks.length;
    loadTrack(currentTrack);
    try {
      await audio.play();
      setPlayState(true);
    } catch {}
  });

  volumeRange.addEventListener('input', () => {
    audio.volume = Number(volumeRange.value);
  });

  audio.addEventListener('ended', () => {
    setPlayState(false);
  });
})();
//
//
//
//
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

      // мягкое дыхание частоты шума
      const f = 0.012 + Math.sin(t) * 0.004;
      turb.setAttribute('baseFrequency', f.toFixed(4));

      // плавное "плывёт"
      const s = 16 + (Math.sin(t * 1.6) + 1) * 8; // 16..32
      disp.setAttribute('scale', s.toFixed(1));

      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
})();
// СЕРДЕФФФФФФККИИИИ
// LIKE-FUNNEL: hearts from ONE point -> вверх -> расширяются "воронкой"
(() => {
  const label = document.querySelector('.card--more .more__label');
  const card = document.querySelector('.card--more');
  const more = document.querySelector('.card--more .more');

  if (!label || !card) return;

  let running = false;
  let intervalId = null;

  // настройки "воронки"
  const SETTINGS = {
    burstCount: 12, // сколько сердечек сразу
    spawnEveryMs: 140, // частота потока (меньше = больше сердечек)
    minRiseVw: 10, // минимальная высота полёта
    maxRiseVw: 18, // максимальная высота полёта
    funnelWidthVw: 12, // ширина воронки НАВЕРХУ (делай больше = шире)
    driftCurve: 1.0, // 0.7 мягче, 1.2 агрессивнее
  };

  function spawnHeart() {
    const rectCard = card.getBoundingClientRect();
    const rectLabel = label.getBoundingClientRect();

    // старт: центр label относительно card
    const startX = rectLabel.left - rectCard.left + rectLabel.width / 2;
    const startY = rectLabel.top - rectCard.top + rectLabel.height / 2;

    const heart = document.createElement('img');
    heart.src = './images/heart.svg';
    heart.className = 'like-heart';

    heart.style.left = `${startX}px`;
    heart.style.top = `${startY}px`;

    const sizeVW = 1.4 + Math.random() * 1.3; // размер
    heart.style.width = `${sizeVW}vw`;
    heart.style.height = `${sizeVW}vw`;
    heart.style.opacity = '0';

    // вставляем под текстом
    if (more) card.insertBefore(heart, more);
    else card.appendChild(heart);

    const vw = window.innerWidth / 100;

    // высота полёта
    const rise =
      (SETTINGS.minRiseVw +
        Math.random() * (SETTINGS.maxRiseVw - SETTINGS.minRiseVw)) *
      vw;

    // "воронка": чем выше — тем шире отклонение по X
    // выбираем "сторону" и силу
    const side = Math.random() < 0.5 ? -1 : 1;
    const spreadTop = Math.random() * SETTINGS.funnelWidthVw * vw * side; // отклонение вверху

    // небольшое начальное отклонение (почти 0, чтобы старт был из одной точки)
    const spreadMid = spreadTop * 0.25;

    const rotate = -35 + Math.random() * 70;
    const duration = 1100 + Math.random() * 800;

    // немного "пузырькового" дрейфа (вверх + чуть вбок)
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

    // стартовый “салют”
    for (let i = 0; i < SETTINGS.burstCount; i++) {
      setTimeout(spawnHeart, i * 45);
    }

    // поток пока hover
    intervalId = setInterval(spawnHeart, SETTINGS.spawnEveryMs);
  }

  function stopBurst() {
    running = false;
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
  }

  // триггер именно от текста
  label.addEventListener('mouseenter', startBurst);
  label.addEventListener('mouseleave', stopBurst);
  card.addEventListener('mouseleave', stopBurst);
})();
