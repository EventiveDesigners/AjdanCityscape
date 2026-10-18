/* ==========================================================================
   AJDAN · RIYADH CITYSCAPE 2026 — 360° TOUR CONFIG
   Edit this file to swap renders, move pins and place hotspots.
   ----------------------------------------------------------------------------
   PANORAMAS   assets/panos/pano-XX.png|jpg|webp — equirectangular 2:1 (8192x4096 recommended,
               max 16384 wide). Centre of the image = yaw 0.
               After adding/replacing panoramas run  tools/pack-panos.bat  so the
               tour works by double-clicking index.html (offline / USB / kiosk).
   LEVELS      One top-view image per floor. Each scene says which level it is on.
               Pin x/y are % of that level's image.
   ANGLES      yaw: 0 = image centre, +90 = right, -90 = left, 180 = back.
               pitch: 0 = horizon, + up, - down.
   NORTH       scene.mapNorth = the pano yaw that faces UP on the top view
               (UP = the back wall of the booth). Used for the mini-map view cone
               and for auto-aiming:
                 { type:"scene", target }        arrow aimed at the target pin
                 { type:"info",  at:{x,y} }      info dot aimed at a spot on the plan
               Give an explicit yaw/pitch to override the auto-aim.
   ARROWS      Walking arrows lie flat on the floor in perspective, 1.9-3.2 m ahead
               in the direction of the next point. If one lands on a table, move it:
                 { type:"scene", target:"lakes", dist: 4.5 }   // metres from camera
               (camera eye height = booth.eyeHeightM; match your render camera).
   FIND ANGLES Open  index.html?dev  (or press D in the 360 view): a crosshair
               shows yaw/pitch; click to copy. On the top view, click copies x/y.
   ========================================================================== */

