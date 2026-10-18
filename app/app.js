/* Ajdan Pavilion 360° tour — app logic (screens, i18n, plan, hotspots). */
(function () {
  "use strict";
  const C = window.TOUR_CONFIG;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const D2R = Math.PI / 180;
  const isFile = location.protocol === "file:";
  const params = new URLSearchParams(location.search);
  let devMode = params.has("dev");
  const touch = "ontouchstart" in window || navigator.maxTouchPoints > 0;

  /* ---------------- i18n ---------------- */
  const UI = {
    en: { footHint: "Best experienced in fullscreen", planEyebrow: "Top view", home: "Home", plan: "Top view",
      prev: "Previous point", next: "Next point", rotate: "Auto-rotate", gyro: "Move phone to look", vr: "VR headset mode",
      fullscreen: "Fullscreen", loading: "Loading 360° view", drag: "Drag to look around", points: (n) => `${n} viewpoints · 360°`,
      point: "Point", vrHint: "Place the phone in your headset · look at a gold ring to move",
      gyroDenied: "Motion sensor not available on this device", copied: "Copied: ",
      packErr: (f) => `<b>Panorama couldn't be loaded offline.</b><br><br>Browsers block 360 images opened straight from disk. Run <code>tools\\pack-panos.bat</code> once (after adding or replacing renders), then reopen <code>index.html</code>.<br><br>Missing: <code>${f}</code>` },
    ar: { footHint: "أفضل تجربة في وضع ملء الشاشة", planEyebrow: "المسقط العلوي", home: "الرئيسية", plan: "المسقط العلوي",
      prev: "النقطة السابقة", next: "النقطة التالية", rotate: "دوران تلقائي", gyro: "حرّك الهاتف للنظر", vr: "وضع نظارة الواقع الافتراضي",
      fullscreen: "ملء الشاشة", loading: "جارٍ تحميل العرض 360°", drag: "اسحب للنظر حولك", points: (n) => `${n} نقاط مشاهدة · 360°`,
      point: "نقطة", vrHint: "ضع الهاتف في النظارة · انظر إلى الحلقة الذهبية للانتقال",
      gyroDenied: "مستشعر الحركة غير متاح على هذا الجهاز", copied: "تم النسخ: ",
      packErr: (f) => `<b>تعذّر تحميل الصورة دون اتصال.</b><br><br>شغّل <code>tools\\pack-panos.bat</code> مرة واحدة ثم أعد فتح <code>index.html</code>.<br><br><code>${f}</code>` },
  };
  let lang = (() => { try { return localStorage.getItem("ajdan360.lang") || C.defaultLang || "en"; } catch (e) { return C.defaultLang || "en"; } })();
  const tx = (v) => (v && typeof v === "object") ? (v[lang] ?? v.en ?? "") : (v ?? "");
  const ui = (k) => UI[lang][k];
  const pick = (path) => path.split(".").reduce((o, k) => o && o[k], path.startsWith("ui.") ? { ui: UI[lang] } : C);

  function applyLang() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    $$("[data-t]").forEach((el) => { const v = pick(el.dataset.t); el.innerHTML = tx(v); });
    $$("[data-tip]").forEach((el) => { el.dataset.label = ui(el.dataset.tip.slice(3)); el.setAttribute("aria-label", el.dataset.label); });
    $$("[data-lang-toggle]").forEach((b) => b.textContent = lang === "ar" ? "EN" : "ع");
    $("#pointCount").textContent = ui("points")(C.scenes.length);
    $$("[data-brand]").forEach((b) => {
      b.innerHTML = C.brand.logo ? `<img src="${C.brand.logo}" alt="${tx(C.brand.name)}">`
        : `<span>${C.brand.name.en}</span><span class="bsep"></span><span class="ar">${C.brand.name.ar}</span>`;
    });
    document.title = `${tx(C.brand.name)} · 360°`;
    buildPlan(); buildMini();
    if (current) { setSceneTitle(); buildHotspots(); }
  }
  $$("[data-lang-toggle]").forEach((b) => b.addEventListener("click", () => {
    lang = lang === "ar" ? "en" : "ar";
    try { localStorage.setItem("ajdan360.lang", lang); } catch (e) {}
    applyLang();
  }));

  /* ---------------- screens ---------------- */
  function show(id) {
    $$(".screen").forEach((s) => s.classList.toggle("is-active", s.id === id));
    viewer && (viewer.active = id === "tour");
    if (id !== "tour") closeInfo();
  }

  /* ---------------- toast ---------------- */
  let toastT;
  function toast(msg, ms = 2600) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("is-on");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("is-on"), ms);
  }
  function copy(text) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).catch(() => {
      const a = document.createElement("textarea"); a.value = text; document.body.appendChild(a); a.select();
      try { document.execCommand("copy"); } catch (e) {} a.remove();
    });
    console.log("[360 dev]", text); toast(ui("copied") + text);
  }

  /* ---------------- landing ---------------- */
  $("#heroImg").src = C.landing.hero;
  $("#startBtn").addEventListener("click", () => show("map"));

  /* ---------------- plan (top view) ---------------- */
  const miniImg = $("#miniImg");
  let planImg = $("#planImg");
  const pad = (n) => String(n).padStart(2, "0");
  /* Panoramas are referenced by base name ("pano-07"); the real file can be .png, .jpg or .webp.
     packed/manifest.js (written by the update script) says which file exists for each name. */
  const baseOf = (f) => String(f).replace(/\.(png|jpe?g|webp)$/i, "");
  const fileOf = (f) => (window.PANO_FILES && window.PANO_FILES[baseOf(f)]) || (/\.\w+$/.test(f) ? f : f + ".jpg");
  const panoSrc = (f) => "assets/panos/" + fileOf(f);
  const thumbOf = (f) => (window.PANO_THUMBS && window.PANO_THUMBS[baseOf(f)]) ? `assets/panos/packed/thumbs/${baseOf(f)}.jpg?v=${window.PANO_THUMBS[baseOf(f)]}` : "";

  /* levels (floors). Older configs with a single topView.image still work. */
  const LEVELS = (C.levels && C.levels.length) ? C.levels : [{ id: "main", title: { en: "", ar: "" }, image: C.topView.image }];
  const levelOf = (s) => LEVELS.find((l) => l.id === s.level) || LEVELS[0];
  const aspect = {};
  LEVELS.forEach((l) => { const im = new Image(); im.onload = () => { aspect[l.id] = im.naturalWidth / im.naturalHeight; if (current) buildHotspots(); }; im.src = l.image; });
  const aspectOf = (l) => aspect[l.id] || 2;
  let planLevel = LEVELS[0].id;

  /* every floor plan is loaded once and kept decoded, so switching tabs is instant */
  const planLayers = {};
  $("#planImg").remove();
  LEVELS.forEach((l) => {
    const im = document.createElement("img");
    im.className = "plan-layer"; im.alt = ""; im.src = l.image;
    if (im.decode) im.decode().catch(() => {});      // decode up front so the first switch is instant too
    $("#plan").insertBefore(im, $("#pins")); planLayers[l.id] = im;
  });
  planImg = planLayers[LEVELS[0].id];
  function setPlanLevel(id) {
    planLevel = id; planImg = planLayers[id];
    $$(".level-tab").forEach((t) => t.classList.toggle("is-on", t.dataset.level === id));
    Object.keys(planLayers).forEach((k) => planLayers[k].classList.toggle("is-on", k === id));
    $$(".pin").forEach((p) => p.hidden = p.dataset.level !== id);
  }

  function buildPlan() {
    const pins = $("#pins"), list = $("#pointList"), tabs = $("#levelTabs");
    pins.innerHTML = ""; list.innerHTML = ""; tabs.innerHTML = "";
    tabs.hidden = LEVELS.length < 2;
    LEVELS.forEach((l) => {
      const t = document.createElement("button"); t.type = "button"; t.className = "level-tab"; t.dataset.level = l.id;
      t.innerHTML = `<span class="lt-name">${tx(l.title)}</span><span class="lt-count">${C.scenes.filter((s) => levelOf(s).id === l.id).length}</span>`;
      t.addEventListener("click", () => setPlanLevel(l.id));
      tabs.appendChild(t);
    });
    let lastLevel = null;
    C.scenes.forEach((s, i) => {
      const L = levelOf(s);
      const p = document.createElement("button");
      p.className = "pin"; p.type = "button"; p.dataset.id = s.id; p.dataset.level = L.id;
      p.style.left = s.map.x + "%"; p.style.top = s.map.y + "%";
      p.innerHTML = `<span class="p-dot">${pad(i + 1)}</span><span class="p-label">${tx(s.title)}</span>`;
      p.addEventListener("click", (e) => { e.stopPropagation(); enterScene(s.id); });
      pins.appendChild(p);
      if (LEVELS.length > 1 && L.id !== lastLevel) {
        const h = document.createElement("li"); h.className = "pl-level"; h.textContent = tx(L.title); list.appendChild(h); lastLevel = L.id;
      }
      const li = document.createElement("li");
      li.innerHTML = `<button type="button" data-id="${s.id}"><span class="thumb"${thumbOf(s.pano) ? ` style="background-image:url('${thumbOf(s.pano)}')"` : ""}></span>
        <span><span class="pl-num">${ui("point").toUpperCase()} ${pad(i + 1)}</span><span class="pl-name">${tx(s.title)}</span></span>
        <svg class="pl-go" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>`;
      const b = li.firstElementChild;
      b.addEventListener("click", () => enterScene(s.id));
      const hov = (on) => {
        b.classList.toggle("is-hover", on); p.classList.toggle("is-hover", on);
        if (on && L.id !== planLevel && b.matches(":hover")) setPlanLevel(L.id);
      };
      [b, p].forEach((el) => { el.addEventListener("mouseenter", () => hov(true)); el.addEventListener("mouseleave", () => hov(false)); });
      list.appendChild(li);
    });
    setPlanLevel(current ? levelOf(current).id : planLevel);
  }
  $("#plan").addEventListener("click", (e) => {
    if (!devMode) return;
    const r = planImg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width * 100).toFixed(1), y = ((e.clientY - r.top) / r.height * 100).toFixed(1);
    copy(`level: "${planLevel}", map: { x: ${x}, y: ${y} }`);
  });
  $("#mapHome").addEventListener("click", () => show("landing"));

  /* ---------------- mini-map ---------------- */
  function buildMini() {
    const box = $("#miniPins"); box.innerHTML = "";
    const L = current ? levelOf(current) : LEVELS[0];
    if (miniImg.getAttribute("src") !== L.image) miniImg.src = L.image;
    $("#miniLevel").textContent = tx(L.title); $("#miniLevel").hidden = LEVELS.length < 2;
    C.scenes.filter((s) => levelOf(s).id === L.id).forEach((s) => {
      const b = document.createElement("button");
      b.className = "mini-pin"; b.type = "button"; b.dataset.id = s.id; b.title = tx(s.title);
      b.style.left = s.map.x + "%"; b.style.top = s.map.y + "%";
      b.addEventListener("click", (e) => { e.stopPropagation(); if (!current || s.id !== current.id) go(s.id); });
      box.appendChild(b);
    });
    if (current) markMini();
  }
  function markMini() { $$(".mini-pin").forEach((b) => b.classList.toggle("is-current", b.dataset.id === current.id)); }
  $("#minimap").addEventListener("click", () => { if (current) setPlanLevel(levelOf(current).id); show("map"); });
  const cone = $("#miniCone");
  cone.innerHTML = `<defs><radialGradient id="coneGrad" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#dcb987" stop-opacity=".75"/><stop offset="1" stop-color="#dcb987" stop-opacity="0"/></radialGradient></defs><path id="conePath"/>`;
  function drawCone() {
    if (!current) return;
    // work in pixel-ish space so the cone isn't skewed by the aspect ratio
    const w = 100 * aspectOf(levelOf(current)), h = 100;
    cone.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const cx = current.map.x / 100 * w, cy = current.map.y / 100 * h;
    const head = (viewer.yaw - (current.mapNorth || 0)) * D2R;
    const H = $("#pano").clientHeight || 1, W = $("#pano").clientWidth || 1;
    const hf = 2 * Math.atan(Math.tan(viewer.fov * D2R / 2) * W / H);
    const R = 22, a0 = head - hf / 2, a1 = head + hf / 2;
    const p = (a) => `${(cx + Math.sin(a) * R).toFixed(2)} ${(cy - Math.cos(a) * R).toFixed(2)}`;
    const g = cone.querySelector("#coneGrad");
    g.setAttribute("cx", cx); g.setAttribute("cy", cy); g.setAttribute("r", R);
    cone.querySelector("#conePath").setAttribute("d", `M${cx} ${cy} L${p(a0)} A${R} ${R} 0 ${hf > Math.PI ? 1 : 0} 1 ${p(a1)} Z`);
  }

  /* ---------------- panorama loading ---------------- */
  const imgCache = new Map(); // file -> Promise<HTMLImageElement>
  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = () => { s.remove(); res(); }; s.onerror = () => { s.remove(); rej(); }; document.head.appendChild(s); });
  }
  function resolveSrc(file) {
    if (!isFile) return Promise.resolve(panoSrc(file));
    const key = baseOf(file);
    window.PANO_PACK = window.PANO_PACK || {};
    if (window.PANO_PACK[key]) return Promise.resolve(window.PANO_PACK[key]);
    return loadScript(`assets/panos/packed/${key}.js`).then(() => window.PANO_PACK[key] || panoSrc(file)).catch(() => panoSrc(file));
  }
  function preloadPano(file) {
    file = baseOf(file);
    if (imgCache.has(file)) return imgCache.get(file);
    const p = resolveSrc(file).then((src) => new Promise((res, rej) => {
      const im = new Image(); im.decoding = "async";
      im.onload = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => res(im));
      im.onerror = () => rej(new Error("load " + file)); im.src = src;
    }));
    imgCache.set(file, p);
    p.catch(() => imgCache.delete(file));
    // keep memory in check (8K panos are ~128 MB decoded each)
    if (imgCache.size > 4) imgCache.delete(imgCache.keys().next().value);
    return p;
  }

  /* ---------------- viewer ---------------- */
  let viewer, current = null, busy = false;
  try {
    viewer = new PanoViewer($("#pano"), { fov: C.viewer.startFov, minFov: C.viewer.minFov, maxFov: C.viewer.maxFov,
      autoRotate: C.viewer.autoRotate, autoRotateSpeed: C.viewer.autoRotateSpeed, autoRotateDelay: C.viewer.autoRotateDelay });
  } catch (e) {
    $("#errorBox").hidden = false; $("#errorBox").innerHTML = "<b>WebGL 2 is not available.</b><br>Please open the tour in a recent Chrome, Edge, Safari or Firefox.";
  }
  window.TOUR = { get viewer() { return viewer; }, go: (id) => go(id) };   // handy for debugging in the console
  const byId = (id) => C.scenes.find((s) => s.id === id);
  const idx = (s) => C.scenes.indexOf(s);

  /* Plans of different levels can be framed differently (e.g. the exterior plan is zoomed out).
     level.booth = the booth rectangle in % of that level's image; positions are compared in
     that shared "booth space" so arrows between levels still point the right way. */
  function toBooth(L, m) {
    const r = L.booth || { x0: 0, y0: 0, x1: 100, y1: 100 };
    return { u: (m.x - r.x0) / (r.x1 - r.x0), v: (m.y - r.y0) / (r.y1 - r.y0) };
  }
  function boothAspect(L) {
    const r = L.booth || { x0: 0, y0: 0, x1: 100, y1: 100 };
    return aspectOf(L) * (r.x1 - r.x0) / (r.y1 - r.y0);
  }
  function mapHeading(a, b) { // degrees, 0 = up on plan, clockwise. b may be a scene or { map } on a's level
    const La = levelOf(a), Lb = b.level ? levelOf(b) : La;
    const pa = toBooth(La, a.map), pb = toBooth(Lb, b.map);
    const dx = (pb.u - pa.u) * boothAspect(La), dy = (pb.v - pa.v);
    return Math.atan2(dx, -dy) / D2R;
  }
  const BOOTH = Object.assign({ widthM: 40, depthM: 18, eyeHeightM: 1.6 }, C.booth || {});
  function metersBetween(a, b) {
    const pa = toBooth(levelOf(a), a.map), pb = toBooth(b.level ? levelOf(b) : levelOf(a), b.map);
    return Math.hypot((pb.u - pa.u) * BOOTH.widthM, (pb.v - pa.v) * BOOTH.depthM);
  }
  function hsAngles(s, h) {
    if (h.type === "scene") {
      const t = byId(h.target);
      const yaw = h.yaw != null ? h.yaw : PanoViewer.wrap(mapHeading(s, t) + (s.mapNorth || 0));
      // walking arrows lie on the floor a few metres ahead, in the direction of the next point
      let dist = h.dist;
      if (dist == null && h.pitch != null && h.pitch < -5) dist = BOOTH.eyeHeightM / Math.tan(-h.pitch * D2R);
      if (dist == null) dist = Math.min(3.2, Math.max(1.9, metersBetween(s, t) * 0.5));
      return { yaw, pitch: -Math.atan(BOOTH.eyeHeightM / dist) / D2R, dist };
    }
    if (h.at && h.yaw == null) { // aim at a spot on the plan
      return { yaw: PanoViewer.wrap(mapHeading(s, { map: h.at }) + (s.mapNorth || 0)), pitch: h.pitch ?? -18 };
    }
    return { yaw: h.yaw || 0, pitch: h.pitch || 0 };
  }

  /* ---- perspective floor markers: map a flat square onto 4 projected floor points ---- */
  const MARK = 120;                       // css px of the marker element
  function squareToQuad(q) {
    const [x0, y0] = q[0], [x1, y1] = q[1], [x2, y2] = q[2], [x3, y3] = q[3];
    const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    let a, b, c, d, e, f, g, hh;
    if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) { a = x1 - x0; b = x2 - x1; c = x0; d = y1 - y0; e = y2 - y1; f = y0; g = hh = 0; }
    else {
      const den = dx1 * dy2 - dx2 * dy1;
      g = (dx3 * dy2 - dx2 * dy3) / den; hh = (dx1 * dy3 - dx3 * dy1) / den;
      a = x1 - x0 + g * x1; b = x3 - x0 + hh * x3; c = x0; d = y1 - y0 + g * y1; e = y3 - y0 + hh * y3; f = y0;
    }
    const S = MARK;
    return `matrix3d(${a / S},${d / S},0,${g / S},${b / S},${e / S},0,${hh / S},0,0,1,0,${c},${f},0,1)`;
  }
  function projVec(v, w, h) {
    const yaw = Math.atan2(v[0], -v[2]) / D2R, pitch = Math.atan2(v[1], Math.hypot(v[0], v[2])) / D2R;
    return viewer.project(yaw, pitch, w, h);
  }

  function setSceneTitle() {
    $("#sceneNum").textContent = (LEVELS.length > 1 ? tx(levelOf(current).title) + "  ·  " : "") + pad(idx(current) + 1);
    $("#sceneName").textContent = tx(current.title);
  }

  let hsList = [];
  function buildHotspots() {
    const layer = $("#hsLayer"); layer.innerHTML = ""; hsList = [];
    (current.hotspots || []).forEach((h) => {
      if (h.type !== "scene") return;
      const a = hsAngles(current, h);
      const el = document.createElement("button"); el.type = "button";
      if (h.type === "scene") {
        const t = byId(h.target); if (!t) return;
        const ov = arrowOverride(current.id, t.id);
        if (ov) { a.yaw = ov.yaw; a.dist = ov.dist; a.pitch = -Math.atan(BOOTH.eyeHeightM / ov.dist) / D2R; }
        const lvA = levelOf(current), lvB = levelOf(t), cross = lvA.id !== lvB.id;
        const outside = lvA.exterior || lvB.exterior;           // walking in/out, not stairs
        const stairs = cross && !outside;
        el.className = "hs hs-floor" + (stairs ? " hs-stairs" : "");
        el.style.width = el.style.height = MARK + "px";
        el.innerHTML = stairs
          ? `<svg viewBox="0 0 100 100"><circle class="disc" cx="50" cy="50" r="44"/><path class="chev" d="M26 70h14V56h14V42h14V30"/><path class="chev" d="M58 30h10v10"/></svg>`
          : `<svg viewBox="0 0 100 100"><circle class="disc" cx="50" cy="50" r="44"/><path class="chev" d="M30 60 50 38 70 60"/></svg>`;
        el.setAttribute("aria-label", tx(t.title));
        const lbl = document.createElement("button"); lbl.type = "button"; lbl.className = "hs hs-lbl";
        lbl.innerHTML = `${cross ? `<em>${tx(lvB.title)}</em> · ` : ""}${tx(t.title)}`;
        const item = { el, lbl, yaw: a.yaw, pitch: a.pitch, dist: a.dist, type: "scene", h, target: t.id };
        const goTo = () => { if (!editMode) go(t.id, item.yaw, item.pitch); };
        el.addEventListener("click", goTo); lbl.addEventListener("click", goTo);
        makeDraggable(item);
        [el, lbl].forEach((x) => { x.addEventListener("mouseenter", () => { el.classList.add("is-hover"); lbl.classList.add("is-hover"); });
                                   x.addEventListener("mouseleave", () => { el.classList.remove("is-hover"); lbl.classList.remove("is-hover"); }); });
        layer.appendChild(el); layer.appendChild(lbl);
        hsList.push(item);
        return;
      }
    });
    infoListFor(current.id).forEach((h, i) => {
      const el = document.createElement("button"); el.type = "button";
      el.className = "hs hs-info";
      el.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>`;
      const item = { el, yaw: h.yaw, pitch: h.pitch, type: "info", h, index: i };
      el.addEventListener("click", () => { if (!infoMode) openInfo(h, el); });
      makeInfoDraggable(item);
      layer.appendChild(el);
      hsList.push(item);
    });
    viewer.setHotspots(hsList.filter((x) => x.type === "scene"));
  }

  function placeHotspots() {
    const c = $("#pano"), w = c.clientWidth, hgt = c.clientHeight;
    const off = (p) => !p || p.x < -300 || p.x > w + 300 || p.y < -300 || p.y > hgt + 300;
    for (const h of hsList) {
      if (h.type === "scene") {
        const Y = h.yaw * D2R, f = [Math.sin(Y), 0, -Math.cos(Y)], r = [Math.cos(Y), 0, Math.sin(Y)];
        const d = h.dist, R = 0.34 * Math.max(1, d / 3), E = -BOOTH.eyeHeightM;   // far arrows grow a little so they stay readable
        const pt = (fw, rt) => [f[0] * (d + fw) + r[0] * rt, E, f[2] * (d + fw) + r[2] * rt];
        const q = [pt(R, -R), pt(R, R), pt(-R, R), pt(-R, -R)].map((v) => projVec(v, w, hgt));   // far-left, far-right, near-right, near-left
        if (q.some(off)) { h.el.classList.add("is-hidden"); h.lbl.classList.add("is-hidden"); continue; }
        h.el.classList.remove("is-hidden"); h.lbl.classList.remove("is-hidden");
        h.el.style.transform = squareToQuad(q.map((p) => [p.x, p.y]));
        const nb = projVec(pt(-R - 0.06, 0), w, hgt);
        h.lbl.style.transform = `translate(${(nb.x - h.lbl.offsetWidth / 2).toFixed(1)}px,${(nb.y + 6).toFixed(1)}px)`;
        continue;
      }
      const p = viewer.project(h.yaw, h.pitch, w, hgt);
      if (off(p)) { h.el.classList.add("is-hidden"); continue; }
      h.el.classList.remove("is-hidden");
      h.el.style.transform = `translate(${(p.x - h.el.offsetWidth / 2).toFixed(1)}px,${(p.y - h.el.offsetHeight / 2).toFixed(1)}px)`;
    }
  }

  async function showScene(id, yaw, pitch) {
    const s = byId(id); if (!s) return;
    const loader = $("#loader");
    const t = setTimeout(() => loader.classList.add("is-on"), 150);
    let img;
    try { img = await preloadPano(s.pano); }
    catch (e) { clearTimeout(t); loader.classList.remove("is-on"); return showErr(fileOf(s.pano)); }
    try { viewer.setImage(img); }
    catch (e) { clearTimeout(t); loader.classList.remove("is-on"); imgCache.delete(baseOf(s.pano)); return showErr(fileOf(s.pano)); }
    clearTimeout(t); loader.classList.remove("is-on");
    $("#errorBox").hidden = true;
    current = s;
    closeInfo();
    viewer.setView(yaw ?? s.yaw ?? 0, pitch ?? s.pitch ?? 0, viewer.fov);
    setSceneTitle(); buildHotspots(); buildMini();
    try { history.replaceState(null, "", "#" + s.id + (devMode ? "" : "")); } catch (e) {}
    // warm up neighbours
    (s.hotspots || []).filter((h) => h.type === "scene").forEach((h) => { const n = byId(h.target); n && setTimeout(() => preloadPano(n.pano), 600); });
  }
  function showErr(file) {
    const b = $("#errorBox"); b.hidden = false; b.innerHTML = ui("packErr")(file);
  }

  async function enterScene(id) {
    show("tour");
    viewer.fadeTarget = 0; viewer.fade = 0;
    const portrait = innerHeight > innerWidth;
    viewer.fov = Math.min(C.viewer.maxFov, C.viewer.startFov * (portrait ? 1.3 : 1));
    await showScene(id);
    viewer.fadeTarget = 1; viewer.interact();
    hintDrag();
  }

  /* navigate between scenes with a "walk forward" transition */
  async function go(id, viaYaw, viaPitch) {
    if (busy || !viewer) return; busy = true;
    const from = current, to = byId(id);
    const fov0 = viewer.fov;
    if (viaYaw != null) await Promise.all([viewer.tweenTo(viaYaw, Math.max(-20, (viaPitch || 0) * .5), Math.max(C.viewer.minFov, fov0 - 22), 520)]);
    viewer.fadeTarget = 0;
    await new Promise((r) => setTimeout(r, 260));
    // keep the walking direction: face the same way on the plan
    let yaw = to.yaw, pitch = to.pitch ?? 0;
    if (from && viaYaw != null) { yaw = mapHeading(from, to) + (to.mapNorth || 0); pitch = 0; }
    viewer.fov = Math.max(C.viewer.minFov, fov0 - 12);
    await showScene(id, yaw, pitch);
    viewer.fadeTarget = 1;
    await viewer.tweenTo(viewer.yaw, viewer.pitch, fov0, 700);
    viewer.interact();
    busy = false;
  }

  if (viewer) {
    viewer.onFrame = () => { placeHotspots(); drawCone(); if (devMode) devRead(); };
    viewer.onGazeSelect = (h) => { if (h.type === "scene") go(h.h.target, h.yaw, h.pitch); };
    viewer.onClick = (e) => {
      if (infoMode) {
        const r = $("#pano").getBoundingClientRect(), a = viewer.unproject(e.clientX - r.left, e.clientY - r.top);
        return openInfoForm(null, { yaw: +a.yaw.toFixed(1), pitch: +a.pitch.toFixed(1) });
      }
      if (devMode) {
        const r = $("#pano").getBoundingClientRect(), a = viewer.unproject(e.clientX - r.left, e.clientY - r.top);
        copy(`yaw: ${a.yaw.toFixed(1)}, pitch: ${a.pitch.toFixed(1)}`);
      } else closeInfo();
    };
  }

  /* ---------------- info card ---------------- */
  let openEl = null;
  function openInfo(h, el) {
    if (openEl === el) return closeInfo();
    closeInfo();
    $("#infoTitle").textContent = tx(h.title);
    $("#infoText").textContent = tx(h.text);
    $("#infoScene").textContent = tx(current.title);
    const im = $("#infoImg"); if (h.image) im.src = h.image; else im.removeAttribute("src");
    $("#infoCard").classList.add("is-open"); el.classList.add("is-open"); openEl = el;
    viewer.interact();
  }
  function closeInfo() { $("#infoCard").classList.remove("is-open"); openEl && openEl.classList.remove("is-open"); openEl = null; }
  $("#infoClose").addEventListener("click", closeInfo);

  /* ---------------- controls ---------------- */
  $("#toPlan").addEventListener("click", () => { if (current) setPlanLevel(levelOf(current).id); show("map"); });
  const step = (d) => { const i = (idx(current) + d + C.scenes.length) % C.scenes.length; go(C.scenes[i].id); };
  $("#prevBtn").addEventListener("click", () => step(-1));
  $("#nextBtn").addEventListener("click", () => step(1));
  const rotBtn = $("#rotBtn");
  const syncRot = () => rotBtn.classList.toggle("is-on", !!(viewer && viewer.autoRotate));
  rotBtn.addEventListener("click", () => { viewer.autoRotate = !viewer.autoRotate; viewer.lastInteract = 0; syncRot(); });
  syncRot();

  const gyroBtn = $("#gyroBtn"), vrBtn = $("#vrBtn"), fsBtn = $("#fsBtn");
  if (!touch && !devMode) { gyroBtn.hidden = true; vrBtn.hidden = true; }
  gyroBtn.addEventListener("click", async () => {
    const on = !viewer.gyro;
    const ok = await viewer.enableGyro(on);
    if (on && !ok) return toast(ui("gyroDenied"));
    gyroBtn.classList.toggle("is-on", viewer.gyro);
  });

  const fsEl = document.documentElement;
  const canFs = !!(fsEl.requestFullscreen || fsEl.webkitRequestFullscreen);
  if (!canFs) fsBtn.hidden = true;
  const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const enterFs = () => (fsEl.requestFullscreen ? fsEl.requestFullscreen() : fsEl.webkitRequestFullscreen && fsEl.webkitRequestFullscreen()) || Promise.resolve();
  const exitFs = () => isFs() && (document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen());
  fsBtn.addEventListener("click", () => { isFs() ? exitFs() : Promise.resolve(enterFs()).catch(() => {}); });
  ["fullscreenchange", "webkitfullscreenchange"].forEach((ev) => document.addEventListener(ev, () => {
    fsBtn.classList.toggle("is-on", isFs());
    if (!isFs() && viewer && viewer.vr) exitVR();
  }));

  let gyroBeforeVR = false;
  async function enterVR() {
    gyroBeforeVR = viewer.gyro;
    if (canFs) await Promise.resolve(enterFs()).catch(() => {});
    try { await screen.orientation.lock("landscape"); } catch (e) {}
    if (!viewer.gyro) await viewer.enableGyro(true);
    viewer.vr = true; closeInfo();
    $("#tour").classList.add("is-vr"); $("#vrExit").hidden = false;
    toast(ui("vrHint"), 4000);
  }
  function exitVR() {
    viewer.vr = false; $("#tour").classList.remove("is-vr"); $("#vrExit").hidden = true;
    if (!gyroBeforeVR) viewer.enableGyro(false);
    gyroBtn.classList.toggle("is-on", viewer.gyro);
    try { screen.orientation.unlock(); } catch (e) {}
    exitFs();
  }
  vrBtn.addEventListener("click", enterVR);
  $("#vrExit").addEventListener("click", exitVR);

  /* first-visit drag hint */
  let hinted = false;
  function hintDrag() {
    if (hinted) return; hinted = true;
    const h = $("#dragHint"); setTimeout(() => h.classList.add("is-on"), 700);
    const off = () => h.classList.remove("is-on");
    setTimeout(off, 3800); $("#pano").addEventListener("pointerdown", off, { once: true });
  }

  /* ---------------- arrow editor (press E, or open index.html?edit) ----------------
     Drag any floor arrow to where it should sit. Positions are kept in this browser and can be
     downloaded as arrows.js - put that file next to index.html to make them permanent. */
  const ARROW_KEY = "ajdan360.arrows";
  let editMode = false;
  const loadLocal = () => { try { return JSON.parse(localStorage.getItem(ARROW_KEY) || "{}"); } catch (e) { return {}; } };
  let arrowEdits = loadLocal();
  function arrowOverride(sceneId, targetId) {
    const L = arrowEdits[sceneId] && arrowEdits[sceneId][targetId];
    if (L) return L;
    const F = window.TOUR_ARROWS && window.TOUR_ARROWS[sceneId] && window.TOUR_ARROWS[sceneId][targetId];
    return F || null;
  }
  function saveLocal() { try { localStorage.setItem(ARROW_KEY, JSON.stringify(arrowEdits)); } catch (e) {} }
  function mergedArrows() {
    const out = JSON.parse(JSON.stringify(window.TOUR_ARROWS || {}));
    for (const sId in arrowEdits) { out[sId] = Object.assign(out[sId] || {}, arrowEdits[sId]); }
    return out;
  }
  function makeDraggable(item) {
    const start = (e) => {
      if (!editMode) return;
      e.preventDefault(); e.stopPropagation();
      const el = e.currentTarget; el.setPointerCapture(e.pointerId);
      item.el.classList.add("is-drag");
      const move = (ev) => {
        const r = $("#pano").getBoundingClientRect();
        const a = viewer.unproject(ev.clientX - r.left, ev.clientY - r.top);
        const pitch = Math.min(-2, a.pitch);
        const dist = Math.max(0.8, Math.min(15, BOOTH.eyeHeightM / Math.tan(-pitch * D2R)));
        item.yaw = a.yaw; item.dist = dist; item.pitch = -Math.atan(BOOTH.eyeHeightM / dist) / D2R;
      };
      const up = () => {
        el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
        item.el.classList.remove("is-drag");
        (arrowEdits[current.id] = arrowEdits[current.id] || {})[item.target] = { yaw: +item.yaw.toFixed(1), dist: +item.dist.toFixed(2) };
        saveLocal(); viewer.setHotspots(hsList.filter((x) => x.type === "scene"));
      };
      el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    };
    item.el.addEventListener("pointerdown", start);
    item.lbl.addEventListener("pointerdown", start);
  }
  const editBar = document.createElement("div");
  editBar.className = "edit-bar"; editBar.hidden = true;
  editBar.innerHTML = `<span><b>Arrow editor</b> · drag the arrows onto the floor where they belong</span>
    <button type="button" data-a="save">Download arrows.js</button>
    <button type="button" data-a="reset">Reset this view</button>
    <button type="button" data-a="done">Done</button>`;
  $("#tour").appendChild(editBar);
  editBar.addEventListener("click", (e) => {
    const a = e.target.dataset && e.target.dataset.a; if (!a) return;
    if (a === "done") setEdit(false);
    if (a === "reset" && current) {
      delete arrowEdits[current.id]; saveLocal();
      if (window.TOUR_ARROWS) delete window.TOUR_ARROWS[current.id];
      buildHotspots();
    }
    if (a === "save") {
      const js = "/* Arrow positions saved from the tour editor (press E). Keep this file next to index.html. */\n" +
        "window.TOUR_ARROWS = " + JSON.stringify(mergedArrows(), null, 2) + ";\n";
      const url = URL.createObjectURL(new Blob([js], { type: "text/javascript" }));
      const dl = document.createElement("a"); dl.href = url; dl.download = "arrows.js"; document.body.appendChild(dl); dl.click(); dl.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast("Saved arrows.js – move it into the tour folder (next to index.html)", 5000);
    }
  });
  function setEdit(on) {
    if (on && infoMode) setInfoMode(false);
    editMode = on; editBar.hidden = !on; $("#tour").classList.toggle("is-editing", on);
    if (viewer) { viewer.autoRotate = on ? false : viewer.autoRotate; syncRot(); }
    if (on) toast("Arrow editor on – drag arrows, then Download arrows.js");
  }

  /* ---------------- info-point editor (Ctrl+Shift+E, or open index.html?info) ----------------
     Click anywhere in the 360 to add an info point, click a point to edit it, drag to move it.
     Points are kept in this browser; "Download info.js" makes them permanent (put it next to index.html). */
  const INFO_KEY = "ajdan360.info";
  let infoMode = false;
  let infoEdits = (() => { try { return JSON.parse(localStorage.getItem(INFO_KEY) || "{}"); } catch (e) { return {}; } })();
  function infoListFor(sceneId) {
    if (infoEdits[sceneId]) return infoEdits[sceneId];
    if (window.TOUR_INFO && window.TOUR_INFO[sceneId]) return window.TOUR_INFO[sceneId];
    const s = byId(sceneId);
    return ((s && s.hotspots) || []).filter((h) => h.type === "info").map((h) => Object.assign({}, h, hsAngles(s, h)));
  }
  function setInfoList(sceneId, list) {
    infoEdits[sceneId] = list;
    try { localStorage.setItem(INFO_KEY, JSON.stringify(infoEdits)); } catch (e) {}
    buildHotspots();
  }
  function mergedInfo() {
    const out = JSON.parse(JSON.stringify(window.TOUR_INFO || {}));
    C.scenes.forEach((s) => { if (!out[s.id]) { const l = infoListFor(s.id); if (l.length) out[s.id] = l; } });
    return Object.assign(out, JSON.parse(JSON.stringify(infoEdits)));
  }
  function makeInfoDraggable(item) {
    item.el.addEventListener("pointerdown", (e) => {
      if (!infoMode) return;
      e.preventDefault(); e.stopPropagation();
      const el = item.el; el.setPointerCapture(e.pointerId);
      const x0 = e.clientX, y0 = e.clientY; let moved = false;
      const move = (ev) => {
        if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) > 4) moved = true;
        if (!moved) return;
        const r = $("#pano").getBoundingClientRect(), a = viewer.unproject(ev.clientX - r.left, ev.clientY - r.top);
        item.yaw = a.yaw; item.pitch = a.pitch;
      };
      const up = () => {
        el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
        const list = infoListFor(current.id).map((x) => Object.assign({}, x));
        if (moved) { Object.assign(list[item.index], { yaw: +item.yaw.toFixed(1), pitch: +item.pitch.toFixed(1) }); setInfoList(current.id, list); }
        else openInfoForm(item.index);
      };
      el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    });
  }
  const infoForm = document.createElement("aside");
  infoForm.className = "info-form"; infoForm.hidden = true;
  infoForm.innerHTML = `
    <p class="eyebrow">Info point</p>
    <label>Title (English)<input data-f="title.en" type="text"></label>
    <label>Title (Arabic)<input data-f="title.ar" type="text" dir="rtl"></label>
    <label>Text (English)<textarea data-f="text.en" rows="3"></textarea></label>
    <label>Text (Arabic)<textarea data-f="text.ar" rows="3" dir="rtl"></textarea></label>
    <label>Image (optional) <small>e.g. assets/info/model.jpg</small><input data-f="image" type="text" placeholder="assets/info/…"></label>
    <div class="if-actions"><button type="button" data-a="save">Save</button><button type="button" data-a="delete">Delete</button><button type="button" data-a="cancel">Cancel</button></div>`;
  $("#tour").appendChild(infoForm);
  let formTarget = null;               // { index } for existing, { pos } for new
  function openInfoForm(index, pos) {
    closeInfo();
    const h = index != null ? infoListFor(current.id)[index] : { title: {}, text: {} };
    formTarget = { index, pos };
    infoForm.querySelectorAll("[data-f]").forEach((inp) => {
      const [k, l] = inp.dataset.f.split(".");
      inp.value = l ? ((h[k] && h[k][l]) || "") : (h[k] || "");
    });
    infoForm.querySelector('[data-a="delete"]').hidden = index == null;
    infoForm.hidden = false; infoForm.querySelector("input").focus();
  }
  infoForm.addEventListener("click", (e) => {
    const a = e.target.dataset && e.target.dataset.a; if (!a) return;
    const list = infoListFor(current.id).map((x) => Object.assign({}, x));
    if (a === "save") {
      const h = formTarget.index != null ? list[formTarget.index] : Object.assign({ type: "info" }, formTarget.pos);
      h.title = {}; h.text = {};
      infoForm.querySelectorAll("[data-f]").forEach((inp) => {
        const [k, l] = inp.dataset.f.split("."), v = inp.value.trim();
        if (l) { if (v) h[k][l] = v; } else if (v) h[k] = v; else delete h[k];
      });
      if (formTarget.index == null) list.push(h);
      setInfoList(current.id, list);
    }
    if (a === "delete" && formTarget.index != null) { list.splice(formTarget.index, 1); setInfoList(current.id, list); }
    infoForm.hidden = true;
  });
  infoForm.addEventListener("keydown", (e) => e.stopPropagation());   // typing "e"/"d" must not toggle editors
  const infoBar = document.createElement("div");
  infoBar.className = "edit-bar"; infoBar.hidden = true;
  infoBar.innerHTML = `<span><b>Info editor</b> · click anywhere to add a point · click a point to edit · drag to move</span>
    <button type="button" data-a="save">Download info.js</button>
    <button type="button" data-a="done">Done</button>`;
  $("#tour").appendChild(infoBar);
  infoBar.addEventListener("click", (e) => {
    const a = e.target.dataset && e.target.dataset.a; if (!a) return;
    if (a === "done") setInfoMode(false);
    if (a === "save") {
      const js = "/* Info points saved from the tour editor (Ctrl+Shift+E). Keep this file next to index.html. */\n" +
        "window.TOUR_INFO = " + JSON.stringify(mergedInfo(), null, 2) + ";\n";
      const url = URL.createObjectURL(new Blob([js], { type: "text/javascript" }));
      const dl = document.createElement("a"); dl.href = url; dl.download = "info.js"; document.body.appendChild(dl); dl.click(); dl.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast("Saved info.js – move it into the tour folder (next to index.html)", 5000);
    }
  });
  function setInfoMode(on) {
    if (on && editMode) setEdit(false);
    infoMode = on; infoBar.hidden = !on; infoForm.hidden = true;
    $("#tour").classList.toggle("is-info-editing", on);
    if (on && viewer) { viewer.autoRotate = false; syncRot(); }
    if (on) toast("Info editor on – click in the view to add an info point");
  }

  /* ---------------- dev helper ---------------- */
  function setDev(on) { devMode = on; $("#dev").hidden = !on; $("#plan").style.cursor = on ? "crosshair" : ""; if (on) toast("Dev mode: click to copy yaw/pitch (360) or x/y (plan)"); }
  function devRead() { $("#devReadout").textContent = `yaw ${viewer.yaw.toFixed(1)}°  pitch ${viewer.pitch.toFixed(1)}°  fov ${viewer.fov.toFixed(0)}°`; }
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { if (viewer && viewer.vr) exitVR(); else closeInfo(); }
    if ((e.key === "d" || e.key === "D") && !e.metaKey && !e.ctrlKey) setDev(!devMode);
    if ((e.key === "e" || e.key === "E") && (e.ctrlKey || e.metaKey) && e.shiftKey) { e.preventDefault(); setInfoMode(!infoMode); return; }
    if ((e.key === "e" || e.key === "E") && !e.metaKey && !e.ctrlKey) setEdit(!editMode);
  });

  /* ---------------- boot ---------------- */
  applyLang();
  if (devMode) setDev(true);
  if (params.has("edit")) setEdit(true);
  if (params.has("info")) setInfoMode(true);
  const deep = location.hash.slice(1);
  if (deep && byId(deep)) { enterScene(deep); }
})();
