// UMBRA site: navigation, the entity-detection demo, the lazy hero scene and scroll choreography.
const root = document.documentElement;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const gsap = window.gsap;
const ST = window.ScrollTrigger;
const motion = !reduced && !!gsap && !!ST;
if (!motion) root.classList.remove("motion"); // never leave content hidden without the animation engine
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

/* ── split headings into word masks ─────────────────────────────────────── */
for (const el of $$(".split")) {
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.append(" "); return; }
          const w = document.createElement("span");
          w.className = "w";
          const inner = document.createElement("span");
          inner.textContent = part;
          w.append(inner);
          frag.append(w);
        });
        child.replaceWith(frag);
      } else if (child.nodeType === 1 && !child.classList.contains("w")) walk(child);
    }
  };
  el.setAttribute("aria-label", el.textContent.replace(/\s+/g, " ").trim());
  walk(el);
  for (const w of $$(".w", el)) w.setAttribute("aria-hidden", "true");
}

/* ── nav ─────────────────────────────────────────────────────────────────── */
const nav = $("#nav");
let lastY = 0;
addEventListener("scroll", () => {
  const y = scrollY;
  nav.classList.toggle("solid", y > 24);
  nav.classList.toggle("hide", y > innerHeight * 0.9 && y > lastY + 4);
  if (y < lastY - 4) nav.classList.remove("hide");
  lastY = y;
}, { passive: true });

const links = new Map($$(".nav-links a").map((a) => [a.getAttribute("href").slice(1), a]));
const spy = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    let id = e.target.id;
    if (id === "sherlock") id = "pivot";
    if (id === "tools" || id === "image") id = "overview";
    links.forEach((a, k) => a.setAttribute("aria-current", String(k === id)));
  }
}, { rootMargin: "-45% 0px -50% 0px" });
$$("main > section[id]").forEach((s) => spy.observe(s));

/* ── entity detection demo (rules ported from the app: src/lib/entities.ts) ── */
const TYPES = [
  ["person", "Персона", 8], ["username", "Никнейм", 12], ["email", "Email", 7], ["phone", "Телефон", 5],
  ["domain", "Домен", 11], ["ip", "IP-адрес", 7], ["url", "URL", 4], ["organization", "Организация", 6],
  ["location", "Локация", 4], ["image", "Изображение", 4], ["crypto", "Криптокошелёк", 4], ["other", "Прочее", 4],
];
function detectEntity(raw) {
  const q = raw.trim();
  if (!q) return "username";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(q)) return "email";
  if (/^https?:\/\/\S+\.(jpe?g|png|webp|gif|bmp|avif)(\?\S*)?$/i.test(q)) return "image";
  if (/^https?:\/\//i.test(q)) return "url";
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(q) || (/^[0-9a-f:]{6,}$/i.test(q) && q.includes(":"))) return "ip";
  if (/^-?\d{1,2}\.\d+\s*,\s*-?\d{1,3}\.\d+$/.test(q)) return "location";
  if (/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(q) || /^0x[a-fA-F0-9]{40}$/.test(q)) return "crypto";
  if (/^\+?[\d\s\-()]{7,}$/.test(q) && q.replace(/\D/g, "").length >= 7) return "phone";
  if (/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(q)) return "domain";
  if (/\s/.test(q)) return "person";
  return "username";
}
const probe = $("#probe");
const typesEl = $("#types");
const verdict = $("#verdict");
typesEl.innerHTML = TYPES.map(([id, name]) => `<span data-t="${id}">${name}</span>`).join("");
function updateProbe() {
  const v = probe.value;
  const t = detectEntity(v);
  const [, name, n] = TYPES.find((x) => x[0] === t);
  $$("span", typesEl).forEach((s) => s.classList.toggle("on", s.dataset.t === t));
  verdict.innerHTML = v.trim()
    ? `<span>Тип: <b>${name}</b></span><span><b>${n}</b> ${plural(n)} в наборе пивотов</span>`
    : `<span>Введите значение</span><span></span>`;
}
const plural = (n) => (n % 10 === 1 && n % 100 !== 11 ? "источник" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "источника" : "источников");
probe.addEventListener("input", updateProbe);
$$(".samples button").forEach((b) => b.addEventListener("click", () => { probe.value = b.textContent; updateProbe(); probe.focus(); }));
updateProbe();

