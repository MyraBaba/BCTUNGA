/* BCTUNGA — etkileşim katmanı
   1) Kaydırma ilerleme çubuğu (scroll-timeline desteklenmiyorsa)
   2) Görünürlükte açılan bölümler
   3) Metrik sayaçları
   4) Hero veri hattı simülasyonu (cyan ham veri -> kırmızı şifreli akış) */

(() => {
  "use strict";

  // JS çalışıyor işareti: .reveal gizlemesi yalnızca bu sınıf varken uygulanır
  document.documentElement.classList.add("js");

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- 1. Kaydırma ilerleme çubuğu ---------- */

  const scrollBar = document.getElementById("scroll-bar");
  const hasScrollTimeline =
    typeof CSS !== "undefined" && CSS.supports("animation-timeline: scroll()");

  if (scrollBar && !hasScrollTimeline) {
    let ticking = false;
    const updateBar = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? Math.min(doc.scrollTop / max, 1) : 0;
      scrollBar.style.transform = `scaleX(${ratio})`;
      ticking = false;
    };
    window.addEventListener(
      "scroll",
      () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(updateBar);
        }
      },
      { passive: true },
    );
    updateBar();
  }

  /* ---------- 2. Görünürlükte açılan bölümler ---------- */

  const revealItems = document.querySelectorAll(".reveal");

  if (revealItems.length > 0 && "IntersectionObserver" in window && !reducedMotion.matches) {
    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("show");
          obs.unobserve(entry.target);
        });
      },
      { threshold: 0.18, rootMargin: "0px 0px -40px 0px" },
    );

    revealItems.forEach((item, index) => {
      item.style.transitionDelay = `${Math.min((index % 4) * 70, 280)}ms`;
      observer.observe(item);
    });
  } else {
    revealItems.forEach((item) => item.classList.add("show"));
  }

  /* ---------- 3. Metrik sayaçları ---------- */

  const counters = document.querySelectorAll("[data-count]");

  const animateCounter = (node) => {
    const target = Number(node.dataset.count || 0);
    const decimals = Number(node.dataset.decimals || 0);
    const duration = 1400;
    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      node.textContent = (target * eased).toFixed(decimals).replace(".", ",");
      if (progress < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  };

  if (counters.length > 0) {
    if (reducedMotion.matches || !("IntersectionObserver" in window)) {
      counters.forEach((node) => {
        node.textContent = Number(node.dataset.count || 0)
          .toFixed(Number(node.dataset.decimals || 0))
          .replace(".", ",");
      });
    } else {
      const counterObserver = new IntersectionObserver(
        (entries, obs) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            animateCounter(entry.target);
            obs.unobserve(entry.target);
          });
        },
        { threshold: 0.6 },
      );
      counters.forEach((counter) => counterObserver.observe(counter));
    }
  }

  /* ---------- 4. Hero veri hattı simülasyonu ---------- */

  const canvas = document.getElementById("pipeline");
  const ctx = canvas ? canvas.getContext("2d") : null;

  if (canvas && ctx) {
    const CYAN = [63, 208, 245];
    const RED = [255, 59, 92];

    let width = 0;
    let height = 0;
    let gateX = 0;
    let streamY = 0;
    let particles = [];
    let rafId = 0;
    let running = false;
    let inView = true;
    let lastTime = 0;

    const rand = (min, max) => min + Math.random() * (max - min);

    const spawn = (p, initial) => {
      p.x = initial ? rand(-30, width) : rand(-40, -10);
      p.y = streamY + rand(-0.42, 0.42) * height;
      p.v = rand(46, 92); // px/sn (geçit öncesi)
      p.wobble = rand(0.6, 1.6);
      p.seed = rand(0, Math.PI * 2);
      p.px = p.x;
      p.py = p.y;
      if (initial && p.x > gateX) {
        p.y = streamY + rand(-6, 6);
      }
      return p;
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const prevW = width;
      const prevH = height;
      width = Math.max(rect.width, 1);
      height = Math.max(rect.height, 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      gateX = width * 0.58;
      // Dar ekranda akış hattı metin bloğunun/CTA'nın altına insin
      streamY = height * (width < 700 ? 0.62 : 0.46);

      const target = Math.max(90, Math.min(230, Math.round(width / 7)));

      if (particles.length === 0 || !prevW || !prevH) {
        particles = Array.from({ length: target }, () => spawn({}, true));
        return;
      }

      // Alan yeniden saçılmasın: mevcut parçacıkları yeni boyuta ölçekle,
      // sayıyı hedefe yaklaştır (mobilde adres çubuğu resize'ları için önemli)
      const sx = width / prevW;
      const sy = height / prevH;
      for (const p of particles) {
        p.x *= sx;
        p.px *= sx;
        p.y *= sy;
        p.py *= sy;
      }
      while (particles.length < target) particles.push(spawn({}, false));
      if (particles.length > target) particles.length = target;
    };

    const mixColor = (mix, alpha) => {
      const r = Math.round(CYAN[0] + (RED[0] - CYAN[0]) * mix);
      const g = Math.round(CYAN[1] + (RED[1] - CYAN[1]) * mix);
      const b = Math.round(CYAN[2] + (RED[2] - CYAN[2]) * mix);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    const step = (p, dt, time) => {
      p.px = p.x;
      p.py = p.y;
      if (p.x < gateX) {
        p.x += p.v * dt;
        p.y += Math.sin(time * 0.0011 * p.wobble + p.seed) * 14 * dt;
      } else {
        p.x += p.v * 3.4 * dt;
        p.y += (streamY - p.y) * Math.min(1, dt * 7);
      }
      if (p.x > width + 40) spawn(p, false);
    };

    const drawGate = () => {
      // Dikey geçit çizgisi: akış hattı çevresinde yoğun, kenarlara doğru
      // erken sönümlenir; metrik şeridine ulaşmadan biter
      const mid = streamY / height;
      const glow = ctx.createLinearGradient(0, 0, 0, height);
      glow.addColorStop(0, "rgba(255, 59, 92, 0)");
      glow.addColorStop(Math.max(0, mid - 0.28), "rgba(255, 59, 92, 0.04)");
      glow.addColorStop(mid, "rgba(255, 59, 92, 0.26)");
      glow.addColorStop(Math.min(1, mid + 0.28), "rgba(255, 59, 92, 0.04)");
      glow.addColorStop(Math.min(1, mid + 0.42), "rgba(255, 59, 92, 0)");
      glow.addColorStop(1, "rgba(255, 59, 92, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(gateX - 0.5, 0, 1, height);

      // Geçit sonrası sürekli şifreli akış hattı
      const streamGlow = ctx.createLinearGradient(gateX, 0, width, 0);
      streamGlow.addColorStop(0, "rgba(255, 59, 92, 0.4)");
      streamGlow.addColorStop(1, "rgba(255, 59, 92, 0.1)");
      ctx.fillStyle = streamGlow;
      ctx.fillRect(gateX, streamY - 0.75, width - gateX, 1.5);

      const halo = ctx.createLinearGradient(gateX, 0, width, 0);
      halo.addColorStop(0, "rgba(255, 59, 92, 0.12)");
      halo.addColorStop(1, "rgba(255, 59, 92, 0.03)");
      ctx.fillStyle = halo;
      ctx.fillRect(gateX, streamY - 4, width - gateX, 8);
    };

    const drawParticles = () => {
      ctx.lineCap = "round";
      for (const p of particles) {
        const mix = Math.max(0, Math.min(1, (p.x - (gateX - 26)) / 52));
        const inStream = p.x >= gateX;
        const tail = (inStream ? p.v * 3.4 : p.v) * 0.1;
        ctx.strokeStyle = mixColor(mix, inStream ? 0.85 : 0.6);
        ctx.lineWidth = inStream ? 1.8 : 1.4;
        ctx.beginPath();
        ctx.moveTo(p.x - tail, p.py);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    };

    const frame = (time) => {
      if (!running) return;
      const dt = Math.min((time - lastTime) / 1000 || 0.016, 0.05);
      lastTime = time;

      ctx.clearRect(0, 0, width, height);
      drawGate();
      for (const p of particles) step(p, dt, time);
      drawParticles();

      rafId = requestAnimationFrame(frame);
    };

    const renderStatic = () => {
      ctx.clearRect(0, 0, width, height);
      drawGate();
      for (const p of particles) {
        p.px = p.x;
        p.py = p.y;
      }
      drawParticles();
    };

    const start = () => {
      if (running || !inView || reducedMotion.matches) return;
      running = true;
      lastTime = performance.now();
      rafId = requestAnimationFrame(frame);
    };

    const stop = () => {
      running = false;
      cancelAnimationFrame(rafId);
    };

    const applyMotionPreference = () => {
      if (reducedMotion.matches) {
        stop();
        renderStatic();
      } else {
        start();
      }
    };

    let resizeTimer = 0;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resize();
        if (reducedMotion.matches) renderStatic();
      }, 120);
    });

    if ("IntersectionObserver" in window) {
      const viewObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            inView = entry.isIntersecting;
            if (inView) start();
            else stop();
          });
        },
        { threshold: 0.02 },
      );
      viewObserver.observe(canvas);
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stop();
      else start();
    });

    if (typeof reducedMotion.addEventListener === "function") {
      reducedMotion.addEventListener("change", applyMotionPreference);
    } else if (typeof reducedMotion.addListener === "function") {
      reducedMotion.addListener(applyMotionPreference);
    }

    resize();
    applyMotionPreference();
  }
})();
