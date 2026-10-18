/* Lightweight equirectangular 360 viewer (WebGL2, no dependencies).
   Handles: drag / inertia, wheel + pinch zoom, keyboard, auto-rotate,
   gyro (device orientation), split-screen VR with gaze selection,
   hotspot projection for DOM overlays. */
(function () {
  "use strict";
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrap = (a) => ((a + 180) % 360 + 360) % 360 - 180;

  const VS = `#version 300 es
  in vec2 p; out vec2 vNdc;
  void main(){ vNdc = p; gl_Position = vec4(p,0.,1.); }`;

  const FS = `#version 300 es
  precision highp float;
  in vec2 vNdc; out vec4 o;
  uniform sampler2D uTex;
  uniform vec3 uF, uR, uU;      // camera basis
  uniform vec2 uTan;            // tan(fov/2)*aspect, tan(fov/2)
  uniform float uFade;
  uniform int uVR;
  uniform int uHsN;
  uniform vec4 uHs[12];         // xyz dir, w: 1 = scene, 2 = info
  uniform float uGaze;          // 0..1 gaze progress
  const float PI = 3.14159265359;
  void main(){
    vec3 d = normalize(uF + vNdc.x*uTan.x*uR + vNdc.y*uTan.y*uU);
    float lon = atan(d.x, -d.z);
    float lat = asin(clamp(d.y,-1.,1.));
    vec2 uv = vec2(0.5 + lon/(2.*PI), 0.5 - lat/PI);
    vec2 dx = dFdx(uv), dy = dFdy(uv);
    if (abs(dx.x) > .5) dx.x -= sign(dx.x);
    if (abs(dy.x) > .5) dy.x -= sign(dy.x);
    vec3 c = textureGrad(uTex, uv, dx, dy).rgb;
    if (uVR == 1) {
      // hotspot discs (both eyes)
      for (int i = 0; i < 12; i++) {
        if (i >= uHsN) break;
        float a = acos(clamp(dot(d, normalize(uHs[i].xyz)), -1., 1.));
        float r = 0.045;
        float ring = smoothstep(r, r-0.004, a) - smoothstep(r-0.009, r-0.013, a);
        float dot_ = smoothstep(0.016, 0.012, a);
        vec3 gold = vec3(0.86,0.70,0.47);
        c = mix(c, c*0.55, smoothstep(r+0.01, r, a)*0.6);
        c = mix(c, gold, clamp(ring + dot_, 0., 1.));
      }
      // reticle at view centre
      float rc = length(vNdc*vec2(uTan.x/uTan.y,1.));
      float ret = smoothstep(0.022,0.018,rc) - smoothstep(0.014,0.010,rc);
      float ang = atan(vNdc.x*(uTan.x/uTan.y), vNdc.y)/(2.*PI)+0.5;
      float prog = (smoothstep(0.05,0.046,rc) - smoothstep(0.038,0.034,rc)) * step(ang, uGaze);
      c = mix(c, vec3(1.), clamp(ret + prog, 0., 1.));
    }
    o = vec4(c*uFade, 1.);
  }`;

  function Viewer(canvas, opts) {
    this.canvas = canvas;
    this.o = Object.assign({ fov: 75, minFov: 35, maxFov: 100, autoRotate: true, autoRotateSpeed: 3, autoRotateDelay: 4 }, opts || {});
    this.yaw = 0; this.pitch = 0; this.fov = this.o.fov;
    this.vYaw = 0; this.vPitch = 0;
    this.fade = 0; this.fadeTarget = 1;
    this.autoRotate = this.o.autoRotate;
    this.lastInteract = performance.now();
    this.hotspots = [];
    this.vr = false; this.gyro = false;
    this.gaze = { idx: -1, t0: 0, p: 0 };
    this.onFrame = null; this.onGazeSelect = null;
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error("WebGL2 not supported");
    this.gl = gl;
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.aniso = gl.getExtension("EXT_texture_filter_anisotropic");
    this._initGL();
    this._bindInput();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  Viewer.prototype._initGL = function () {
    const gl = this.gl;
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x);
      if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p); gl.useProgram(p); this.prog = p;
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    ["uTex", "uF", "uR", "uU", "uTan", "uFade", "uVR", "uHsN", "uHs", "uGaze"].forEach(n => this.u[n] = gl.getUniformLocation(p, n));
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([20, 16, 14, 255]));
  };

  /* Upload an HTMLImageElement as the panorama. Downscales if bigger than GPU limit. */
  Viewer.prototype.setImage = function (img) {
    const gl = this.gl;
    let src = img;
    const max = Math.min(this.maxTex, 16384);
    if (img.naturalWidth > max) {
      const c = document.createElement("canvas");
      c.width = max; c.height = max / 2;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      src = c;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); // throws SecurityError for tainted file:// images
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  };

  Viewer.prototype.setView = function (yaw, pitch, fov) {
    this.yaw = wrap(yaw); this.pitch = clamp(pitch, -89, 89);
    if (fov != null) this.fov = clamp(fov, this.o.minFov, this.o.maxFov);
    this.vYaw = this.vPitch = 0;
    if (this.gyro) this._gyroRecenter = true;
  };

  /* hotspots: [{yaw, pitch, type:'scene'|'info', el}] */
  Viewer.prototype.setHotspots = function (list) { this.hotspots = list || []; };

  Viewer.prototype.dirOf = function (yaw, pitch) {
    const y = yaw * D2R, p = pitch * D2R;
    return [Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)];
  };

  Viewer.prototype._basis = function () {
    const f = this.dirOf(this.yaw, this.pitch);
    const y = this.yaw * D2R;
    const r = [Math.cos(y), 0, Math.sin(y)];
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    return { f, r, u };
  };

  Viewer.prototype.interact = function () { this.lastInteract = performance.now(); };

  /* ---------- input ---------- */
  Viewer.prototype._bindInput = function () {
    const c = this.canvas, self = this;
    const ptrs = new Map(); let lastX = 0, lastY = 0, lastT = 0, pinchD = 0, pinchF = 0, moved = 0;
    c.addEventListener("pointerdown", (e) => {
      c.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      lastX = e.clientX; lastY = e.clientY; lastT = performance.now(); moved = 0;
      self.vYaw = self.vPitch = 0; self.dragging = true; self.interact();
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinchD = Math.hypot(a[0] - b[0], a[1] - b[1]); pinchF = self.fov; }
    });
    c.addEventListener("pointermove", (e) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      self.interact();
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinchD > 0) self.fov = clamp(pinchF * pinchD / d, self.o.minFov, self.o.maxFov);
        return;
      }
      if (self.gyro && !self.vr) { /* drag adjusts gyro offset */ }
      const now = performance.now(), dt = Math.max(1, now - lastT);
      const k = self.fov / c.clientHeight;
      const dx = (e.clientX - lastX) * k, dy = (e.clientY - lastY) * k;
      moved += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY);
      if (self.gyro) self.gyroYawOffset = (self.gyroYawOffset || 0) - dx;
      else { self.yaw = wrap(self.yaw - dx); self.pitch = clamp(self.pitch + dy, -89, 89); }
      self.vYaw = -dx / dt * 16; self.vPitch = dy / dt * 16;
      lastX = e.clientX; lastY = e.clientY; lastT = now;
    });
    const up = (e) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinchD = 0;
      if (ptrs.size === 0) { self.dragging = false; if (performance.now() - lastT > 80) self.vYaw = self.vPitch = 0; }
      if (moved < 6 && self.onClick && e.type === "pointerup") self.onClick(e);
    };
    c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up);
    c.addEventListener("wheel", (e) => {
      e.preventDefault(); self.interact();
      self.fov = clamp(self.fov * Math.pow(1.0015, e.deltaY), self.o.minFov, self.o.maxFov);
    }, { passive: false });
    window.addEventListener("keydown", (e) => {
      if (!self.active) return;
      const s = 4; let h = true;
      if (e.key === "ArrowLeft") self.yaw = wrap(self.yaw - s);
      else if (e.key === "ArrowRight") self.yaw = wrap(self.yaw + s);
      else if (e.key === "ArrowUp") self.pitch = clamp(self.pitch + s, -89, 89);
      else if (e.key === "ArrowDown") self.pitch = clamp(self.pitch - s, -89, 89);
      else if (e.key === "+" || e.key === "=") self.fov = clamp(self.fov - 5, self.o.minFov, self.o.maxFov);
      else if (e.key === "-") self.fov = clamp(self.fov + 5, self.o.minFov, self.o.maxFov);
      else h = false;
      if (h) { self.interact(); e.preventDefault(); }
    });
  };

  /* ---------- gyro ---------- */
  Viewer.prototype.enableGyro = async function (on) {
    if (on) {
      if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
        const r = await DeviceOrientationEvent.requestPermission().catch(() => "denied");
        if (r !== "granted") return false;
      }
      if (!("DeviceOrientationEvent" in window)) return false;
      this._ori = null; this._gyroRecenter = true; this.gyroYawOffset = 0;
      this._onOri = (e) => { if (e.alpha != null) this._ori = e; };
      window.addEventListener("deviceorientation", this._onOri);
      this.gyro = true;
      return true;
    } else {
      window.removeEventListener("deviceorientation", this._onOri);
      this.gyro = false; return true;
    }
  };

  function quatFromEuler(x, y, z) { // order YXZ
    const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
    const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
    return [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 - s1 * s2 * c3, c1 * c2 * c3 + s1 * s2 * s3];
  }
  function qmul(a, b) {
    return [a[0] * b[3] + a[3] * b[0] + a[1] * b[2] - a[2] * b[1], a[1] * b[3] + a[3] * b[1] + a[2] * b[0] - a[0] * b[2],
      a[2] * b[3] + a[3] * b[2] + a[0] * b[1] - a[1] * b[0], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  }
  function qrot(q, v) {
    const [x, y, z, w] = q, ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
    return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
  }
  Viewer.prototype._applyGyro = function () {
    const e = this._ori; if (!e) return;
    const orient = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * D2R;
    let q = quatFromEuler(e.beta * D2R, e.alpha * D2R, -e.gamma * D2R);
    q = qmul(q, [-Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
    q = qmul(q, [0, 0, Math.sin(-orient / 2), Math.cos(-orient / 2)]);
    const f = qrot(q, [0, 0, -1]);
    const gYaw = Math.atan2(f[0], -f[2]) * R2D, gPitch = Math.asin(clamp(f[1], -1, 1)) * R2D;
    if (this._gyroRecenter) { this.gyroYawOffset = this.yaw - gYaw; this._gyroRecenter = false; }
    this.yaw = wrap(gYaw + (this.gyroYawOffset || 0));
    this.pitch = clamp(gPitch, -89, 89);
  };

  /* ---------- projection for DOM hotspots ---------- */
  Viewer.prototype.project = function (yaw, pitch, w, h) {
    const b = this._basis(), d = this.dirOf(yaw, pitch);
    const z = d[0] * b.f[0] + d[1] * b.f[1] + d[2] * b.f[2];
    if (z <= 0.05) return null;
    const x = d[0] * b.r[0] + d[1] * b.r[1] + d[2] * b.r[2];
    const y = d[0] * b.u[0] + d[1] * b.u[1] + d[2] * b.u[2];
    const ty = Math.tan(this.fov * D2R / 2), tx = ty * w / h;
    return { x: (x / z / tx + 1) / 2 * w, y: (1 - y / z / ty) / 2 * h };
  };

  /* view direction -> yaw/pitch of a clicked screen point */
  Viewer.prototype.unproject = function (px, py) {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight, b = this._basis();
    const ty = Math.tan(this.fov * D2R / 2), tx = ty * w / h;
    const nx = (px / w) * 2 - 1, ny = 1 - (py / h) * 2;
    let d = [0, 1, 2].map(i => b.f[i] + nx * tx * b.r[i] + ny * ty * b.u[i]);
    const l = Math.hypot(...d); d = d.map(v => v / l);
    return { yaw: Math.atan2(d[0], -d[2]) * R2D, pitch: Math.asin(d[1]) * R2D };
  };

  /* ---------- loop ---------- */
  Viewer.prototype._loop = function (t) {
    requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, (t - (this._t || t)) / 1000); this._t = t;
    if (!this.active) return;
    const gl = this.gl, c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(c.clientWidth * dpr), H = Math.round(c.clientHeight * dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }

    if (this.gyro) this._applyGyro();
    else if (!this.dragging) {
      if (Math.abs(this.vYaw) > 0.001 || Math.abs(this.vPitch) > 0.001) {
        this.yaw = wrap(this.yaw + this.vYaw); this.pitch = clamp(this.pitch + this.vPitch, -89, 89);
        this.vYaw *= 0.92; this.vPitch *= 0.92;
      } else if (this.autoRotate && !this.anim && (t - this.lastInteract) / 1000 > this.o.autoRotateDelay) {
        this.yaw = wrap(this.yaw + this.o.autoRotateSpeed * dt);
        this.pitch += (0 - this.pitch) * dt * 0.3;
      }
    }
    if (this.anim) this.anim(t);
    this.fade += (this.fadeTarget - this.fade) * Math.min(1, dt * 7);

    const b = this._basis();
    gl.uniform3fv(this.u.uF, b.f); gl.uniform3fv(this.u.uR, b.r); gl.uniform3fv(this.u.uU, b.u);
    gl.uniform1f(this.u.uFade, this.fade);
    gl.uniform1i(this.u.uTex, 0);

    if (this.vr) {
      const hs = this.hotspots.slice(0, 12), arr = new Float32Array(48);
      hs.forEach((h, i) => { const d = this.dirOf(h.yaw, h.pitch); arr.set([d[0], d[1], d[2], h.type === "scene" ? 1 : 2], i * 4); });
      gl.uniform4fv(this.u.uHs, arr); gl.uniform1i(this.u.uHsN, hs.length); gl.uniform1i(this.u.uVR, 1);
      this._updateGaze(t, b, hs);
      gl.uniform1f(this.u.uGaze, this.gaze.p);
      const ty = Math.tan(Math.min(this.fov, 90) * D2R / 2);
      gl.uniform2f(this.u.uTan, ty * (W / 2) / H, ty);
      gl.viewport(0, 0, W / 2, H); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.viewport(W / 2, 0, W / 2, H); gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      gl.uniform1i(this.u.uVR, 0); gl.uniform1i(this.u.uHsN, 0);
      const ty = Math.tan(this.fov * D2R / 2);
      gl.uniform2f(this.u.uTan, ty * W / H, ty);
      gl.viewport(0, 0, W, H); gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    if (this.onFrame) this.onFrame();
  };

  Viewer.prototype._updateGaze = function (t, b, hs) {
    let best = -1, bestA = 1e9;
    hs.forEach((h, i) => {
      const d = this.dirOf(h.yaw, h.pitch);
      const a = Math.acos(clamp(d[0] * b.f[0] + d[1] * b.f[1] + d[2] * b.f[2], -1, 1));
      if (a < 0.06 && a < bestA) { bestA = a; best = i; }
    });
    if (best !== this.gaze.idx) { this.gaze.idx = best; this.gaze.t0 = t; this.gaze.p = 0; this.gaze.fired = false; }
    if (best >= 0 && !this.gaze.fired) {
      this.gaze.p = Math.min(1, (t - this.gaze.t0) / 1600);
      if (this.gaze.p >= 1) { this.gaze.fired = true; this.gaze.p = 0; if (this.onGazeSelect) this.onGazeSelect(hs[best]); }
    }
  };

  /* smooth camera tween */
  Viewer.prototype.tweenTo = function (yaw, pitch, fov, ms) {
    return new Promise((res) => {
      const y0 = this.yaw, p0 = this.pitch, f0 = this.fov, dy = wrap(yaw - y0), t0 = performance.now();
      this.vYaw = this.vPitch = 0;
      this.anim = (t) => {
        const k = clamp((t - t0) / ms, 0, 1), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        if (!this.gyro) { this.yaw = wrap(y0 + dy * e); this.pitch = p0 + (pitch - p0) * e; }
        this.fov = f0 + (fov - f0) * e;
        if (k >= 1) { this.anim = null; res(); }
      };
    });
  };

  Viewer.wrap = wrap;
  window.PanoViewer = Viewer;
})();