/* ── board 2D / 3D ───────────────────────────────────────────────────────── */
const boardStage = $("#boardStage");
$$(".switch button").forEach((b) => b.addEventListener("click", () => {
  const is3d = b.dataset.mode === "3d";
  boardStage.classList.toggle("is-3d", is3d);
  $$(".switch button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  $("#boardModeCap").textContent = is3d ? "3D" : "2D";
}));

/* ── hero scene (lazy, WebGL only) ──────────────────────────────────────── */
const stage = $("#stage");
const hasWebGL = (() => {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
})();
let hero = null;
let heroProgress = 0;
if (!hasWebGL) stage.classList.add("no-webgl");
else {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.opacity = "0";
  canvas.style.transition = "opacity 1.6s cubic-bezier(.22,1,.36,1)";
  stage.prepend(canvas);
  const mobile = matchMedia("(max-width: 900px), (pointer: coarse)").matches;
  import("./hero-scene.js")
    .then(({ createHero }) => {
      hero = createHero(canvas, { reduced, mobile });
      hero.setScroll(heroProgress);
      const io = new IntersectionObserver(([e]) => (e.isIntersecting ? hero.start() : hero.stop()));
      io.observe(stage);
      requestAnimationFrame(() => (canvas.style.opacity = "1"));
      addEventListener("resize", () => hero.resize());
      if (!mobile) addEventListener("pointermove", (e) => hero.setPointer(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight * 2 - 1)), { passive: true });
    })
    .catch((err) => { console.warn("hero scene unavailable", err); canvas.remove(); stage.classList.add("no-webgl"); });
}

/* ── local-first diagram pulses ─────────────────────────────────────────── */
function runFlowPulses() {
  const svg = $(".flow-desktop svg");
  if (!svg || reduced) return;
  const w = ["w1", "w2", "w3"].map((id) => $("#" + id, svg));
  const w4 = $("#w4", svg);
  const p1 = $("#p1", svg), p2 = $("#p2", svg);
  const lens = w.map((p) => p.getTotalLength());
  let t0 = performance.now(), visible = false, raf = 0;
  const place = (c, path, len, f) => { const pt = path.getPointAtLength(len * f); c.setAttribute("cx", pt.x); c.setAttribute("cy", pt.y); };
  function frame(now) {
    const d = ((now - t0) / 4200) % 1;
    // p1 walks UI → sync → db → backups; p2 mirrors the last hop to export
    const seg = [0.0, 0.3, 0.38, 0.68, 0.76, 1.0]; // wire1, box, wire2, box, wire3
    const show = (c, on) => c.setAttribute("opacity", on ? 1 : 0);
    if (d < seg[1]) { show(p1, 1); place(p1, w[0], lens[0], d / seg[1]); }
    else if (d < seg[2]) show(p1, 0);
    else if (d < seg[3]) { show(p1, 1); place(p1, w[1], lens[1], (d - seg[2]) / (seg[3] - seg[2])); }
    else if (d < seg[4]) show(p1, 0);
    else { show(p1, 1); place(p1, w[2], lens[2], (d - seg[4]) / (seg[5] - seg[4])); }
    if (d >= seg[4]) { show(p2, 1); place(p2, w4, w4.getTotalLength(), (d - seg[4]) / (seg[5] - seg[4])); } else show(p2, 0);
    if (visible) raf = requestAnimationFrame(frame);
  }
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) { t0 = performance.now(); raf = requestAnimationFrame(frame); } else cancelAnimationFrame(raf);
  }).observe(svg);
}
runFlowPulses();

