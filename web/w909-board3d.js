// 3D model of the Syntax W909 used as the key picker, drawn with three.js (web/vendor/three.min.js).
// It takes over the 2D board: the key buttons app.js builds become floating labels, and clicking a cap clicks its
// button, so selection and editing stay in app.js. Without WebGL the 2D board stays.
//
// Units are millimetres. X = right, Y = up, Z = toward the user. Sizes are estimated from photos of the pad.

const W909Board3D = (() => {
  const U = 19.05;
  const W = 166, D = 130;                   // case footprint
  const M = 7, PAD = 3.2, GAP = 4.5;        // case margin, tray padding, ridge between trays
  const Y_FLOOR = 16, Y_TOP = 22;           // switch plate (tray floor), top surface
  const Y_BODY = 7, Y_FRONT = 11, Y_FEET = 1.2; // upper shell bottom, front lip height, rubber feet
  const STEM = 5.4, CAP_H = 8.6, TRAVEL = 3.6;
  const TRAY_D = U + 2 * PAD;
  const trayW = (u) => u * U + 2 * PAD;
  const Z_A = -D / 2 + M, Z_B = Z_A + TRAY_D + GAP, Z_C = Z_B + TRAY_D + GAP; // tray back edges
  const Z_SLOPE = Z_C + TRAY_D + 4;
  const RIGHT = W / 2 - M;
  const TRAYS = {
    "row-a": { x: RIGHT - trayW(6), z: Z_A, u: 6, tilt: 0.12 },
    "row-b": { x: RIGHT - trayW(7), z: Z_B, u: 7, tilt: 0.06 },
    "row-c": { x: RIGHT - trayW(7), z: Z_C, u: 5.25, tilt: 0 },
  };
  const KNOB = { x: (-W / 2 + M + TRAYS["row-a"].x) / 2, z: Z_A + TRAY_D / 2, r: 13.6 };
  const JOY = { x: (TRAYS["row-c"].x + trayW(5.25) + RIGHT) / 2, z: Z_C + TRAY_D / 2, r: 12 };
  const slopeY = (z) => Y_TOP - ((z - Z_SLOPE) * (Y_TOP - Y_FRONT)) / (D / 2 - Z_SLOPE);

  const COLORS = { orange: "#e07c12", dark: "#27282b", light: "#8e8f92", case: "#232326", plate: "#0c0c0d", logo: "#eb9c00" };
  const INK = { orange: "#5a4431", dark: "#f3f3f3", light: "#ffffff" };
  const ACCENT = "#6c8cff";

  // ---------- geometry helpers ----------
  function roundedRect(shape, x, y, w, h, r) {
    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
    return shape;
  }
  // Plan shapes are drawn in (x, -z) so that after rotateX(-90°) the extrusion points up.
  const planRect = (x0, z0, x1, z1, r, Kind = THREE.Shape) => roundedRect(new Kind(), x0, -z1, x1 - x0, z1 - z0, r);

  // Rounded-rect with different radii at the back (far) and front (near) corners, in plan coordinates.
  function planRect2(x0, z0, x1, z1, rBack, rFront) {
    const s = new THREE.Shape();
    const y0 = -z1, y1 = -z0; // y0 = front, y1 = back
    s.moveTo(x0 + rFront, y0);
    s.lineTo(x1 - rFront, y0); if (rFront) s.quadraticCurveTo(x1, y0, x1, y0 + rFront);
    s.lineTo(x1, y1 - rBack); if (rBack) s.quadraticCurveTo(x1, y1, x1 - rBack, y1);
    s.lineTo(x0 + rBack, y1); if (rBack) s.quadraticCurveTo(x0, y1, x0, y1 - rBack);
    s.lineTo(x0, y0 + rFront); if (rFront) s.quadraticCurveTo(x0, y0, x0 + rFront, y0);
    return s;
  }

  function extrudeUp(shape, y0, y1, bevel, segments = 4, curveSegments = 10) {
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: y1 - y0 - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel,
      bevelOffset: -bevel, bevelSegments: segments, curveSegments,
    });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, y0 + bevel, 0);
    return geo;
  }

  // ExtrudeGeometry is flat-shaded. Rebuild normals, averaging faces that meet at under `angle` degrees,
  // weighted by area so big flat faces stay flat.
  function smooth(geo, angle = 35) {
    const pos = geo.attributes.position;
    const n = pos.count;
    const face = []; // area-weighted normal per triangle
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < n; i += 3) {
      a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
      const nrm = new THREE.Vector3().crossVectors(b.sub(a), c.sub(a));
      face.push(nrm);
    }
    const key = (i) => `${Math.round(pos.getX(i) * 100)},${Math.round(pos.getY(i) * 100)},${Math.round(pos.getZ(i) * 100)}`;
    const byPos = new Map();
    for (let i = 0; i < n; i++) {
      const k = key(i);
      if (!byPos.has(k)) byPos.set(k, []);
      byPos.get(k).push(i / 3 | 0);
    }
    const cos = Math.cos((angle * Math.PI) / 180);
    const normals = new Float32Array(n * 3);
    const unit = face.map((f) => f.clone().normalize());
    const sum = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const f = i / 3 | 0;
      sum.set(0, 0, 0);
      for (const g of byPos.get(key(i))) if (unit[g].dot(unit[f]) > cos) sum.add(face[g]);
      if (sum.lengthSq() === 0) sum.copy(unit[f]);
      sum.normalize();
      normals.set([sum.x, sum.y, sum.z], i * 3);
    }
    geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    return geo;
  }

  // ---------- textures ----------
  function canvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return [c, c.getContext("2d")];
  }

  // Fine stipple for the textured plastic.
  function noiseTexture(size = 256, soft = 1) {
    const [c, g] = canvas(size, size);
    const img = g.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const v = 128 + (Math.random() - 0.5) * 255;
      img.data.set([v, v, v, 255], i * 4);
    }
    g.putImageData(img, 0, 0);
    if (soft) { g.filter = `blur(${soft}px)`; g.drawImage(c, 0, 0); }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  function radialTexture(inner = "rgba(255,255,255,1)", outer = "rgba(255,255,255,0)") {
    const [c, g] = canvas(128, 128);
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, inner); grad.addColorStop(1, outer);
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  const LEGEND_FONT = '"Avenir Next", "Avenir", "Helvetica Neue", Arial, sans-serif';
  function legendTexture(text, color, wMM, dMM, renderer) {
    const ppm = 28; // pixels per millimetre
    const [c, g] = canvas(Math.round(wMM * ppm), Math.round(dMM * ppm));
    g.fillStyle = COLORS[color]; g.fillRect(0, 0, c.width, c.height);
    if (text) {
      const long = text.length > 2;
      g.fillStyle = INK[color];
      g.font = `${long ? 600 : 500} ${Math.round((long ? 3.6 : 8.2) * ppm)}px ${LEGEND_FONT}`;
      if (long) g.letterSpacing = `${Math.round(0.5 * ppm)}px`;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(text === "•" ? "·" : text, c.width / 2 + (long ? 0.25 * ppm : 0), c.height / 2 + 0.3 * ppm);
    }
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    // Cap UVs are the shape's own coordinates in mm, centred on 0.
    t.repeat.set(1 / wMM, 1 / dMM);
    t.offset.set(0.5, 0.5);
    return t;
  }

  function logoTexture(renderer) {
    const [c, g] = canvas(2048, 512);
    g.fillStyle = COLORS.logo;
    g.font = `800 380px ${LEGEND_FONT}`;
    g.letterSpacing = "-14px";
    g.textBaseline = "middle";
    g.fillText("Syntax.", 20, 270);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }

  // A small studio (softboxes in a dark room) for reflections.
  function studio(renderer) {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: 0x15161a, side: THREE.BackSide })));
    const panel = (w, h, pos, intensity, color = 0xffffff) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
      m.position.set(...pos); m.lookAt(0, 0, 0); env.add(m);
    };
    panel(5, 2.6, [0, 4.8, 1.2], 2.6);              // overhead softbox
    panel(1.4, 4, [-4.8, 1.8, 1.5], 1.6);          // left strip
    panel(1.4, 4, [4.8, 1.4, -1.5], 1.1, 0xffe2bd); // warm right strip
    panel(5, 0.8, [0, 1.2, -4.8], 1.2);            // back rim
    panel(3, 1.2, [0, 0.6, 4.8], 0.3);             // weak fill from the front
    const pm = new THREE.PMREMGenerator(renderer);
    const tex = pm.fromScene(env, 0.03).texture;
    pm.dispose();
    return tex;
  }

  // ---------- the model ----------
  function build(scene, renderer, slots) {
    const stipple = noiseTexture(256, 0.6);
    stipple.repeat.set(1 / 22, 1 / 22);
    const caseMat = new THREE.MeshStandardMaterial({ color: COLORS.case, roughness: 0.78, metalness: 0, bumpMap: stipple, bumpScale: 0.25 });
    const plateMat = new THREE.MeshStandardMaterial({ color: COLORS.plate, roughness: 0.9 });
    const add = (geo, mat, { cast = true, receive = true } = {}) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = cast; m.receiveShadow = receive;
      scene.add(m);
      return m;
    };

    // Upper shell, back part: flat top with the trays and joystick recess cut out.
    const top = planRect2(-W / 2, -D / 2, W / 2, Z_SLOPE, 9, 0);
    for (const t of Object.values(TRAYS)) top.holes.push(planRect(t.x, t.z, t.x + trayW(t.u), t.z + TRAY_D, 3.4, THREE.Path));
    const joyHole = new THREE.Path();
    joyHole.absarc(JOY.x, -JOY.z, JOY.r, 0, Math.PI * 2, true);
    top.holes.push(joyHole);
    add(smooth(extrudeUp(top, Y_BODY, Y_TOP, 1.3, 4, 14)), caseMat);

    // Upper shell, front lip: same outline, top squashed onto the slope.
    const lipGeo = extrudeUp(planRect2(-W / 2, Z_SLOPE - 0.01, W / 2, D / 2, 0, 9), Y_BODY, Y_TOP, 1.3, 4, 14);
    const lp = lipGeo.attributes.position;
    for (let i = 0; i < lp.count; i++) {
      const y = lp.getY(i), z = lp.getZ(i);
      lp.setY(i, Y_BODY + ((y - Y_BODY) * (slopeY(z) - Y_BODY)) / (Y_TOP - Y_BODY));
    }
    add(smooth(lipGeo), caseMat);

    // Lower shell, inset a little and stopping short of the overhanging front lip.
    add(smooth(extrudeUp(planRect2(-W / 2 + 1.6, -D / 2 + 1.6, W / 2 - 1.6, D / 2 - 10, 7.5, 5), Y_FEET, Y_BODY + 1, 1.2)), caseMat);
    // Rubber feet
    const footMat = new THREE.MeshStandardMaterial({ color: "#0b0b0b", roughness: 0.95 });
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const f = add(new THREE.CylinderGeometry(5, 5, Y_FEET + 0.2, 24), footMat, { receive: false });
      f.position.set(x * (W / 2 - 14), (Y_FEET + 0.2) / 2, z * (D / 2 - 20) - (z > 0 ? 6 : 0));
    }
    // USB-C port on the back
    const port = add(smooth(extrudeUp(planRect(-4.6, -1.6, 4.6, 1.6, 1.5), 0, 2, 0.3)), new THREE.MeshStandardMaterial({ color: "#050505", roughness: 0.4, metalness: 0.6 }), { cast: false });
    port.rotation.x = Math.PI / 2;
    port.position.set(-18, 4.6, -D / 2 + 1.0);

    // Tray floors (the switch plate) and joystick recess floor
    for (const t of Object.values(TRAYS)) {
      const f = add(new THREE.ShapeGeometry(planRect(t.x, t.z, t.x + trayW(t.u), t.z + TRAY_D, 3.4), 8), plateMat, { cast: false });
      f.rotation.x = -Math.PI / 2; f.position.y = Y_FLOOR;
    }
    const joyFloor = add(new THREE.CircleGeometry(JOY.r + 0.5, 48), plateMat, { cast: false });
    joyFloor.rotation.x = -Math.PI / 2; joyFloor.position.set(JOY.x, Y_FLOOR + 2, JOY.z);

    // Logo on the slope
    const angle = Math.atan((Y_TOP - Y_FRONT) / (D / 2 - Z_SLOPE));
    const logo = add(new THREE.PlaneGeometry(112, 28), new THREE.MeshStandardMaterial({
      map: logoTexture(renderer), transparent: true, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2,
    }), { cast: false });
    logo.rotation.x = -(Math.PI / 2 - angle);
    const zLogo = Z_SLOPE + (D / 2 - Z_SLOPE) * 0.52;
    logo.position.set(-W / 2 + 12 + 56, slopeY(zLogo) + 0.05, zLogo);

    // Soft contact shadow under the case
    const blob = add(new THREE.PlaneGeometry(W + 60, D + 60), new THREE.MeshBasicMaterial({
      map: radialTexture("rgba(0,0,0,0.75)", "rgba(0,0,0,0)"), transparent: true, depthWrite: false,
    }), { cast: false, receive: false });
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.05;
    const floor = add(new THREE.PlaneGeometry(1400, 1400), new THREE.ShadowMaterial({ opacity: 0.38 }), { cast: false });
    floor.rotation.x = -Math.PI / 2;

    // ---------- keys ----------
    const parts = [];
    const leds = [];
    const capGeoCache = new Map();
    const housingMat = new THREE.MeshStandardMaterial({ color: "#d8dee6", roughness: 0.25, transparent: true, opacity: 0.38, emissive: "#000000" });
    const poolTex = radialTexture();
    const capStipple = noiseTexture(256, 0.5);
    capStipple.repeat.set(1 / 9, 1 / 9);

    function capGeo(wMM, dMM) {
      const k = `${wMM}x${dMM}`;
      if (capGeoCache.has(k)) return capGeoCache.get(k);
      const geo = extrudeUp(planRect(-wMM / 2, -dMM / 2, wMM / 2, dMM / 2, 2.4), 0, CAP_H, 1.7, 5, 8);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { // taper toward the top
        const t = Math.max(0, p.getY(i)) / CAP_H;
        p.setX(i, p.getX(i) * (1 - (t * 5.4) / wMM));
        p.setZ(i, p.getZ(i) * (1 - (t * 5.0) / dMM) - t * 0.6);
      }
      smooth(geo, 40);
      capGeoCache.set(k, geo);
      return geo;
    }

    function addLed(x, z, wMM, xNorm) {
      const housing = add(new THREE.BoxGeometry(Math.min(wMM, 15), STEM, 15), housingMat.clone(), { cast: false });
      housing.position.set(x, Y_FLOOR + STEM / 2, z);
      const pool = add(new THREE.PlaneGeometry(wMM + 16, 34), new THREE.MeshBasicMaterial({
        map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
      }), { cast: false, receive: false });
      pool.rotation.x = -Math.PI / 2; pool.position.set(x, Y_FLOOR + 0.15, z);
      const led = { housing, pool, x: xNorm };
      leds.push(led);
      return led;
    }

    const ROW_ORDER = ["row-a", "row-b", "row-c"];
    for (const rowId of ROW_ORDER) {
      const tray = TRAYS[rowId];
      let u = 0;
      for (const el of slots.filter((s) => s.dataset.row === rowId && s.classList.contains("cap"))) {
        const w = Number(el.style.getPropertyValue("--w")) || 1;
        const color = ["orange", "dark", "light"].find((c) => el.classList.contains(c)) || "dark";
        const legend = el.querySelector("small")?.textContent || "";
        const wMM = w * U - 1.1, dMM = U - 1.1;
        const x = tray.x + PAD + (u + w / 2) * U, z = tray.z + PAD + U / 2;
        u += w;
        const top = new THREE.MeshStandardMaterial({ map: legendTexture(legend, color, wMM, dMM, renderer), roughness: 0.6, bumpMap: capStipple, bumpScale: 0.06, emissive: ACCENT, emissiveIntensity: 0 });
        const side = new THREE.MeshStandardMaterial({ color: COLORS[color], roughness: 0.62, bumpMap: capStipple, bumpScale: 0.06, emissive: ACCENT, emissiveIntensity: 0 });
        const group = new THREE.Group();
        const cap = new THREE.Mesh(capGeo(wMM, dMM), [top, side]);
        cap.castShadow = cap.receiveShadow = true;
        cap.rotation.x = tray.tilt;
        group.add(cap);
        group.position.set(x, Y_FLOOR + STEM, z);
        scene.add(group);
        const led = addLed(x, z, wMM, (x + W / 2) / W);
        parts.push({ el, led, group, mats: [top, side], baseY: group.position.y, travel: 0, max: TRAVEL, anchor: new THREE.Vector3(x, Y_TOP + 0.5, z + U / 2 + 1.5), hit: cap });
      }
    }

    // Knob: lathe profile with softened top edge
    const knobMat = new THREE.MeshStandardMaterial({ color: COLORS.orange, roughness: 0.55, bumpMap: capStipple, bumpScale: 0.12, emissive: ACCENT, emissiveIntensity: 0 });
    const r = KNOB.r, h = 12.5;
    const prof = [[0, 0], [r - 0.6, 0], [r, 0.6], [r, h - 1.6], [r - 0.25, h - 0.6], [r - 1.0, h - 0.08], [r - 1.6, h], [0, h]].map(([a, b]) => new THREE.Vector2(a, b));
    const knob = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), knobMat);
    knob.castShadow = knob.receiveShadow = true;
    const knobGroup = new THREE.Group();
    knobGroup.add(knob);
    knobGroup.position.set(KNOB.x, Y_TOP + 0.8, KNOB.z);
    scene.add(knobGroup);
    const knobRing = add(new THREE.CylinderGeometry(r + 0.6, r + 0.6, 0.8, 64), plateMat, { cast: false });
    knobRing.position.set(KNOB.x, Y_TOP + 0.4, KNOB.z);

    // Joystick: rubber boot, stem and mushroom cap, pivoting at the floor
    const rubber = new THREE.MeshStandardMaterial({ color: "#121212", roughness: 0.95 });
    const boot = add(new THREE.TorusGeometry(JOY.r - 3, 2.6, 20, 64), rubber, { cast: false });
    boot.rotation.x = Math.PI / 2; boot.position.set(JOY.x, Y_FLOOR + 2.6, JOY.z);
    const joyMat = new THREE.MeshStandardMaterial({ color: COLORS.orange, roughness: 0.5, emissive: ACCENT, emissiveIntensity: 0 });
    const joyGroup = new THREE.Group();
    joyGroup.position.set(JOY.x, Y_FLOOR + 2, JOY.z);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.2, 11, 32), joyMat);
    stem.position.y = 5.5; stem.castShadow = true;
    const mush = [[0, 0], [5.5, 0], [8.2, 0.9], [8.6, 2.2], [8.4, 3.6], [7.4, 4.3], [4, 4.55], [0, 4.6]].map(([a, b]) => new THREE.Vector2(a, b));
    const joyCap = new THREE.Mesh(new THREE.LatheGeometry(mush, 64), joyMat);
    joyCap.position.y = 11; joyCap.castShadow = true;
    joyGroup.add(stem, joyCap);
    scene.add(joyGroup);

    const special = (sel) => slots.find((s) => s.matches(sel));
    const knobEl = special('[data-key="2"]'), joyEl = special('[data-key="42"]');
    if (knobEl) parts.push({ el: knobEl, group: knobGroup, mats: [knobMat], baseY: knobGroup.position.y, travel: 0, max: 1.4, anchor: new THREE.Vector3(KNOB.x, Y_TOP + 0.5, KNOB.z - r - 1), hit: knob });
    if (joyEl) parts.push({ el: joyEl, group: joyGroup, mats: [joyMat], baseY: joyGroup.position.y, travel: 0, max: 1.5, anchor: new THREE.Vector3(JOY.x, Y_TOP + 0.5, JOY.z + JOY.r + 3), hit: [stem, joyCap], joystick: true });

    return { parts, leds, joyGroup };
  }

  // ---------- mounting ----------
  function webglOK() {
    try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; }
  }

  // wrap: element holding the 2D #board. glow(t, x) returns the LED color [r, g, b] (0..255) at time t (s) for a
  // key at x (0 = left edge, 1 = right edge), or null when the LEDs are off.
  function mount(wrap, { glow } = {}) {
    if (!window.THREE || !webglOK()) return false;
    THREE.ColorManagement.legacyMode = false;

    const box = document.createElement("div");
    box.className = "board3d";
    const labels = document.createElement("div");
    labels.className = "labels";
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.82;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    box.append(renderer.domElement, labels);
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "Drag to turn · double-click to reset";
    box.append(hint);
    wrap.prepend(box);
    wrap.classList.add("three-d");

    const slots = Array.from(wrap.querySelectorAll("#board .slot[data-key]"));
    slots.forEach((s) => (s.dataset.row = s.closest(".tray")?.id || ""));
    slots.forEach((s) => labels.append(s));

    const scene = new THREE.Scene();
    scene.environment = studio(renderer);
    const key = new THREE.DirectionalLight(0xfff6ec, 1.25);
    key.position.set(-110, 240, 150);
    key.castShadow = true;
    Object.assign(key.shadow.camera, { left: -140, right: 140, top: 140, bottom: -140, near: 50, far: 700 });
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.radius = 3;
    key.shadow.bias = -0.0003;
    key.shadow.normalBias = 0.25;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffe0b8, 0.5);
    rim.position.set(150, 90, -160);
    scene.add(rim);
    scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x1a1410, 0.12));

    const model = build(scene, renderer, slots);
    const trayLights = Object.values(TRAYS).map((t) => {
      const l = new THREE.PointLight(0xffffff, 0, 70, 2);
      l.position.set(t.x + trayW(t.u) / 2, Y_FLOOR + 3, t.z + TRAY_D / 2);
      scene.add(l);
      return l;
    });

    const camera = new THREE.PerspectiveCamera(28, 1, 10, 4000);
    const target = new THREE.Vector3(0, 12, 4);
    const HOME = { yaw: -0.32, pitch: 0.92 };
    const view = { ...HOME };
    const aim = { ...HOME };
    let dist = 500;
    let lastTouch = -1e9;
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

    function resize() {
      const w = box.clientWidth, h = box.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const tan = Math.tan((camera.fov * Math.PI) / 360);
      dist = Math.max(225 / 2 / (tan * camera.aspect), 150 / 2 / tan);
      camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(box);
    resize();

    // ---- pointer: drag to orbit, click to pick ----
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hits = model.parts.flatMap((p) => [].concat(p.hit).map((m) => ((m.userData.part = p), m)));
    let drag = null;
    let hover = null;
    const pick = (e) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return ray.intersectObjects(hits, false)[0]?.object.userData.part || null;
    };
    const cv = renderer.domElement;
    cv.addEventListener("pointerdown", (e) => {
      drag = { x: e.clientX, y: e.clientY, yaw: aim.yaw, pitch: aim.pitch, moved: false };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener("pointermove", (e) => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.hypot(dx, dy) > 4) drag.moved = true;
        if (drag.moved) {
          aim.yaw = Math.max(-1.3, Math.min(1.3, drag.yaw - dx * 0.006));
          aim.pitch = Math.max(0.22, Math.min(1.45, drag.pitch + dy * 0.005));
          lastTouch = performance.now();
          box.classList.add("dragging");
        }
        return;
      }
      hover = pick(e);
      cv.style.cursor = hover ? "pointer" : "grab";
    });
    const end = (e) => {
      if (drag && !drag.moved) pick(e)?.el.click();
      drag = null;
      box.classList.remove("dragging");
    };
    cv.addEventListener("pointerup", end);
    cv.addEventListener("pointercancel", () => { drag = null; box.classList.remove("dragging"); });
    cv.addEventListener("pointerleave", () => { hover = null; });
    cv.addEventListener("dblclick", () => { Object.assign(aim, HOME); lastTouch = -1e9; });
    labels.addEventListener("pointerover", (e) => { hover = model.parts.find((p) => p.el === e.target.closest(".slot")) || null; });
    labels.addEventListener("pointerout", () => { hover = null; });

    // ---- frame loop ----
    const v = new THREE.Vector3();
    const glowColor = new THREE.Color();
    const tilt = { x: 0, z: 0 };
    const joyEls = Object.fromEntries([50, 58, 66, 74].map((i) => [i, document.querySelector(`.slot[data-key="${i}"]`)]));
    const held = (i) => joyEls[i]?.classList.contains("pressed");

    function frame(now) {
      requestAnimationFrame(frame);
      if (!box.clientWidth) return;
      const t = now / 1000;
      const idle = !calm && now - lastTouch > 4000 ? 1 : 0;
      const sway = idle * Math.sin(t * 0.25) * 0.07;
      view.yaw += (aim.yaw + sway - view.yaw) * 0.08;
      view.pitch += (aim.pitch + idle * Math.sin(t * 0.19) * 0.025 - view.pitch) * 0.08;
      camera.position.set(
        target.x + dist * Math.sin(view.yaw) * Math.cos(view.pitch),
        target.y + dist * Math.sin(view.pitch),
        target.z + dist * Math.cos(view.yaw) * Math.cos(view.pitch));
      camera.lookAt(target);

      const w = box.clientWidth, h = box.clientHeight;
      for (const p of model.parts) {
        const pressed = p.el.classList.contains("pressed");
        const selected = p.el.classList.contains("selected");
        // Held keys sink; the selected one floats up a little.
        p.travel += ((pressed ? p.max : selected ? -1.2 : 0) - p.travel) * (pressed ? 0.45 : 0.15);
        p.group.position.y = p.baseY - p.travel;
        const e = selected ? 0.05 : p === hover ? 0.06 : 0;
        for (const m of p.mats) m.emissiveIntensity += (e - m.emissiveIntensity) * 0.25;
        v.copy(p.anchor).project(camera);
        p.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`;
      }
      // Joystick leans toward the held direction.
      const tx = (held(66) ? 0.32 : 0) - (held(74) ? 0.32 : 0);
      const tz = (held(50) ? 0.32 : 0) - (held(58) ? 0.32 : 0);
      tilt.x += (tx - tilt.x) * 0.3; tilt.z += (tz - tilt.z) * 0.3;
      model.joyGroup.rotation.set(tilt.x, 0, tilt.z);

      // LEDs
      const offline = document.body.classList.contains("offline");
      let total = [0, 0, 0];
      for (const led of model.leds) {
        const c = !offline && glow ? glow(t, led.x) : null;
        const on = !!c && c.some((x) => x > 2);
        led.pool.visible = on;
        if (on) {
          glowColor.setStyle(`rgb(${c.map((x) => Math.round(x)).join(",")})`);
          led.pool.material.color.copy(glowColor);
          led.pool.material.opacity = 0.7;
          led.housing.material.emissive.copy(glowColor);
          led.housing.material.emissiveIntensity = 0.9;
          total = total.map((s, i) => s + c[i]);
        } else led.housing.material.emissiveIntensity = 0;
      }
      // The selected key gets an accent halo on the plate instead of its LED color.
      const sel = model.parts.find((p) => p.led && p.el.classList.contains("selected"));
      if (sel) {
        sel.led.pool.visible = true;
        sel.led.pool.material.color.set(ACCENT);
        sel.led.pool.material.opacity = 0.75 + 0.25 * Math.sin(t * 4);
      }
      const n = model.leds.length;
      const avg = total.map((s) => s / n);
      const level = Math.max(...avg) / 255;
      trayLights.forEach((l) => {
        if (level > 0.01) l.color.setStyle(`rgb(${avg.map((x) => Math.round(x)).join(",")})`);
        l.intensity = level * 0.9;
      });

      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
    return true;
  }

  return { mount };
})();
