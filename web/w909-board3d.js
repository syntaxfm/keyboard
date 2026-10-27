// 3D model of the Syntax W909 used as the key picker, drawn with three.js (web/vendor/three.min.js).
// It takes over the 2D board: the key buttons app.js builds become floating labels, and clicking a cap clicks its
// button, so selection and editing stay in app.js. Without WebGL the 2D board stays.
//
// Units are millimetres. X = right, Y = up, Z = toward the user. Sizes are estimated from photos of the pad.

const W909Board3D = (() => {
  const U = 19.05;
  const W = 166, D = 124;                   // case footprint
  const M = 7, PAD = 1.9, GAP = 5;          // case margin, tray padding, ridge between trays
  const DEPTH = 6;                          // tray depth below its tier
  const Y_BODY = 7, Y_FRONT = 8.6, Y_FEET = 1.2; // upper shell bottom, front lip height, rubber feet
  const STEM = 5.2, CAP_H = 8.8, TRAVEL = 3.6;
  const TRAY_D = U + 2 * PAD;
  const trayW = (u) => u * U + 2 * PAD;
  const Z_A = -D / 2 + M, Z_B = Z_A + TRAY_D + GAP, Z_C = Z_B + TRAY_D + GAP; // tray back edges
  const Z_SLOPE = Z_C + TRAY_D + 3.5;
  const RIGHT = W / 2 - M;
  // The top steps down row by row, like the real case.
  const TRAYS = {
    "row-a": { x: RIGHT - trayW(6), z: Z_A, u: 6, top: 24.5, tilt: 0.11 },
    "row-b": { x: RIGHT - trayW(7), z: Z_B, u: 7, top: 22, tilt: 0.05 },
    "row-c": { x: RIGHT - trayW(7), z: Z_C, u: 5.25, top: 19.5, tilt: -0.02 },
  };
  for (const t of Object.values(TRAYS)) t.floor = t.top - DEPTH;
  const TA = TRAYS["row-a"], TC = TRAYS["row-c"];
  const KNOB = { x: (-W / 2 + M + TA.x) / 2, z: Z_A + TRAY_D / 2, r: 13.4 };
  const JOY = { x: (TC.x + trayW(5.25) + RIGHT) / 2, z: Z_C + TRAY_D / 2, r: 11 };
  const slopeY = (z) => TC.top - ((z - Z_SLOPE) * (TC.top - Y_FRONT)) / (D / 2 - Z_SLOPE);

  const COLORS = { orange: "#e07c12", dark: "#252629", light: "#8c8d90", case: "#222224", plate: "#0b0b0c", logo: "#e9a10f" };
  const INK = { orange: "#4f3c2c", dark: "#f3f3f3", light: "#ffffff" };
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

  // Rounded rect with different radii at the back (far) and front (near) corners, in plan coordinates.
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
      face.push(new THREE.Vector3().crossVectors(b.sub(a), c.sub(a)));
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

  // Cherry-style keycap built ring by ring: tapered sides, a rounded top edge and a cylindrical dish.
  // Group 0 is the top (carries the legend), group 1 the sides.
  const CAP = { F: 1.7, DISH: 0.6, inX: 2.8, inZ: 2.5, back: 0.7 };
  function capGeometry(w, d) {
    const S = 6, E = 8; // points per corner arc, points per straight edge
    const hw1 = w / 2 - CAP.inX, hd1 = d / 2 - CAP.inZ; // where the sides meet the rounded top edge
    function ring(hw, hd, r) {
      r = Math.max(0.05, Math.min(r, hw - 0.01, hd - 0.01));
      const cs = [[hw - r, hd - r], [-(hw - r), hd - r], [-(hw - r), -(hd - r)], [hw - r, -(hd - r)]];
      const pts = [];
      for (let c = 0; c < 4; c++) {
        for (let s = 0; s <= S; s++) {
          const a = (c + s / S) * (Math.PI / 2);
          pts.push([cs[c][0] + r * Math.cos(a), cs[c][1] + r * Math.sin(a)]);
        }
        const [ax, az] = pts[pts.length - 1];
        const nc = cs[(c + 1) % 4], a1 = ((c + 1) % 4) * (Math.PI / 2);
        const bx = nc[0] + r * Math.cos(a1), bz = nc[1] + r * Math.sin(a1);
        for (let e = 1; e <= E; e++) pts.push([ax + ((bx - ax) * e) / (E + 1), az + ((bz - az) * e) / (E + 1)]);
      }
      return pts;
    }
    const rings = []; // [points, y, dish weight, isTop]
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      rings.push([ring(w / 2 + (hw1 - w / 2) * t, d / 2 + (hd1 - d / 2) * t, 1.2 + 1.6 * t), t * (CAP_H - CAP.F), 0, false, t]);
    }
    for (let j = 1; j <= 6; j++) {
      const th = (j / 6) * (Math.PI / 2), inset = CAP.F * (1 - Math.cos(th));
      rings.push([ring(hw1 - inset, hd1 - inset, 2.8 - inset), CAP_H - CAP.F + CAP.F * Math.sin(th), Math.sin(th), false, 1]);
    }
    for (let k = 1; k <= 6; k++) {
      const s = Math.max(0.002, 1 - k / 6);
      rings.push([ring((hw1 - CAP.F) * s, (hd1 - CAP.F) * s, (2.8 - CAP.F) * s), CAP_H, 1, true, 1]);
    }
    const M = rings[0][0].length;
    const pos = [], uv = [];
    const hwT = hw1 - CAP.F, hdT = hd1 - CAP.F; // flat top, which the legend spans
    for (const [pts, y, dish, , t] of rings) {
      for (const [x, z] of pts) {
        const q = Math.min(1, (x / hw1) ** 2);
        pos.push(x, y - CAP.DISH * (1 - q) * dish, z - CAP.back * t);
        uv.push(x / (2 * hwT) + 0.5, -z / (2 * hdT) + 0.5);
      }
    }
    const side = [], top = [];
    for (let r = 0; r < rings.length - 1; r++) {
      const out = rings[r + 1][3] ? top : side;
      for (let p = 0; p < M; p++) {
        const a = r * M + p, b = r * M + ((p + 1) % M), c = (r + 1) * M + p, e = (r + 1) * M + ((p + 1) % M);
        out.push(a, c, b, b, c, e);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex([...top, ...side]);
    geo.addGroup(0, top.length, 0);
    geo.addGroup(top.length, side.length, 1);
    geo.computeVertexNormals();
    return { geo, topW: 2 * hwT, topD: 2 * hdT };
  }

  // ---------- textures ----------
  function canvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return [c, c.getContext("2d")];
  }

  // Fine grain for the textured plastic.
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
    const ppm = 40; // pixels per millimetre
    const [c, g] = canvas(Math.round(wMM * ppm), Math.round(dMM * ppm));
    g.fillStyle = COLORS[color]; g.fillRect(0, 0, c.width, c.height);
    if (text) {
      const long = text.length > 2;
      g.fillStyle = INK[color];
      if (text === "−") { // the minus key has a short, thick bar
        g.fillRect(c.width / 2 - 1.6 * ppm, c.height / 2 - 0.45 * ppm, 3.2 * ppm, 0.9 * ppm);
      } else {
        g.font = `600 ${Math.round((long ? 2.9 : 7.6) * ppm)}px ${LEGEND_FONT}`;
        if (long) g.letterSpacing = `${Math.round(0.35 * ppm)}px`;
        g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(text === "•" ? "·" : text, c.width / 2 + (long ? 0.17 * ppm : 0), c.height / 2 + 0.35 * ppm);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }

  // The Syntax wordmark (syntax-wordmark.svg, 2664 × 777) drawn into a texture once it loads.
  const LOGO_ASPECT = 2664 / 777;
  function logoTexture(renderer) {
    const [c, g] = canvas(2048, Math.round(2048 / LOGO_ASPECT));
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const img = new Image();
    img.onload = () => {
      g.drawImage(img, 0, 0, c.width, c.height);
      // Recolor to the deeper yellow the pad is printed with (the lighting lifts the brand #FABF46 too far).
      g.globalCompositeOperation = "source-in";
      g.fillStyle = COLORS.logo;
      g.fillRect(0, 0, c.width, c.height);
      t.needsUpdate = true;
    };
    img.src = "syntax-wordmark.svg";
    return t;
  }

  // A small studio (softboxes in a dark room) for reflections.
  function studio(renderer) {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: 0x121317, side: THREE.BackSide })));
    const panel = (w, h, pos, intensity) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(intensity), side: THREE.DoubleSide }));
      m.position.set(...pos); m.lookAt(0, 0, 0); env.add(m);
    };
    panel(5, 2.6, [0, 4.8, 1.2], 2.6);  // overhead softbox
    panel(1.4, 4, [-4.8, 1.8, 1.5], 1.6); // left strip
    panel(1.4, 4, [4.8, 1.4, -1.5], 1.0); // right strip
    panel(5, 0.8, [0, 1.2, -4.8], 1.2);  // back rim
    panel(3, 1.2, [0, 0.6, 4.8], 0.35);  // weak fill from the front
    const pm = new THREE.PMREMGenerator(renderer);
    const tex = pm.fromScene(env, 0.03).texture;
    pm.dispose();
    return tex;
  }

  // ---------- the model ----------
  function build(scene, renderer, slots) {
    const grain = noiseTexture(256, 0.5);
    grain.repeat.set(1 / 11, 1 / 11);
    const caseMat = new THREE.MeshStandardMaterial({ color: COLORS.case, roughness: 0.74, metalness: 0, bumpMap: grain, bumpScale: 0.07 });
    const plateMat = new THREE.MeshStandardMaterial({ color: COLORS.plate, roughness: 0.9 });
    const add = (geo, mat, { cast = true, receive = true } = {}) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = cast; m.receiveShadow = receive;
      scene.add(m);
      return m;
    };
    const BEVEL = 2;
    const trayHole = (t) => planRect(t.x, t.z, t.x + trayW(t.u), t.z + TRAY_D, 2.6, THREE.Path);

    // Upper shell: three tiers stepping down toward the user, each with its tray cut out.
    const jAB = Z_A + TRAY_D + GAP / 2, jBC = Z_B + TRAY_D + GAP / 2;
    const tierA = planRect2(-W / 2, -D / 2, W / 2, jAB, 10, 0);
    tierA.holes.push(trayHole(TA));
    add(smooth(extrudeUp(tierA, Y_BODY, TA.top, BEVEL, 5, 16)), caseMat);
    const tierB = planRect2(-W / 2, jAB, W / 2, jBC, 0, 0);
    tierB.holes.push(trayHole(TRAYS["row-b"]));
    add(smooth(extrudeUp(tierB, Y_BODY, TRAYS["row-b"].top, BEVEL, 5, 16)), caseMat);
    const tierC = planRect2(-W / 2, jBC, W / 2, Z_SLOPE, 0, 0);
    tierC.holes.push(trayHole(TC));
    const joyHole = new THREE.Path();
    joyHole.absarc(JOY.x, -JOY.z, JOY.r, 0, Math.PI * 2, true);
    tierC.holes.push(joyHole);
    add(smooth(extrudeUp(tierC, Y_BODY, TC.top, BEVEL, 5, 16)), caseMat);

    // Front lip: the same outline squashed onto a slope that ends in a thin edge.
    const lipGeo = extrudeUp(planRect2(-W / 2, Z_SLOPE - 0.01, W / 2, D / 2, 0, 10), Y_BODY, TC.top, BEVEL, 5, 16);
    const lp = lipGeo.attributes.position;
    for (let i = 0; i < lp.count; i++) {
      const y = lp.getY(i), z = lp.getZ(i);
      lp.setY(i, Y_BODY + ((y - Y_BODY) * (slopeY(z) - Y_BODY)) / (TC.top - Y_BODY));
    }
    add(smooth(lipGeo), caseMat);

    // A band just inside the tiers fills the notches their rounded bottom edges leave where they meet.
    add(extrudeUp(planRect2(-W / 2 + 0.08, -D / 2 + 0.08, W / 2 - 0.08, D / 2 - 3.5, 9.9, 0), Y_BODY + 0.3, Y_BODY + 2.6, 0), caseMat, { cast: false });

    // Lower shell, inset a little and stopping short of the overhanging front lip.
    add(smooth(extrudeUp(planRect2(-W / 2 + 1.6, -D / 2 + 1.6, W / 2 - 1.6, D / 2 - 16, 8.5, 5), Y_FEET, Y_BODY + 1, 1.4)), caseMat);
    const footMat = new THREE.MeshStandardMaterial({ color: "#0b0b0b", roughness: 0.95 });
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const f = add(new THREE.CylinderGeometry(5, 5, Y_FEET + 0.2, 24), footMat, { receive: false });
      f.position.set(x * (W / 2 - 14), (Y_FEET + 0.2) / 2, z > 0 ? D / 2 - 26 : -D / 2 + 14);
    }
    // USB-C port on the back
    const port = add(smooth(extrudeUp(planRect(-4.6, -1.6, 4.6, 1.6, 1.5), 0, 2, 0.3)), new THREE.MeshStandardMaterial({ color: "#050505", roughness: 0.4, metalness: 0.6 }), { cast: false });
    port.rotation.x = Math.PI / 2;
    port.position.set(-18, 4.6, -D / 2 + 1.0);

    // Tray floors (the switch plate) and the joystick recess floor
    for (const t of Object.values(TRAYS)) {
      const f = add(new THREE.ShapeGeometry(planRect(t.x, t.z, t.x + trayW(t.u), t.z + TRAY_D, 2.6), 8), plateMat, { cast: false });
      f.rotation.x = -Math.PI / 2; f.position.y = t.floor;
    }
    const joyFloor = add(new THREE.CircleGeometry(JOY.r + 0.5, 48), plateMat, { cast: false });
    joyFloor.rotation.x = -Math.PI / 2; joyFloor.position.set(JOY.x, TC.floor + 1.5, JOY.z);

    // Logo on the slope
    const angle = Math.atan((TC.top - Y_FRONT) / (D / 2 - Z_SLOPE));
    const logo = add(new THREE.PlaneGeometry(86, 86 / LOGO_ASPECT), new THREE.MeshStandardMaterial({
      map: logoTexture(renderer), transparent: true, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2,
    }), { cast: false });
    logo.rotation.x = -(Math.PI / 2 - angle);
    const zLogo = Z_SLOPE + (D / 2 - Z_SLOPE) * 0.54;
    logo.position.set(-W / 2 + 13 + 43, slopeY(zLogo) + 0.08, zLogo);

    // Soft contact shadow under the case, and a floor that only shows shadows
    const blob = add(new THREE.PlaneGeometry(W + 60, D + 60), new THREE.MeshBasicMaterial({
      map: radialTexture("rgba(0,0,0,0.75)", "rgba(0,0,0,0)"), transparent: true, depthWrite: false,
    }), { cast: false, receive: false });
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.05;
    const floor = add(new THREE.PlaneGeometry(1400, 1400), new THREE.ShadowMaterial({ opacity: 0.38 }), { cast: false });
    floor.rotation.x = -Math.PI / 2;

    // ---------- keys ----------
    const parts = [];
    const leds = [];
    const capCache = new Map();
    const housingMat = new THREE.MeshStandardMaterial({ color: "#d8dee6", roughness: 0.25, transparent: true, opacity: 0.16, emissive: "#000000" });
    const poolTex = radialTexture();
    const capGrain = noiseTexture(256, 0.5);
    capGrain.repeat.set(1 / 9, 1 / 9);
    const cap = (wMM, dMM) => {
      const k = `${wMM}x${dMM}`;
      if (!capCache.has(k)) capCache.set(k, capGeometry(wMM, dMM));
      return capCache.get(k);
    };

    function addLed(x, z, wMM, floorY, xNorm) {
      const housing = add(new THREE.BoxGeometry(Math.min(wMM, 14), STEM - 0.4, 14), housingMat.clone(), { cast: false });
      housing.position.set(x, floorY + STEM / 2 - 0.2, z);
      const pool = add(new THREE.PlaneGeometry(wMM + 6, 24), new THREE.MeshBasicMaterial({
        map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
      }), { cast: false, receive: false });
      pool.rotation.x = -Math.PI / 2; pool.position.set(x, floorY + 0.15, z);
      const led = { housing, pool, x: xNorm };
      leds.push(led);
      return led;
    }

    for (const [rowId, tray] of Object.entries(TRAYS)) {
      let u = 0;
      for (const el of slots.filter((s) => s.dataset.row === rowId && s.classList.contains("cap"))) {
        const w = Number(el.style.getPropertyValue("--w")) || 1;
        const color = ["orange", "dark", "light"].find((c) => el.classList.contains(c)) || "dark";
        const legend = el.querySelector("small")?.textContent || "";
        const wMM = w * U - 0.9, dMM = U - 0.9;
        const x = tray.x + PAD + (u + w / 2) * U, z = tray.z + PAD + U / 2;
        u += w;
        const { geo, topW, topD } = cap(wMM, dMM);
        const top = new THREE.MeshStandardMaterial({ map: legendTexture(legend, color, topW, topD, renderer), roughness: 0.58, bumpMap: capGrain, bumpScale: 0.03, emissive: ACCENT, emissiveIntensity: 0 });
        const side = new THREE.MeshStandardMaterial({ color: COLORS[color], roughness: 0.6, bumpMap: capGrain, bumpScale: 0.03, emissive: ACCENT, emissiveIntensity: 0 });
        const group = new THREE.Group();
        const mesh = new THREE.Mesh(geo, [top, side]);
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.rotation.x = tray.tilt;
        group.add(mesh);
        group.position.set(x, tray.floor + STEM, z);
        scene.add(group);
        const led = addLed(x, z, wMM, tray.floor, (x + W / 2) / W);
        parts.push({ el, led, group, mats: [top, side], baseY: group.position.y, travel: 0, max: TRAVEL, anchor: new THREE.Vector3(x, tray.top + 0.5, z + U / 2 + 1), hit: mesh });
      }
    }

    // Knob: lathe profile with a softened top edge
    const knobMat = new THREE.MeshStandardMaterial({ color: COLORS.orange, roughness: 0.62, bumpMap: capGrain, bumpScale: 0.08, emissive: ACCENT, emissiveIntensity: 0 });
    const r = KNOB.r, h = 11;
    const prof = [[0, 0], [r - 0.6, 0], [r, 0.6], [r, h - 1.8], [r - 0.3, h - 0.7], [r - 1.1, h - 0.1], [r - 1.8, h], [0, h]].map(([a, b]) => new THREE.Vector2(a, b));
    const knob = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), knobMat);
    knob.castShadow = knob.receiveShadow = true;
    const knobGroup = new THREE.Group();
    knobGroup.add(knob);
    knobGroup.position.set(KNOB.x, TA.top + 0.9, KNOB.z);
    scene.add(knobGroup);
    const knobRing = add(new THREE.CylinderGeometry(r + 0.5, r + 0.5, 0.9, 64), plateMat, { cast: false });
    knobRing.position.set(KNOB.x, TA.top + 0.45, KNOB.z);

    // Joystick: rubber boot, stem and mushroom cap, pivoting at the floor
    const rubber = new THREE.MeshStandardMaterial({ color: "#111111", roughness: 0.95 });
    const boot = add(new THREE.TorusGeometry(JOY.r - 3.2, 2.4, 20, 64), rubber, { cast: false });
    boot.rotation.x = Math.PI / 2; boot.position.set(JOY.x, TC.floor + 2.2, JOY.z);
    const joyMat = new THREE.MeshStandardMaterial({ color: COLORS.orange, roughness: 0.55, emissive: ACCENT, emissiveIntensity: 0 });
    const joyGroup = new THREE.Group();
    joyGroup.position.set(JOY.x, TC.floor + 1.5, JOY.z);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.9, 13, 32), joyMat);
    stem.position.y = 6.5; stem.castShadow = true;
    const mush = [[0, 0], [4.2, 0], [6.3, 0.8], [6.7, 2], [6.5, 3.2], [5.7, 3.9], [3, 4.15], [0, 4.2]].map(([a, b]) => new THREE.Vector2(a, b));
    const joyCap = new THREE.Mesh(new THREE.LatheGeometry(mush, 64), joyMat);
    joyCap.position.y = 13; joyCap.castShadow = true;
    joyGroup.add(stem, joyCap);
    scene.add(joyGroup);

    const special = (sel) => slots.find((s) => s.matches(sel));
    const knobEl = special('[data-key="2"]'), joyEl = special('[data-key="42"]');
    if (knobEl) parts.push({ el: knobEl, group: knobGroup, mats: [knobMat], baseY: knobGroup.position.y, travel: 0, max: 1.4, anchor: new THREE.Vector3(KNOB.x, TA.top + 0.5, KNOB.z - r - 1), hit: knob });
    if (joyEl) parts.push({ el: joyEl, group: joyGroup, mats: [joyMat], baseY: joyGroup.position.y, travel: 0, max: 1.5, anchor: new THREE.Vector3(JOY.x, TC.top + 0.5, JOY.z + JOY.r + 3), hit: [stem, joyCap], joystick: true });

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
    const rim = new THREE.DirectionalLight(0xffffff, 0.45);
    rim.position.set(150, 90, -160);
    scene.add(rim);
    scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x1a1410, 0.12));

    const model = build(scene, renderer, slots);
    const trayLights = Object.values(TRAYS).map((t) => {
      const l = new THREE.PointLight(0xffffff, 0, 70, 2);
      l.position.set(t.x + trayW(t.u) / 2, t.floor + 3, t.z + TRAY_D / 2);
      scene.add(l);
      return l;
    });

    const camera = new THREE.PerspectiveCamera(28, 1, 10, 4000);
    const target = new THREE.Vector3(0, 11, 4);
    const HOME = { yaw: -0.3, pitch: 0.86 };
    const view = { ...HOME };
    const aim = { ...HOME };
    let dist = 500;
    let zoomBy = 1;
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
      const idle = !calm && lastTouch !== Infinity && now - lastTouch > 4000 ? 1 : 0;
      const sway = idle * Math.sin(t * 0.25) * 0.07;
      view.yaw += (aim.yaw + sway - view.yaw) * 0.08;
      view.pitch += (aim.pitch + idle * Math.sin(t * 0.19) * 0.025 - view.pitch) * 0.08;
      camera.position.set(
        target.x + (dist / zoomBy) * Math.sin(view.yaw) * Math.cos(view.pitch),
        target.y + (dist / zoomBy) * Math.sin(view.pitch),
        target.z + (dist / zoomBy) * Math.cos(view.yaw) * Math.cos(view.pitch));
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
          led.pool.material.opacity = 0.42;
          led.housing.material.emissive.copy(glowColor);
          led.housing.material.emissiveIntensity = 0.5;
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
    // For screenshots: data-view="yaw,pitch,zoom" on the board poses the camera and stops the idle sway.
    new MutationObserver(() => {
      const [yaw, pitch, zoom = 1] = (box.dataset.view || "").split(",").map(Number);
      if (Number.isNaN(yaw) || Number.isNaN(pitch)) return;
      Object.assign(aim, { yaw, pitch }); Object.assign(view, { yaw, pitch });
      lastTouch = Infinity; zoomBy = zoom;
    }).observe(box, { attributes: true, attributeFilter: ["data-view"] });
    return true;
  }

  return { mount };
})();