/* ── scroll choreography ────────────────────────────────────────────────── */
if (motion) {
  gsap.registerPlugin(ST);
  gsap.defaults({ ease: "expo.out" });

  // hero entrance
  const tl = gsap.timeline({ delay: 0.15 });
  tl.from("[data-hero-title] .w > span", { yPercent: 110, duration: 1.4, stagger: 0.06 })
    .from("[data-hero]", { y: 24, opacity: 0, duration: 1.2, stagger: 0.1 }, 0.35);

  // hero → next: the scene dollies in and fades as the page takes over
  ST.create({
    trigger: ".hero", start: "top top", end: "bottom top", scrub: true,
    onUpdate: (s) => { heroProgress = s.progress; if (hero) hero.setScroll(s.progress); },
  });
  gsap.to(".hero .container", { yPercent: -18, opacity: 0, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
  gsap.to(".hero-stage", { opacity: 0.15, ease: "none", scrollTrigger: { trigger: ".hero", start: "40% top", end: "bottom top", scrub: true } });

  // Reveals use IntersectionObserver, not trigger positions: content must appear even if the
  // layout shifts (fonts, images) or the visitor jumps straight to an anchor.
  const queue = [];
  let flushing = 0;
  const flush = () => {
    flushing = 0;
    const els = queue.splice(0);
    gsap.to(els, { opacity: 1, y: 0, duration: 1.1, stagger: 0.07, overwrite: true });
  };
  const revealIO = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      revealIO.unobserve(e.target);
      if (e.target.classList.contains("split")) {
        gsap.fromTo($$(".w > span", e.target), { yPercent: 110 }, { yPercent: 0, duration: 1.2, stagger: 0.05 });
      } else {
        queue.push(e.target);
        flushing ||= requestAnimationFrame(flush);
      }
    }
  }, { rootMargin: "0px 0px -10% 0px" });
  for (const h of $$(".split:not([data-hero-title])")) { gsap.set($$(".w > span", h), { yPercent: 110 }); revealIO.observe(h); }
  $$("[data-reveal]").forEach((el) => revealIO.observe(el));

  const mm = gsap.matchMedia();
  mm.add("(min-width: 901px)", () => {
    // overview: the screenshot unfolds from a tilted plane
    gsap.fromTo("#overviewFrame", { rotateX: 24, scale: 0.86, y: 40, opacity: 0.5 }, {
      rotateX: 0, scale: 1, y: 0, opacity: 1, ease: "none",
      scrollTrigger: { trigger: "#overviewFrame", start: "top 95%", end: "top 25%", scrub: 0.6 },
    });

    // sherlock: pinned replay of a real run (nickname "blue")
    const run = { checked: 417, found: 198, absent: 167, sec: 55 };
    const elChecked = $("#shChecked"), elFound = $("#shFound"), elAbsent = $("#shAbsent"), elTime = $("#shTime"), bar = $("#shBar");
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
    gsap.set("#shDone", { opacity: 0 });
    const shTl = gsap.timeline({
      scrollTrigger: { trigger: "#sherlock .pin", start: "top top", end: "+=160%", pin: true, scrub: 0.5, anticipatePin: 1 },
    });
    const state = { p: 0 };
    shTl.to(state, {
      p: 1, ease: "none", duration: 1,
      onUpdate: () => {
        const p = state.p;
        // checks finish quickly at first and slow down at the tail, like a real scan
        const done = 1 - Math.pow(1 - p, 2.2);
        elChecked.textContent = Math.round(run.checked * done);
        elFound.textContent = Math.round(run.found * done);
        elAbsent.textContent = Math.round(run.absent * done);
        elTime.textContent = fmt(run.sec * p);
        bar.style.transform = `scaleX(${done})`;
      },
    }, 0);
    shTl.to("#shDone", { opacity: 1, duration: 0.18, ease: "power1.inOut" }, 0.78);
    shTl.to("#shScan", { opacity: 0, duration: 0.18, ease: "power1.inOut" }, 0.78);
    shTl.from(".sh-shots", { y: 60, scale: 0.96, duration: 0.3, ease: "power2.out" }, 0);
    return () => {
      // back to the finished numbers when the layout changes
      elChecked.textContent = run.checked; elFound.textContent = run.found; elAbsent.textContent = run.absent; elTime.textContent = fmt(run.sec);
      bar.style.transform = "scaleX(1)";
    };
  });
  mm.add("(max-width: 900px)", () => { $("#shBar").style.transform = "scaleX(1)"; gsap.set("#shDone", { opacity: 1 }); gsap.set("#shScan", { opacity: 0 }); });

  // layered depth on overlaid UI crops
  for (const el of $$("[data-depth]")) {
    gsap.fromTo(el, { y: 80 }, { y: -40, ease: "none", scrollTrigger: { trigger: el.parentElement, start: "top bottom", end: "bottom top", scrub: true } });
  }

  // tools: count up to the real catalogue size
  const num = $("[data-count]");
  const n = { v: 0 };
  gsap.to(n, { v: +num.dataset.count, duration: 1.6, ease: "power3.out", scrollTrigger: { trigger: num, start: "top 85%" }, onUpdate: () => (num.textContent = Math.round(n.v)) });

  // local-first: wires draw in
  for (const p of $$(".flow .wire")) {
    const len = p.getTotalLength();
    gsap.fromTo(p, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.4, ease: "power2.inOut", scrollTrigger: { trigger: ".flow", start: "top 75%" } });
  }
  gsap.from(".flow .node", { opacity: 0, y: 16, duration: 1, stagger: 0.12, scrollTrigger: { trigger: ".flow", start: "top 75%" } });

  // download: the eclipse rises out of the dark
  gsap.fromTo(".eclipse", { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, ease: "none", scrollTrigger: { trigger: ".download", start: "top bottom", end: "center center", scrub: true } });

  // keep pinned/scrubbed sections aligned when the page height changes (fonts, images)
  let refreshT = 0, lastH = document.body.scrollHeight;
  new ResizeObserver(() => {
    const h = document.body.scrollHeight;
    if (Math.abs(h - lastH) < 2) return;
    lastH = h;
    clearTimeout(refreshT);
    refreshT = setTimeout(() => ST.refresh(), 150);
  }).observe(document.body);
  addEventListener("load", () => ST.refresh());
} else {
  $("#shBar").style.transform = "scaleX(1)";
  const done = $("#shDone");
  if (done) done.style.opacity = "1";
  const scan = $("#shScan");
  if (scan) scan.style.opacity = "0";
}