window.TOUR_CONFIG = {
  defaultLang: "en",               // "en" | "ar"

  brand: {
    name: { en: "AJDAN", ar: "أجدان" },
    logo: "assets/logo.png",        // white logo on transparent background
  },

  landing: {
    hero:     "assets/hero.jpg",
    eyebrow:  { en: "Riyadh Cityscape 2026 · Virtual Tour", ar: "سيتي سكيب الرياض 2026 · جولة افتراضية" },
    title:    { en: "Step inside<br>the Ajdan Cityscape<br>pavilion", ar: "ادخل إلى<br>جناح أجدان<br>في سيتي سكيب" },
    subtitle: { en: "Walk both levels of the pavilion in 360°. Choose a viewpoint on the plan and explore every space as if you were there.",
                ar: "تجوّل في طابقي الجناح بزاوية 360°. اختر نقطة من المخطط واستكشف كل مساحة وكأنك هناك." },
    button:   { en: "Start the experience", ar: "ابدأ التجربة" },
  },

  topView: {
    title: { en: "Choose a viewpoint", ar: "اختر نقطة المشاهدة" },
    hint:  { en: "Switch floors, then tap a point on the plan to step into the 360° view.",
             ar: "اختر الطابق ثم اضغط على نقطة في المخطط للدخول إلى العرض 360°." },
  },

  // real booth size (from the top-view drawing) - used to place the walking arrows on the floor
  booth: { widthM: 41.5, depthM: 18.5, eyeHeightM: 1.6 },

  levels: [
    // booth: where the booth outline sits in each image (% x0,y0 → x1,y1). Lets arrows between
    // levels aim correctly even though the exterior plan is zoomed out.
    { id: "ground",   title: { en: "Ground Floor", ar: "الطابق الأرضي" },     image: "assets/topview-ground.jpg",
      booth: { x0: 2.70, y0: 5.65, x1: 97.30, y1: 94.35 } },
    { id: "first",    title: { en: "First Floor",  ar: "الطابق الأول" },      image: "assets/topview-first.jpg",
      booth: { x0: 2.73, y0: 5.91, x1: 97.27, y1: 94.09 } },
    { id: "exterior", title: { en: "Exterior",     ar: "الواجهة الخارجية" }, image: "assets/topview-exterior.jpg", exterior: true,
      booth: { x0: 6.04, y0: 12.97, x1: 93.12, y1: 78.51 } },
  ],

  viewer: {
    startFov: 75,          // degrees (vertical)
    minFov: 35,
    maxFov: 100,
    autoRotate: true,
    autoRotateSpeed: 3,    // degrees / second
    autoRotateDelay: 4,    // seconds idle before spinning
  },

  scenes: [
    /* ---------------- GROUND FLOOR ---------------- */
    {
      id: "reception", level: "ground",
      title: { en: "Reception", ar: "الاستقبال" },
      pano: "pano-01",
      map: { x: 50.0, y: 82.5 }, mapNorth: 0, yaw: 0, pitch: 0,
      hotspots: [
        { type: "scene", target: "central" },
        { type: "scene", target: "west" },
        { type: "scene", target: "east" },
        { type: "scene", target: "entrance" },
      ],
    },
    {
      id: "central", level: "ground",
      title: { en: "Central Models", ar: "المجسّمات المركزية" },
      pano: "pano-02",
      map: { x: 50.0, y: 56.0 }, mapNorth: 0, yaw: 0, pitch: -10,
      hotspots: [
        { type: "scene", target: "reception" },
        { type: "scene", target: "west" },
        { type: "scene", target: "east" },
        { type: "scene", target: "lakes" },
        { type: "scene", target: "coffee" },
      ],
    },
    {
      id: "west", level: "ground",
      title: { en: "Grand Square & Raseen Khuzam", ar: "جراند سكوير ورسين خزام" },
      pano: "pano-03",
      map: { x: 21.8, y: 63.5 }, mapNorth: 0, yaw: -90, pitch: -8,
      hotspots: [
        { type: "scene", target: "central" },
        { type: "scene", target: "reception" },
        { type: "scene", target: "coffee" },
      ],
    },
    {
      id: "east", level: "ground",
      title: { en: "Khobar Pier & Infiniti", ar: "خبر بير وإنفينيتي" },
      pano: "pano-04",
      map: { x: 75.6, y: 62.8 }, mapNorth: 0, yaw: 90, pitch: -8,
      hotspots: [
        { type: "scene", target: "central" },
        { type: "scene", target: "reception" },
        { type: "scene", target: "lakes" },
      ],
    },
    {
      id: "lakes", level: "ground",
      title: { en: "The Lakes & Signing Table", ar: "ذا ليكس وطاولة التوقيع" },
      pano: "pano-05",
      map: { x: 59.3, y: 35.9 }, mapNorth: 0, yaw: 0, pitch: -6,
      hotspots: [
        { type: "scene", target: "central" },
        { type: "scene", target: "coffee" },
        { type: "scene", target: "east" },
      ],
    },
    {
      id: "coffee", level: "ground",
      title: { en: "Coffee Corner & VIP", ar: "ركن القهوة وكبار الزوار" },
      pano: "pano-06",
      map: { x: 26.4, y: 35.0 }, mapNorth: 0, yaw: 0, pitch: -4,
      hotspots: [
        { type: "scene", target: "central" },
        { type: "scene", target: "west" },
        { type: "scene", target: "lakes" },
        { type: "scene", target: "lounge1" },
      ],
    },

    /* ---------------- FIRST FLOOR ---------------- */
    {
      id: "lounge1", level: "first",
      title: { en: "Lounge Area 1", ar: "منطقة الجلوس 1" },
      pano: "pano-07",
      map: { x: 17.5, y: 25.5 }, mapNorth: 0, yaw: 90, pitch: -6,
      hotspots: [
        { type: "scene", target: "coffee" },
        { type: "scene", target: "lounge2" },
      ],
    },
    {
      id: "lounge2", level: "first",
      title: { en: "Lounge Area 2", ar: "منطقة الجلوس 2" },
      pano: "pano-08",
      map: { x: 35.0, y: 25.5 }, mapNorth: 0, yaw: 0, pitch: -6,
      hotspots: [
        { type: "scene", target: "lounge1" },
        { type: "scene", target: "lounge3" },
      ],
    },
    {
      id: "lounge3", level: "first",
      title: { en: "Lounge Area 3", ar: "منطقة الجلوس 3" },
      pano: "pano-09",
      map: { x: 65.8, y: 25.5 }, mapNorth: 0, yaw: 0, pitch: -6,
      hotspots: [
        { type: "scene", target: "lounge2" },
        { type: "scene", target: "meeting" },
      ],
    },
    {
      id: "meeting", level: "first",
      title: { en: "Meeting Room", ar: "غرفة الاجتماعات" },
      pano: "pano-10",
      map: { x: 83.0, y: 25.0 }, mapNorth: 0, yaw: 0, pitch: -6,
      hotspots: [
        { type: "scene", target: "lounge3" },
      ],
    },

    /* ---------------- EXTERIOR ---------------- */
    {
      id: "backLeft", level: "exterior",
      title: { en: "Back-left Corner", ar: "الزاوية الخلفية اليسرى" },
      pano: "pano-11",
      map: { x: 3.2, y: 10.5 }, mapNorth: 0, yaw: 125, pitch: 4,
      hotspots: [
        { type: "scene", target: "frontLeft" },
      ],
    },
    {
      id: "frontLeft", level: "exterior",
      title: { en: "Front-left Corner", ar: "الزاوية الأمامية اليسرى" },
      pano: "pano-12",
      map: { x: 6.5, y: 81.0 }, mapNorth: 0, yaw: 45, pitch: 4,
      hotspots: [
        { type: "scene", target: "entrance" },
        { type: "scene", target: "backLeft" },
      ],
    },
    {
      id: "entrance", level: "exterior",
      title: { en: "Main Entrance", ar: "المدخل الرئيسي" },
      pano: "pano-13",
      map: { x: 49.8, y: 84.0 }, mapNorth: 0, yaw: 0, pitch: 4,
      hotspots: [
        { type: "scene", target: "frontLeft" },
        { type: "scene", target: "frontRight" },
      ],
    },
    {
      id: "frontRight", level: "exterior",
      title: { en: "Front-right Corner", ar: "الزاوية الأمامية اليمنى" },
      pano: "pano-14",
      map: { x: 95.3, y: 84.0 }, mapNorth: 0, yaw: -45, pitch: 4,
      hotspots: [
        { type: "scene", target: "entrance" },
        { type: "scene", target: "rightSide" },
      ],
    },
    {
      id: "rightSide", level: "exterior",
      title: { en: "Right Side", ar: "الواجهة الجانبية اليمنى" },
      pano: "pano-15",
      map: { x: 95.4, y: 42.9 }, mapNorth: 0, yaw: -90, pitch: 4,
      hotspots: [
        { type: "scene", target: "frontRight" },
      ],
    },
  ],
};
