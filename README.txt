AJDAN · RIYADH CITYSCAPE 2026 - 360 TOUR
=========================================

REPLACE A 360 RENDER  (that's it - 3 steps)
 1. Name your render after the point number:   pano-02.png  (or .jpg / .webp) = point 02
    (see the list below, or the point numbers on the plan)
 2. Copy it into  assets\panos  and overwrite the old file.
 3. Double-click  "UPDATE & OPEN TOUR.bat"
    -> it prepares only the new/changed renders and opens the tour.
 PNG, JPG or WEBP all work - no need to convert or match the old extension.
 If an older pano-02.jpg is still in the folder, the newest file wins (you can delete the old one).

 Render spec: equirectangular 2:1, 8192 x 4096 JPG recommended (max 16384 x 8192).
 Full quality is kept - nothing is compressed or resized.
 Tip: an 8K PNG is often 50-150 MB; fine on a PC/kiosk. For phones, a JPG at quality 95 loads much faster.
 Centre of the render = the direction the view opens facing (yaw 0 = towards the booth's back wall).

POINT -> FILE   (name your render like this - .png / .jpg / .webp)
 Ground Floor  01 Reception                       pano-01
               02 Central Models                  pano-02
               03 Grand Square & Raseen Khuzam    pano-03
               04 Khobar Pier & Infiniti          pano-04
               05 The Lakes & Signing Table       pano-05
               06 Coffee Corner & VIP             pano-06
 First Floor   07 Lounge Area 1                   pano-07
               08 Lounge Area 2                   pano-08
               09 Lounge Area 3                   pano-09
               10 Meeting Room                    pano-10
 Exterior      11 Back-left Corner                pano-11
               12 Front-left Corner               pano-12
               13 Main Entrance                   pano-13
               14 Front-right Corner              pano-14
               15 Right Side                      pano-15

PLACE THE WALKING ARROWS  (after your renders are in)
 1. Open the tour, go into a 360 view and press  E  (or open index.html?edit).
 2. Drag each floor arrow to where it should sit (e.g. the stairs arrow onto the stairs).
 3. Visit every point you want to fix, then click  "Download arrows.js".
 4. Put the downloaded arrows.js in the main tour folder (replace the old one).
 Edits also stay in your browser while you work. "Reset this view" puts a point's arrows back.

ADD INFO POINTS  (the + dots that open an info card)
 1. In a 360 view press  Ctrl+Shift+E  (or open index.html?info).
 2. Click anywhere in the view to add a point -> fill in title / text (English + Arabic),
    optional image path (e.g. assets/info/model.jpg - put the image in that folder).
    Click a point to edit or delete it, drag it to move it.
 3. Click  "Download info.js"  and put it in the main tour folder (replace the old one).

OTHER IMAGES (just overwrite, no update step needed)
 assets\hero.jpg               landing page hero
 assets\logo.png               white logo, transparent background
 assets\topview-exterior.jpg   plans (if you change framing, pins may need moving)
 assets\topview-ground
 assets\topview-first

SENDING TO THE CLIENT
 Run "UPDATE & OPEN TOUR.bat" once, then zip/copy the whole folder.
 The client just double-clicks index.html - works offline, USB, kiosk, or any web host.

FINE-TUNING (optional)
 Open index.html?dev (or press D): click in a 360 to copy yaw/pitch, click on the plan
 to copy pin x/y, then paste into config.js. Mac: python3 tools/pack-panos.py
