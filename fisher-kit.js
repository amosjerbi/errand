/* Fisher character kit: the character from 3d_character.html (rig, faces, moves, DevKit settings,
   adult builds, outfits, villager looks). Shared by studio/3d_character.html, studio/npc-lineup.html, index.html and level-02.html,
   so a change here, or a DevKit default edited here, reaches the NPCs in the levels too.

   It's a classic script (works from file:// too). Each page passes in its own three.js:
     const Kit = window.defineFisherKit(THREE);
     const c = new Kit.FisherCharacterController();
     const D = Kit.devkitDefaults(Kit.DEVKIT); Kit.rollVillager(D, { adult: true }); c.applyDevkit(D);
*/
window.defineFisherKit = function (THREE) {
    // =========================================================================
    // 1. PROCEDURAL VINYL / TOON TEXTURES & SHADING HELPERS
    // =========================================================================

    function createVinylToonGradientMap() {
      const colors = new Uint8Array([
        155, 155, 155, 255, // Deep shadow band
        204, 204, 204, 255, // Soft mid-tone band
        240, 240, 240, 255, // Warm lit band
        255, 255, 255, 255  // Subtle vinyl highlight band
      ]);
      const tex = new THREE.DataTexture(colors, colors.length / 4, 1, THREE.RGBAFormat);
      tex.minFilter = THREE.NearestFilter;
      tex.magFilter = THREE.NearestFilter;
      tex.needsUpdate = true;
      return tex;
    }

    /**
     * Generates the clenched white teeth / gritting mouth texture ("Tug / Grit" mode).
     */
    function createGritMouthTexture() {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, 256, 128);

      const padX = 22;
      const padY = 18;
      const w = 256 - padX * 2;
      const h = 128 - padY * 2;
      const r = h * 0.48;

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(padX, padY, w, h, r);
      ctx.clip();

      const grad = ctx.createLinearGradient(0, padY, 0, padY + h);
      grad.addColorStop(0, '#FFFDF9');
      grad.addColorStop(0.75, '#F6ECE4');
      grad.addColorStop(1, '#E2C3B3');
      ctx.fillStyle = grad;
      ctx.fillRect(padX, padY, w, h);

      ctx.strokeStyle = 'rgba(138, 72, 58, 0.35)';
      ctx.lineWidth = 4;
      for (let i = 1; i < 4; i++) {
        const x = padX + (w / 4) * i;
        ctx.beginPath();
        ctx.moveTo(x, padY);
        ctx.lineTo(x, padY + h);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(120, 56, 48, 0.45)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(padX, padY + h * 0.52);
      ctx.lineTo(padX + w, padY + h * 0.52);
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = '#9E4B3E';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.roundRect(padX, padY, w, h, r);
      ctx.stroke();

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      return tex;
    }

    /**
     * Procedural wooden dock plank texture for the playable obstacle course.
     */
    function createDockPlankTexture() {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#C49A6C';
      ctx.fillRect(0, 0, 1024, 1024);

      const plankCount = 12;
      const plankH = 1024 / plankCount;

      for (let p = 0; p < plankCount; p++) {
        const y = p * plankH;
        const shift = ((p * 37) % 18) - 9;
        ctx.fillStyle = `rgb(${196 + shift}, ${153 + shift}, ${106 + shift})`;
        ctx.fillRect(0, y + 3, 1024, plankH - 6);

        ctx.fillStyle = '#735032';
        ctx.fillRect(0, y, 1024, 4);

        ctx.strokeStyle = 'rgba(110, 76, 42, 0.15)';
        ctx.lineWidth = 2;
        for (let g = 0; g < 4; g++) {
          const gy = y + 14 + g * (plankH / 5);
          ctx.beginPath();
          ctx.moveTo(0, gy);
          ctx.bezierCurveTo(340, gy - 4, 680, gy + 4, 1024, gy - 1);
          ctx.stroke();
        }
      }

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(5, 5);
      tex.needsUpdate = true;
      return tex;
    }

    // =========================================================================
    // 2. GAME-READY CHARACTER CONTROLLER CLASS (FisherCharacterController)
    // =========================================================================
    /**
     * Modular Three.js Game Character Rig & State Machine (Empty-Handed Edition).
     *
     * Usage in any Three.js game:
     *   const fisher = createFisherCharacter();
     *   scene.add(fisher.group);
     *   // Inside your game loop:
     *   fisher.update(dt, moveInputVector);
     *   // Trigger actions:
     *   fisher.triggerAction('jump'); // 'jump' | 'slide' | 'frontflip' | 'backflip'
     *   fisher.setState('run');       // 'idle' | 'run' | 'flex'
     */
    // Facial expressions. Numbers blend smoothly between faces; eyeStyle and teeth switch instantly.
    //   eyeStyle: 'open' | 'squint' (< > chevrons, shaped by tune.squint) | 'happy' (^ ^) | 'sleepy' (u u)
    //   eyeOpen: eyelid opening (open eyes only)   pupil: pupil size   gazeX/gazeY: where the pupils look
    //   browTilt: + angry, - worried   browRaise: lift   browTint: 0 = dark brows, 1 = hot red brows
    //   mouthCurve: + smile, - frown   mouthOpen: 0 closed .. 1 wide   mouthRound: 0 flat top, 1 round "O"
    //   mouthWidth: width multiplier   blush: cheek size multiplier
    const FACE_PRESETS = {
      glare:     { eyeStyle: 'open',   eyeOpen: 1.0,  pupil: 1.0,  gazeX: 0, gazeY: 0,    browTilt: 0.24,  browRaise: 0,      browTint: 0, mouthCurve: 0.85, mouthOpen: 0,    mouthRound: 0,   mouthWidth: 1.05, teeth: false, blush: 1.0 }, // glaring eyes + the smile's mouth
      grit:      { eyeStyle: 'squint', eyeOpen: 1.0,  pupil: 1.0,  gazeX: 0, gazeY: 0,    browTilt: 0.42,  browRaise: 0.014,  browTint: 1, mouthCurve: 0,    mouthOpen: 0,    mouthRound: 0,   mouthWidth: 1.0,  teeth: true,  blush: 1.15 },
      smile:     { eyeStyle: 'open',   eyeOpen: 1.0,  pupil: 1.05, gazeX: 0, gazeY: 0,    browTilt: -0.08, browRaise: 0.012,  browTint: 0, mouthCurve: 0.85, mouthOpen: 0,    mouthRound: 0,   mouthWidth: 1.05, teeth: false, blush: 1.1 },
      happy:     { eyeStyle: 'happy',  eyeOpen: 1.0,  pupil: 1.0,  gazeX: 0, gazeY: 0,    browTilt: -0.12, browRaise: 0.022,  browTint: 0, mouthCurve: 1.0,  mouthOpen: 0.6,  mouthRound: 0,   mouthWidth: 1.15, teeth: false, blush: 1.3 },
      surprised: { eyeStyle: 'open',   eyeOpen: 1.2,  pupil: 0.65, gazeX: 0, gazeY: 0.1,  browTilt: -0.15, browRaise: 0.045,  browTint: 0, mouthCurve: 0,    mouthOpen: 0.8,  mouthRound: 1,   mouthWidth: 0.7,  teeth: false, blush: 0.9 },
      sad:       { eyeStyle: 'open',   eyeOpen: 0.78, pupil: 1.1,  gazeX: 0, gazeY: -0.45, browTilt: -0.42, browRaise: 0.02,  browTint: 0, mouthCurve: -0.9, mouthOpen: 0,    mouthRound: 0,   mouthWidth: 0.85, teeth: false, blush: 0.75 },
      rainy:     { eyeStyle: 'squint', eyeOpen: 1.0,  pupil: 1.0,  gazeX: 0, gazeY: -0.3, browTilt: -0.42, browRaise: 0.02,  browTint: 0, mouthCurve: -0.9, mouthOpen: 0,    mouthRound: 0,   mouthWidth: 0.85, teeth: false, blush: 0.75 }, // sad, eyes screwed shut against the rain
      sleepy:    { eyeStyle: 'sleepy', eyeOpen: 0.4,  pupil: 1.0,  gazeX: 0, gazeY: 0,    browTilt: -0.05, browRaise: -0.01,  browTint: 0, mouthCurve: 0.2,  mouthOpen: 0.18, mouthRound: 0.8, mouthWidth: 0.6,  teeth: false, blush: 1.0 }
    };
    const FACE_NAMES = Object.keys(FACE_PRESETS);
    const FACE_BLEND_KEYS = Object.keys(FACE_PRESETS.glare).filter((k) => typeof FACE_PRESETS.glare[k] === 'number');

    // any CSS colour (hex, rgb, hsl, oklch, display-p3...) -> THREE.Color, via a 1px canvas for formats three can't parse
    const _cc = document.createElement('canvas');
    _cc.width = _cc.height = 1;
    const _cx = _cc.getContext('2d', { willReadFrequently: true });
    function col(v) {
      const c = new THREE.Color();
      if (typeof v === 'number') return c.set(v);
      if (/^(#|rgb|hsl)/i.test(v)) return c.setStyle(v);
      _cx.clearRect(0, 0, 1, 1);
      _cx.fillStyle = '#000';
      _cx.fillStyle = v;
      _cx.fillRect(0, 0, 1, 1);
      const d = _cx.getImageData(0, 0, 1, 1).data;
      return c.setRGB(d[0] / 255, d[1] / 255, d[2] / 255, THREE.SRGBColorSpace);
    }

    // front surface of the head ellipsoid (head-local), used to seat eyes, brows and mouth on the face
    const HEAD_AXES = [0.46 * 1.12, 0.46 * 0.94, 0.46 * 1.02];
    const faceZ = (x, y) =>
      HEAD_AXES[2] * Math.sqrt(Math.max(0, 1 - (x / HEAD_AXES[0]) ** 2 - (y / HEAD_AXES[1]) ** 2));
    const faceYaw = (x, y) =>
      Math.atan2(x / HEAD_AXES[0] ** 2, faceZ(x, y) / HEAD_AXES[2] ** 2);

    /**
     * Hair crown: the top of a sphere down to polar angle 0.56π. With shape 'angular' the
     * front edge becomes a zigzag: points stay at the original hairline, and notches cut
     * upward between them by `notch` radians. The effect fades out toward the sides so
     * the edge stays smooth over the ears and around the back.
     */
    function crownGeometry(shape = 'round', points = 5, notch = 0.1) {
      const thetaMax = Math.PI * 0.56;
      const geo = new THREE.SphereGeometry(0.496, 72, 28, 0, Math.PI * 2, 0, thetaMax);
      if (shape === 'angular' && notch > 0) {
        const pos = geo.attributes.position;
        const uv = geo.attributes.uv;
        const span = Math.PI * 0.62; // width of the zigzag across the front, centred on the face
        for (let i = 0; i < pos.count; i++) {
          const phi = uv.getX(i) * Math.PI * 2; // three's sphere: u runs along phi
          const t = 1 - uv.getY(i); // 0 at the top pole, 1 at the edge
          const d = phi - Math.PI / 2; // 0 = straight at the face
          if (Math.abs(d) > span / 2) continue;
          const u = (d / span + 0.5) * points; // 0..points across the span
          const tri = 1 - Math.abs(((u % 1) + 1) % 1 * 2 - 1); // 0 at points, 1 mid-notch
          const fade = Math.cos((d / span) * Math.PI); // 1 at centre, 0 at the span's edges
          const edge = thetaMax - notch * tri * fade;
          const theta = t * edge;
          const r = 0.496;
          pos.setXYZ(i, -r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta));
        }
        geo.computeVertexNormals();
      }
      geo.scale(1.13, 0.96, 1.03);
      return geo;
    }

    class FisherCharacterController {
      constructor(options = {}) {
        this.options = {
          expressionMode: options.expressionMode || 'auto', // 'auto' | 'custom' | any FACE_PRESETS key
          speedMultiplier: options.speedMultiplier || 1.0,
          moveSpeed: options.moveSpeed || 5.2,
          arenaBounds: options.arenaBounds || 9.2
        };

        // Everything the DevKit can tune at runtime (applyDevkit() overwrites these).
        this.tune = {
          autoRest: 'glare', autoAction: 'grit', custom: { ...FACE_PRESETS.glare },
          faceBlend: 12, blink: true, blinkEvery: 3.5, look: { x: 0, y: 0 },
          eyeSize: 1, squint: { direction: 'outward', angle: 0.62, length: 1, thickness: 1, tilt: 0 }, eyeDepth: 0.02, eyeSpacing: 0.2, eyeHeight: 0.015, pupilSpread: 0.013,
          browLength: 1, browThickness: 1, browColor: new THREE.Color('#231d26'), browHot: new THREE.Color('#e64856'),
          mouthHeight: -0.143, mouthWidth: 1, mouthThickness: 1, blushSize: 1,
          jumpPower: 6.2, flipPower: 9.0, sprint: 1.6, gravity: 18.5, slideTime: 0.68, crossfade: 16,
          armLength: 1, armSpread: 0, legLength: 1, legSpread: 0, legStance: 1,
          squash: 1, hairBounce: 1, dust: true, skirtFlare: 1, skirtLength: 1, idleBreath: 1, runBounce: 1
        };
        this.refs = { arms: [], legs: [], buns: {}, bangs: [], ears: [] };

        // Root group placed into the Three.js scene
        this.group = new THREE.Group();
        this.group.name = 'PinkHairedFisherRoot';

        // Internal physics & state machine variables
        this.state = 'idle'; // 'idle' | 'run' | 'jump' | 'slide' | 'frontflip' | 'backflip' | 'flex'
        this.previousLocomotionState = 'idle';
        this.stateTime = 0;
        this.cyclePhase = 0;
        this.sprinting = false; // hold Shift: run faster

        // Vertical jump/flip physics & squash/stretch
        this.verticalOffset = 0;
        this.verticalVelocity = 0;
        this.flipPitch = 0;
        this.squashScale = new THREE.Vector3(1, 1, 1);

        // Playable world-space velocity & facing
        this.velocity = new THREE.Vector3();
        this.facingAngle = 0;
        this.externalInput = new THREE.Vector3();
        this.forceContinuousRun = false; // True in Showcase mode when 'Run' is clicked

        // Joint pose dictionaries for smooth crossfade interpolation (~0.12s)
        this.joints = {};
        this.currentPose = {};
        this.targetPose = {};

        // Dust particle pool for run, slide, and landing puffs
        this.dustParticles = [];
        this.dustSpawnTimer = 0;

        this._buildMaterials();
        this._buildSkeleton();
        this._buildDustPool();
        this._buildSprintTrail();
        this.setExpressionMode(this.options.expressionMode);
      }

      _buildMaterials() {
        const toonGrad = createVinylToonGradientMap();
        const makeVinyl = (hex, shininess = 40) =>
          new THREE.MeshToonMaterial({
            color: hex,
            gradientMap: toonGrad,
            shininess
          });

        this.mats = {
          skin: makeVinyl('#ffad84', 42),
          blush: makeVinyl('#ff5a2c', 20),
          nose: makeVinyl('#ff5268', 36),
          browDark: makeVinyl('#231d26', 24),
          browRed: makeVinyl('#e64856', 24),
          hair: makeVinyl('#ff4f62', 52),
          hairHighlight: makeVinyl('#ff6b7a', 55),
          dress: makeVinyl('#ffd000', 38),
          daisyPetal: makeVinyl('#fffdf8', 28),
          daisyCenter: makeVinyl('#ffb700', 30),
          shirt: makeVinyl('#f4efe2', 36),
          pants: makeVinyl('#3a5a8a', 32),
          shoes: makeVinyl('#3a2b22', 30),
          facialHair: makeVinyl('#4a3426', 50),
          glasses: makeVinyl('#2b2420', 30),
          dust: new THREE.MeshBasicMaterial({
            color: '#fff9ef',
            transparent: true,
            opacity: 0.72
          })
        };
      }

      /**
       * Helper to register an articulated pivot in `this.joints` so all joint
       * rotations & offsets can be smoothly crossfaded each frame.
       */
      _registerJoint(name, obj) {
        this.joints[name] = obj;
        this.currentPose[name] = {
          rx: obj.rotation.x,
          ry: obj.rotation.y,
          rz: obj.rotation.z,
          px: obj.position.x,
          py: obj.position.y,
          pz: obj.position.z
        };
        this.targetPose[name] = { ...this.currentPose[name] };
        return obj;
      }

      /** Remembers each limb mesh's built scale/position so the DevKit can resize it non-destructively. */
      _addLimbs(list, parts) {
        for (const m of Object.values(parts)) {
          m.userData.base = m.scale.clone();
          m.userData.basePos = m.position.clone();
        }
        list.push(parts);
      }

      /**
       * Alternative hair styles. Each style is a group under the head's hair group; the shared
       * crown + bangs stay on for every style except 'bald'. Hanging pieces (ponytail, twin tails,
       * long hair) hang from swing pivots that _updateSecondaryMotion drives.
       */
      _buildHairStyles(hairGroup) {
        this.mats.hairDS = this.mats.hair.clone();
        this.mats.hairDS.side = THREE.DoubleSide;
        const hair = this.mats.hair;
        const tieMat = this.mats.hairHighlight;
        const S = (this.refs.hairStyles = {});
        this.refs.hairSwing = [];
        this.refs.hairLength = [];

        const mesh = (geo, mat = hair) => {
          const m = new THREE.Mesh(geo, mat);
          m.castShadow = true;
          m.receiveShadow = true;
          return m;
        };
        const style = (name) => {
          const g = new THREE.Group();
          g.name = `hair-${name}`;
          g.visible = false;
          hairGroup.add(g);
          S[name] = g;
          return g;
        };
        // a hanging tail: tie at the root, then two swing segments (the lower one lags for a whip)
        const tail = (parent, { pos, baseRx = 0, baseRz = 0, side = 0, radius = 0.13, count = 6, step = 0.1, flat = 0.9 }) => {
          const pivot = new THREE.Group();
          pivot.position.copy(pos);
          pivot.rotation.set(baseRx, 0, baseRz);
          parent.add(pivot);
          const tie = mesh(new THREE.TorusGeometry(radius * 0.62, 0.028, 10, 20), tieMat);
          tie.rotation.x = Math.PI / 2;
          pivot.add(tie);
          const len = new THREE.Group();
          pivot.add(len);
          this.refs.hairLength.push(len);
          const half = Math.ceil(count / 2);
          const lower = new THREE.Group();
          lower.position.y = -half * step;
          len.add(lower);
          for (let i = 0; i < count; i++) {
            const r = radius * (1 - (i / count) * 0.55);
            const blob = mesh(new THREE.SphereGeometry(r, 18, 14));
            blob.scale.set(1, 1.35, flat);
            const local = i < half ? i : i - half;
            blob.position.y = -(local + 0.5) * step;
            (i < half ? len : lower).add(blob);
          }
          this.refs.hairSwing.push({ pivot, lower, baseRx, baseRz, side, lag: 0 });
          return pivot;
        };

        // 1. buns: the original twin buns + pigtails (already built; toggled via refs.buns)
        S.buns = null;

        // 1b. single bun: a top knot on the crown, slightly back, with a tie at its base.
        // It sits on a pivot at the base so it can wobble (stiff, so it only jiggles).
        const bunStyle = style('bun');
        const knotPivot = new THREE.Group();
        knotPivot.position.set(0, 0.47, -0.16);
        knotPivot.rotation.x = -0.35; // lean back with the crown
        bunStyle.add(knotPivot);
        const knotSize = new THREE.Group();
        knotPivot.add(knotSize);
        this.refs.singleBun = knotSize;
        const knot = mesh(new THREE.SphereGeometry(0.21, 26, 20));
        knot.scale.set(1.05, 0.92, 1.0);
        knot.position.y = 0.15;
        knotSize.add(knot);
        const knotTie = mesh(new THREE.TorusGeometry(0.13, 0.034, 10, 24), tieMat);
        knotTie.rotation.x = Math.PI / 2;
        knotTie.position.y = 0.02;
        knotSize.add(knotTie);
        const knotLower = new THREE.Group(); // unused second segment; keeps the swing record uniform
        knotPivot.add(knotLower);
        this.refs.hairSwing.push({ pivot: knotPivot, lower: knotLower, baseRx: -0.35, baseRz: 0, side: 0, lag: 0, stiff: -0.18 });

        // 2. high ponytail
        const pony = style('ponytail');
        // root sits just outside the back-hair volume (which reaches z ≈ -0.575)
        tail(pony, { pos: new THREE.Vector3(0, 0.3, -0.56), baseRx: 0.35, radius: 0.15, count: 7, step: 0.105 });

        // 3. twin tails from the sides of the head
        const twin = style('twintails');
        for (const side of [-1, 1]) {
          tail(twin, { pos: new THREE.Vector3(side * 0.5, 0.2, -0.14), baseRx: 0.18, baseRz: side * 0.22, side, radius: 0.13, count: 7, step: 0.1 });
        }

        // 4. bob: an open shell framing the face down to the jaw, with a rolled hem
        const bob = style('bob');
        const opening = 0.78; // half-width (radians) of the face opening
        const shellGeo = new THREE.SphereGeometry(0.53, 40, 24, Math.PI / 2 + opening, Math.PI * 2 - opening * 2, Math.PI * 0.08, Math.PI * 0.56);
        shellGeo.scale(1.13, 1.0, 1.04);
        const shell = mesh(shellGeo, this.mats.hairDS);
        shell.position.set(0, 0.02, -0.02);
        bob.add(shell);
        const hemGeo = new THREE.TorusGeometry(0.5, 0.045, 10, 40, Math.PI * 2 - opening * 2);
        hemGeo.rotateX(Math.PI / 2);
        hemGeo.rotateY(-(Math.PI / 2 + opening));
        hemGeo.scale(1.08, 1, 1.0); // matches the shell's radius at its lower edge
        const hem = mesh(hemGeo);
        hem.position.set(0, -0.2, -0.02);
        bob.add(hem);

        // 5. long hair down the back (stays clear of the dress)
        const long = style('long');
        const sheetPivot = new THREE.Group();
        sheetPivot.position.set(0, 0.05, -0.33);
        long.add(sheetPivot);
        const sheetLen = new THREE.Group();
        sheetPivot.add(sheetLen);
        this.refs.hairLength.push(sheetLen);
        const upperSheet = mesh(new THREE.CapsuleGeometry(0.3, 0.2, 8, 18));
        upperSheet.scale.set(1.45, 1, 0.42);
        upperSheet.position.set(0, -0.2, -0.04);
        sheetLen.add(upperSheet);
        const sheetLower = new THREE.Group();
        sheetLower.position.y = -0.38;
        sheetLen.add(sheetLower);
        const lowerSheet = mesh(new THREE.CapsuleGeometry(0.26, 0.16, 8, 18));
        lowerSheet.scale.set(1.45, 1, 0.38);
        lowerSheet.position.set(0, -0.16, -0.06);
        sheetLower.add(lowerSheet);
        for (const side of [-1, 1]) {
          // side strands that fall behind the ears
          const strand = mesh(new THREE.CapsuleGeometry(0.09, 0.3, 6, 12));
          strand.position.set(side * 0.47, -0.22, -0.1);
          strand.rotation.z = side * 0.12;
          long.add(strand);
        }
        this.refs.hairSwing.push({ pivot: sheetPivot, lower: sheetLower, baseRx: 0.1, baseRz: 0, side: 0, lag: 0, stiff: 0.45 });

        // 5b. long flowing: a wide pleated curtain fanning out behind the shoulders to the hips,
        // with a zigzag hem, plus a fringe of pointed strands across the forehead
        const flowing = style('flowing');
        const flowPivot = new THREE.Group();
        flowPivot.position.set(0, 0.12, -0.02);
        flowing.add(flowPivot);
        const flowLen = new THREE.Group();
        flowPivot.add(flowLen);
        this.refs.hairLength.push(flowLen);
        {
          const U = 18, V = 10;          // few segments on purpose: big flat facets
          const H = 1.3;                 // drop from the pivot (head coords)
          const r0 = 0.5, r1 = 0.76;     // radius at the top / at the hem
          const halfA = Math.PI * 0.47;  // half-angle measured from straight behind
          const teeth = 7;               // points along the hem
          const pos = [];
          const idx = [];
          for (let j = 0; j <= V; j++) {
            const v = j / V;
            // sides fan out as the hair falls, with alternating notches down the outer edge
            const a0 = halfA * (0.82 + 0.28 * v) + (j % 2 ? 0.07 : -0.03) * v;
            for (let i = 0; i <= U; i++) {
              const u = i / U;
              const tri = 1 - Math.abs(((u * teeth) % 1) * 2 - 1); // 0 at hem points, 1 between
              const a = Math.PI + (u - 0.5) * 2 * a0;
              const pleat = (i % 2 ? 0.045 : -0.012) * v;         // alternating folds
              const r = r0 + (r1 - r0) * Math.pow(v, 0.7) + pleat;
              const y = -H * v * (1 - 0.17 * tri * v);           // zigzag hem
              pos.push(r * Math.sin(a), y, r * Math.cos(a));
            }
          }
          for (let j = 0; j < V; j++) {
            for (let i = 0; i < U; i++) {
              const p0 = j * (U + 1) + i, p1 = p0 + 1, p2 = p0 + U + 1, p3 = p2 + 1;
              idx.push(p0, p2, p1, p1, p2, p3);
            }
          }
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          g.setIndex(idx);
          g.computeVertexNormals();
          flowLen.add(mesh(g, this.mats.hairDS));
        }
        this.refs.hairSwing.push({ pivot: flowPivot, lower: new THREE.Group(), baseRx: 0, baseRz: 0, side: 0, lag: 0, stiff: 0.25 });

        // fringe strands: tapered points seated on the forehead, reaching down to the brows.
        // Their tops tuck under the crown, so raising the Hairline uncovers more of them.
        // A slightly lighter shade of the hair colour (set in applyDevkit) keeps them readable.
        this.mats.hairStrand = this.mats.hair.clone();
        const fringe = new THREE.Group();
        hairGroup.add(fringe);
        this.refs.styleFringe = { flowing: fringe };
        const strandGeo = new THREE.ConeGeometry(0.042, 0.22, 4);
        strandGeo.rotateZ(Math.PI); // point down
        strandGeo.scale(1, 1, 0.45);
        const strands = 9;
        for (let i = 0; i < strands; i++) {
          const t = i / (strands - 1) - 0.5;
          const x = t * 0.62;
          const len = 1 - Math.abs(t) * 0.5 + (i % 2 ? -0.12 : 0.08); // uneven, shorter toward the temples
          const y = 0.27 - 0.11 * len; // tip lands just above the brows
          const st = mesh(strandGeo, this.mats.hairStrand);
          st.scale.set(1, len, 1);
          st.position.set(x, y, faceZ(x, y) + 0.02);
          st.rotation.set(-0.25, faceYaw(x, y) * 0.9, t * 0.35);
          fringe.add(st);
        }

        // 6. pixie: short spiky tufts over the crown
        const pixie = style('pixie');
        const tuftGeo = new THREE.ConeGeometry(0.075, 0.2, 10);
        const tufts = [[0, 0.5, -0.05, -0.2, 0], [-0.2, 0.46, -0.05, -0.15, 0.45], [0.2, 0.46, -0.05, -0.15, -0.45], [-0.12, 0.44, -0.25, -0.7, 0.25],
          [0.12, 0.44, -0.25, -0.7, -0.25], [-0.36, 0.34, -0.12, -0.2, 0.9], [0.36, 0.34, -0.12, -0.2, -0.9], [0, 0.36, -0.4, -1.1, 0], [-0.08, 0.47, 0.12, 0.35, 0.15], [0.1, 0.47, 0.12, 0.35, -0.2]];
        for (const [x, y, z, rx, rz] of tufts) {
          const t = mesh(tuftGeo);
          t.position.set(x, y, z);
          t.rotation.set(rx, 0, rz);
          pixie.add(t);
        }

        // 7. afro: a cloud of puffs around the crown, back and sides, leaving the face clear
        const afro = style('afro');
        const puffGeo = new THREE.SphereGeometry(0.17, 16, 12);
        const n = 70;
        for (let i = 0; i < n; i++) {
          const y = 1 - (i / (n - 1)) * 1.55;
          const r = Math.sqrt(Math.max(0, 1 - y * y));
          const a = i * 2.39996;
          const v = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
          if (v.z > 0.35 && v.y < 0.45) continue; // keep the face open
          const puff = mesh(puffGeo);
          puff.position.set(v.x * 0.6, v.y * 0.55 + 0.1, v.z * 0.58 - 0.06);
          puff.scale.setScalar(0.85 + ((i * 37) % 10) / 30);
          afro.add(puff);
        }

        // 8. bald: shows nothing (handled in applyDevkit)
      }

      _buildSkeleton() {
        // 1. Contact shadow blob on the floor
        const shadowGeo = new THREE.CircleGeometry(0.46, 28);
        shadowGeo.rotateX(-Math.PI / 2);
        const shadowMat = new THREE.MeshBasicMaterial({
          color: '#3a2418',
          transparent: true,
          opacity: 0.22,
          depthWrite: false
        });
        this.contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
        this.contactShadow.position.y = 0.012;
        this.group.add(this.contactShadow);

        // 2. Rig container (handles squash & stretch + vertical jump/flip arc)
        this.rigContainer = new THREE.Group();
        this.group.add(this.rigContainer);

        // 3. Pelvis (Root of upper & lower body hierarchy)
        const pelvis = new THREE.Group();
        pelvis.position.set(0, 0.70, 0);
        this.rigContainer.add(pelvis);
        this._registerJoint('pelvis', pelvis);

        // Flip Pivot centered around pelvis/torso center of mass for clean 360° flips
        const bodyFlipPivot = new THREE.Group();
        pelvis.add(bodyFlipPivot);
        this._registerJoint('bodyFlipPivot', bodyFlipPivot);

        // 4. Torso & Sunny-Yellow A-line Sundress (#ffd000)
        const torso = new THREE.Group();
        bodyFlipPivot.add(torso);
        this._registerJoint('torso', torso);

        // chest stays narrower than the bodice at every height so the dress always sits on top of the skin
        const chest = new THREE.Mesh(
          new THREE.CylinderGeometry(0.168, 0.2, 0.36, 24),
          this.mats.skin
        );
        chest.position.y = 0.22;
        this.refs.chest = chest;
        chest.castShadow = true;
        chest.receiveShadow = true;
        torso.add(chest);

        // A-line flared skirt
        const skirt = new THREE.Mesh(
          new THREE.CylinderGeometry(0.205, 0.44, 0.48, 32),
          this.mats.dress
        );
        skirt.position.y = -0.06;
        skirt.scale.set(1.04, 1.0, 0.96);
        skirt.castShadow = true;
        skirt.receiveShadow = true;
        torso.add(skirt);
        this.skirtMesh = skirt;

        // trousers / overalls seat: covers the hips when there's no skirt (hidden with the sundress)
        const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.235, 0.22, 28), this.mats.pants);
        hips.position.y = -0.03;
        hips.castShadow = true;
        hips.visible = false;
        torso.add(hips);
        this.refs.hips = hips;

        // Dress bodice
        const bodice = new THREE.Mesh(
          new THREE.CylinderGeometry(0.196, 0.226, 0.27, 28),
          this.mats.dress
        );
        bodice.position.y = 0.165;
        this.refs.bodice = bodice;
        bodice.castShadow = true;
        bodice.receiveShadow = true;
        torso.add(bodice);

        // Shoulder straps: rise from the bodice's top edge, pass between neck and shoulder, back down behind
        [-0.15, 0.15].forEach((sx) => {
          const strapCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(sx, 0.28, 0.165),
            new THREE.Vector3(sx * 1.04, 0.42, 0.06),
            new THREE.Vector3(sx * 1.04, 0.43, -0.04),
            new THREE.Vector3(sx, 0.28, -0.155)
          ]);
          const strap = new THREE.Mesh(
            new THREE.TubeGeometry(strapCurve, 20, 0.03, 10, false),
            this.mats.dress
          );
          strap.castShadow = true;
          torso.add(strap);
          (this.refs.straps ||= []).push(strap);
        });

        // 6-Petal White Daisy Emblem with Yellow Center on Chest
        const daisyGroup = new THREE.Group();
        daisyGroup.position.set(0.015, 0.14, 0.214);
        daisyGroup.rotation.x = -0.12;
        torso.add(daisyGroup);
        this.refs.daisy = daisyGroup;

        const petalGeo = new THREE.SphereGeometry(0.048, 14, 12);
        petalGeo.scale(0.85, 1.25, 0.42);
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2;
          const petal = new THREE.Mesh(petalGeo, this.mats.daisyPetal);
          petal.position.set(Math.cos(ang) * 0.068, Math.sin(ang) * 0.068, 0);
          petal.rotation.z = ang - Math.PI / 2;
          petal.castShadow = true;
          daisyGroup.add(petal);
        }
        const daisyCenter = new THREE.Mesh(
          new THREE.SphereGeometry(0.042, 16, 14),
          this.mats.daisyCenter
        );
        daisyCenter.scale.set(1, 1, 0.55);
        daisyCenter.position.z = 0.012;
        daisyGroup.add(daisyCenter);

        // 5. Neck & Head Pivot
        const neck = new THREE.Group();
        neck.position.set(0, 0.40, 0);
        torso.add(neck);
        this.refs.neckJoint = neck;
        this._registerJoint('neck', neck);

        const neckMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.105, 0.125, 0.16, 20),
          this.mats.skin
        );
        neckMesh.position.y = 0.05;
        neckMesh.castShadow = true;
        neck.add(neckMesh);

        const head = new THREE.Group();
        head.position.set(0, 0.48, 0.02);
        neck.add(head);
        this._registerJoint('head', head);

        // Smooth chubby vinyl head (#ffad84)
        const headGeo = new THREE.SphereGeometry(0.46, 36, 32);
        headGeo.scale(1.12, 0.94, 1.02);
        const headMesh = new THREE.Mesh(headGeo, this.mats.skin);
        headMesh.castShadow = true;
        headMesh.receiveShadow = true;
        head.add(headMesh);

        // Bold coral-orange circular blush spots (#ff5a2c)
        const blushGeo = new THREE.SphereGeometry(0.09, 20, 16);
        blushGeo.scale(1.05, 0.95, 0.24);

        const leftBlush = new THREE.Mesh(blushGeo, this.mats.blush);
        leftBlush.position.set(-0.29, -0.09, 0.36);
        leftBlush.rotation.y = -0.55;
        head.add(leftBlush);

        const rightBlush = new THREE.Mesh(blushGeo, this.mats.blush);
        rightBlush.position.set(0.29, -0.09, 0.36);
        rightBlush.rotation.y = 0.55;
        head.add(rightBlush);

        // Cute rounded C-shaped ears with inner ear hollows
        [-1, 1].forEach((side) => {
          const earGroup = new THREE.Group();
          earGroup.position.set(side * 0.51, -0.05, 0.02);
          earGroup.rotation.y = side * 0.55;
          earGroup.rotation.z = side * -0.14;

          const outerEar = new THREE.Mesh(
            new THREE.SphereGeometry(0.118, 18, 16),
            this.mats.skin
          );
          outerEar.scale.set(0.65, 1.15, 0.85);
          outerEar.castShadow = true;
          earGroup.add(outerEar);

          const innerEar = new THREE.Mesh(
            new THREE.SphereGeometry(0.064, 14, 12),
            this.mats.blush
          );
          innerEar.scale.set(0.55, 1.05, 0.45);
          innerEar.position.set(side * 0.036, -0.01, 0.032);
          earGroup.add(innerEar);

          head.add(earGroup);
          this.refs.ears.push(earGroup);
        });

        // Small pink button nose (#ff5268)
        const noseMesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.044, 16, 14),
          this.mats.nose
        );
        noseMesh.scale.set(1.3, 0.82, 0.9);
        noseMesh.position.set(0, -0.02, 0.465);
        noseMesh.castShadow = true;
        head.add(noseMesh);

        this.refs.headMesh = headMesh;
        this.refs.blush = [leftBlush, rightBlush];
        this.refs.nose = noseMesh;
        noseMesh.userData.base = noseMesh.scale.clone();

        // ---------------------------------------------------------------
        // Parametric face. Everything below is placed every frame by
        // _updateFace() from the blended expression values (see FACE_PRESETS),
        // so the DevKit can drive eyes, gaze, brows, mouth and blush live.
        // ---------------------------------------------------------------
        const F = (this.face = { eyes: [], brows: [] });
        const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, ...extra });
        // Sclera writes 1 into the stencil buffer; pupil parts only draw where it is 1,
        // so the pupil can move and grow without ever leaving the white of the eye.
        const scleraStencil = {
          stencilWrite: true, stencilRef: 1,
          stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp
        };
        const insideStencil = {
          stencilWrite: true, stencilRef: 1,
          stencilFunc: THREE.EqualStencilFunc, stencilZPass: THREE.KeepStencilOp
        };
        this.mats.sclera = basic('#F7F5F2', scleraStencil);
        this.mats.iris = basic('#1E1B24', insideStencil);
        this.mats.irisSheen = basic('#342B3D', insideStencil);
        this.mats.catchlight = basic('#FFFFFF', insideStencil);
        this.mats.eyeLine = basic('#1E1A22');
        this.mats.eyeOutline = basic('#1E1A22');
        this.mats.lash = basic('#1E1A22');
        this.mats.mouthLine = basic('#9E4B3E');
        this.mats.mouthInside = basic('#5A1F2A', { side: THREE.DoubleSide });
        this.mats.brow = this.mats.browDark.clone();

        const disc = new THREE.CircleGeometry(1, 40);
        const lineGeo = new THREE.CapsuleGeometry(0.022, 0.118, 6, 10);
        // arc used for the closed "^ ^" happy eyes (bulging up) and "u u" sleepy eyes (bulging down)
        const arcGeo = (dir) => {
          const pts = [];
          for (let i = 0; i <= 10; i++) {
            const a = Math.PI * (0.15 + 0.7 * (i / 10));
            pts.push(new THREE.Vector3(Math.cos(a) * 0.07, dir * (Math.sin(a) * 0.05 - 0.025), 0));
          }
          return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.019, 8, false);
        };
        const happyGeo = arcGeo(1);
        const sleepyGeo = arcGeo(-1);

        for (const side of [-1, 1]) {
          const anchor = new THREE.Group();
          head.add(anchor);

          // open eye: sclera + pupil group (iris, sheen, catchlight)
          const open = new THREE.Group();
          anchor.add(open);
          const sclera = new THREE.Mesh(disc, this.mats.sclera);
          sclera.scale.set(0.081, 0.085, 1);
          sclera.position.y = -0.0055;
          sclera.renderOrder = 2;
          open.add(sclera);
          // dark ring behind the white (size set by face.eyes.outline; hidden at 0)
          const ring = new THREE.Mesh(disc, this.mats.eyeOutline);
          ring.position.set(0, -0.0055, -0.0015);
          ring.renderOrder = 1;
          open.add(ring);
          // eyelashes: rebuilt by _buildLashes(); inside `open` so they blink and squash with the eye
          const lashes = new THREE.Group();
          lashes.position.z = 0.003;
          open.add(lashes);

          const pupil = new THREE.Group();
          pupil.position.z = 0.002;
          open.add(pupil);
          const iris = new THREE.Mesh(disc, this.mats.iris);
          iris.scale.set(0.066, 0.077, 1);
          iris.renderOrder = 3;
          const sheen = new THREE.Mesh(disc, this.mats.irisSheen);
          sheen.scale.set(0.042, 0.02, 1);
          sheen.position.set(0, -0.037, 0.001);
          sheen.renderOrder = 4;
          const glint = new THREE.Mesh(disc, this.mats.catchlight);
          glint.scale.set(0.0166, 0.0258, 1);
          glint.position.set(-side * 0.031, 0.02, 0.002);
          glint.rotation.z = side * 0.15;
          glint.renderOrder = 5;
          pupil.add(iris, sheen, glint);

          // squint chevrons (grit); arm placement is computed every frame from tune.squint
          const squint = new THREE.Group();
          const topArm = new THREE.Mesh(lineGeo, this.mats.eyeLine);
          topArm.position.y = 0.032;
          topArm.rotation.z = side < 0 ? -0.95 : 0.95;
          const botArm = new THREE.Mesh(lineGeo, this.mats.eyeLine);
          botArm.position.y = -0.032;
          botArm.rotation.z = side < 0 ? 0.95 : -0.95;
          squint.add(topArm, botArm);
          squint.position.y = 0.01;
          anchor.add(squint);

          const happy = new THREE.Mesh(happyGeo, this.mats.eyeLine);
          const sleepy = new THREE.Mesh(sleepyGeo, this.mats.eyeLine);
          anchor.add(happy, sleepy);

          F.eyes.push({ side, anchor, open, pupil, glint, ring, lashes, squintArms: [topArm, botArm], styles: { open, squint, happy, sleepy } });

          // brow
          const browGeo = new THREE.CapsuleGeometry(0.025, 0.145, 8, 12);
          browGeo.rotateZ(Math.PI / 2);
          const brow = new THREE.Mesh(browGeo, this.mats.brow);
          head.add(brow);
          F.brows.push({ side, mesh: brow });
        }

        // mouth: upper/lower lip lines + an open inside, rebuilt only when the shape changes
        F.mouth = new THREE.Group();
        head.add(F.mouth);
        F.upperLip = new THREE.Mesh(new THREE.BufferGeometry(), this.mats.mouthLine);
        F.lowerLip = new THREE.Mesh(new THREE.BufferGeometry(), this.mats.mouthLine);
        F.inside = new THREE.Mesh(new THREE.BufferGeometry(), this.mats.mouthInside);
        F.mouth.add(F.upperLip, F.lowerLip, F.inside);
        F.mouthKey = '';

        // clenched teeth (grit)
        F.teeth = new THREE.Mesh(
          new THREE.PlaneGeometry(0.25, 0.125),
          new THREE.MeshBasicMaterial({ map: createGritMouthTexture(), transparent: true, depthWrite: false })
        );
        F.teeth.position.set(0, -0.145, 0.456);
        F.teeth.rotation.x = -0.08;
        head.add(F.teeth);

        // blended expression state (starts on the glare face) + blink timer
        F.cur = { ...FACE_PRESETS.glare };
        F.blink = 0;
        F.nextBlink = 2 + Math.random() * 3;
        F.blinkT = -1;

        // 6. Coral-Pink Hair (#ff4f62) — Trimmed bangs & swept-back side ponytails so face is 100% clear
        const hairGroup = new THREE.Group();
        head.add(hairGroup);
        this.refs.head = head;

        // Rounded dome crown (tilted slightly back so front hairline stays clean above eyebrows)
        const crownMesh = new THREE.Mesh(crownGeometry('round'), this.mats.hair);
        crownMesh.position.set(0, 0.055, -0.03);
        crownMesh.rotation.x = -0.12;
        crownMesh.castShadow = true;
        crownMesh.receiveShadow = true;
        hairGroup.add(crownMesh);
        this.refs.crown = crownMesh;

        // Back hair volume
        const backHairGeo = new THREE.SphereGeometry(0.484, 28, 24);
        backHairGeo.scale(1.12, 0.96, 0.96);
        const backHair = new THREE.Mesh(backHairGeo, this.mats.hair);
        backHair.position.set(0, -0.02, -0.11);
        backHair.castShadow = true;
        hairGroup.add(backHair);
        this.refs.backHair = backHair;

        // Front bangs neatly trimmed above eyebrows (y >= 0.19) with a clean triangular center notch
        const makeBangLock = (xPos, yPos, zPos, w, h, rotZ, rotY, rotX = 0.08) => {
          const geo = new THREE.BoxGeometry(w, h, 0.095, 4, 4, 2);
          const pos = geo.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            const py = pos.getY(i);
            const pz = pos.getZ(i);
            pos.setZ(i, pz - Math.pow(Math.max(0, -py / h), 1.4) * 0.045);
          }
          geo.computeVertexNormals();
          const mesh = new THREE.Mesh(geo, this.mats.hair);
          mesh.position.set(xPos, yPos, zPos);
          mesh.rotation.set(rotX, rotY, rotZ);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData.basePos = mesh.position.clone();
          mesh.userData.baseRot = mesh.rotation.clone();
          this.refs.bangs.push(mesh);
          return mesh;
        };

        // Center-parted short bangs resting strictly above the eyebrows
        hairGroup.add(makeBangLock(-0.145, 0.255, 0.405, 0.22, 0.16, -0.16, -0.28, 0.06));
        hairGroup.add(makeBangLock(0.145, 0.255, 0.405, 0.22, 0.16, 0.16, 0.28, 0.06));
        // Side temple locks swept outward & behind the cheeks/ears (z <= 0.16)
        hairGroup.add(makeBangLock(-0.39, 0.17, 0.16, 0.18, 0.22, -0.24, -0.95, 0.04));
        hairGroup.add(makeBangLock(0.39, 0.17, 0.16, 0.18, 0.22, 0.24, 0.95, 0.04));

        // Hairline: the crown and bangs share a pivot at the head's centre. Tilting it back
        // lifts the front edge off the brows (the back drops behind, under the back hair).
        const hairline = new THREE.Group();
        hairGroup.add(hairline);
        hairline.add(crownMesh, ...this.refs.bangs);
        this.refs.hairline = hairline;

        // Articulated Hair Bun & Lower Pigtail Pivots (swept out ±X and back -Z so they never cross the face)
        const makeHairCluster = (sx, sy, sz) => {
          const pivot = new THREE.Group();
          const puff = new THREE.Mesh(new THREE.SphereGeometry(0.205, 24, 20), this.mats.hair);
          puff.scale.set(sx, sy, sz);
          puff.castShadow = true;
          puff.receiveShadow = true;
          pivot.add(puff);

          const tie = new THREE.Mesh(
            new THREE.TorusGeometry(0.092, 0.030, 10, 20),
            this.mats.hairHighlight
          );
          tie.position.set(0, 0, -0.055);
          pivot.add(tie);
          return pivot;
        };

        const bunUpperLeft = makeHairCluster(1.18, 0.95, 0.90);
        bunUpperLeft.position.set(-0.58, 0.28, -0.10);
        bunUpperLeft.rotation.set(0.14, -0.48, 0.54);
        hairGroup.add(bunUpperLeft);
        this._registerJoint('bunUpperLeft', bunUpperLeft);

        const bunUpperRight = makeHairCluster(1.18, 0.95, 0.90);
        bunUpperRight.position.set(0.58, 0.28, -0.10);
        bunUpperRight.rotation.set(0.14, 0.48, -0.54);
        hairGroup.add(bunUpperRight);
        this._registerJoint('bunUpperRight', bunUpperRight);

        const bunLowerLeft = makeHairCluster(1.10, 1.20, 0.85);
        bunLowerLeft.position.set(-0.50, -0.22, -0.22);
        bunLowerLeft.rotation.set(0.20, -0.58, 0.46);
        hairGroup.add(bunLowerLeft);
        this._registerJoint('bunLowerLeft', bunLowerLeft);

        const bunLowerRight = makeHairCluster(1.10, 1.20, 0.85);
        bunLowerRight.position.set(0.50, -0.22, -0.22);
        bunLowerRight.rotation.set(0.20, 0.58, -0.46);
        hairGroup.add(bunLowerRight);
        this._registerJoint('bunLowerRight', bunLowerRight);
        this.refs.buns = { upper: [bunUpperLeft, bunUpperRight], lower: [bunLowerLeft, bunLowerRight] };
        this._buildHairStyles(hairGroup);

        // 7. Articulated Arms (`leftShoulder` -> `leftUpperArm` -> `leftElbow` -> `leftForearm` + `leftHand`)
        const buildArm = (prefix, side) => {
          const shoulder = new THREE.Group();
          shoulder.position.set(side * 0.21, 0.31, 0.01);
          torso.add(shoulder);
          this._registerJoint(`${prefix}Shoulder`, shoulder);

          const shoulderCap = new THREE.Mesh(new THREE.SphereGeometry(0.082, 16, 14), this.mats.skin);
          shoulderCap.castShadow = true;
          shoulder.add(shoulderCap);

          const upperArm = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.068, 0.17, 10, 14),
            this.mats.skin
          );
          upperArm.position.y = -0.12;
          upperArm.castShadow = true;
          shoulder.add(upperArm);

          const elbow = new THREE.Group();
          elbow.position.set(0, -0.23, 0);
          shoulder.add(elbow);
          this._registerJoint(`${prefix}Elbow`, elbow);

          const elbowCap = new THREE.Mesh(new THREE.SphereGeometry(0.066, 14, 12), this.mats.skin);
          elbow.add(elbowCap);

          const forearm = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.062, 0.16, 10, 14),
            this.mats.skin
          );
          forearm.position.y = -0.11;
          forearm.castShadow = true;
          elbow.add(forearm);

          const hand = new THREE.Group();
          hand.position.set(0, -0.22, 0);
          elbow.add(hand);
          this._registerJoint(`${prefix}Hand`, hand);

          const palm = new THREE.Mesh(new THREE.SphereGeometry(0.078, 16, 14), this.mats.skin);
          palm.scale.set(0.95, 1.05, 0.92);
          palm.castShadow = true;
          hand.add(palm);

          this._addLimbs(this.refs.arms, { shoulderCap, upperArm, elbowCap, forearm, palm });
          return { shoulder, elbow, hand };
        };

        this.leftArm = buildArm('left', -1);
        this.rightArm = buildArm('right', 1);

        // 8. Articulated Chubby Cartoon Legs (`leftHip` -> `leftKnee` -> `leftFoot`)
        const buildLeg = (prefix, side) => {
          const hip = new THREE.Group();
          hip.position.set(side * 0.17, -0.11, 0);
          bodyFlipPivot.add(hip);
          this._registerJoint(`${prefix}Hip`, hip);

          const thigh = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.105, 0.23, 12, 16),
            this.mats.skin
          );
          thigh.position.y = -0.15;
          thigh.castShadow = true;
          thigh.receiveShadow = true;
          hip.add(thigh);

          const knee = new THREE.Group();
          knee.position.set(0, -0.30, 0);
          hip.add(knee);
          this._registerJoint(`${prefix}Knee`, knee);

          const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.098, 16, 14), this.mats.skin);
          kneeCap.castShadow = true;
          knee.add(kneeCap);

          const shin = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.095, 0.21, 12, 16),
            this.mats.skin
          );
          shin.position.y = -0.14;
          shin.castShadow = true;
          shin.receiveShadow = true;
          knee.add(shin);

          const foot = new THREE.Group();
          foot.position.set(0, -0.28, 0.02);
          knee.add(foot);
          this._registerJoint(`${prefix}Foot`, foot);

          const footMesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.115, 20, 16),
            this.mats.skin
          );
          footMesh.scale.set(0.96, 0.72, 1.48);
          footMesh.position.set(0, -0.02, 0.05);
          footMesh.castShadow = true;
          footMesh.receiveShadow = true;
          foot.add(footMesh);

          this._addLimbs(this.refs.legs, { thigh, kneeCap, shin, footMesh });
          return { hip, knee, foot };
        };

        this.leftLeg = buildLeg('left', -1);
        this.rightLeg = buildLeg('right', 1);
      }

      _buildDustPool() {
        const puffGeo = new THREE.SphereGeometry(0.11, 10, 8);
        for (let i = 0; i < 24; i++) {
          const mesh = new THREE.Mesh(puffGeo, this.mats.dust.clone());
          mesh.visible = false;
          this.group.add(mesh);
          this.dustParticles.push({
            mesh,
            active: false,
            life: 0,
            maxLife: 0.45,
            vel: new THREE.Vector3()
          });
        }
      }

      spawnDustPuff(localPos, scale = 1.0) {
        if (!this.tune.dust) return;
        const p = this.dustParticles.find((item) => !item.active);
        if (!p) return;
        p.active = true;
        p.life = 0;
        p.maxLife = 0.36 + Math.random() * 0.16;
        p.mesh.visible = true;
        p.mesh.position.copy(localPos);
        p.mesh.scale.setScalar(0.45 * scale);
        p.mesh.material.opacity = 0.72;
        p.vel.set(
          (Math.random() - 0.5) * 0.85,
          0.45 + Math.random() * 0.55,
          -0.6 - Math.random() * 0.8
        );
      }

      // =======================================================================
      // PUBLIC API METHODS
      // =======================================================================

      setExpressionMode(mode) {
        this.options.expressionMode = mode; // 'auto' | 'glare' | 'grit'
      }

      setExpression(mode) {
        this.setExpressionMode(mode);
      }

      setSpeedMultiplier(mult) {
        this.options.speedMultiplier = mult;
      }

      setInput(vec3OrX, z = null) {
        if (typeof vec3OrX === 'number') {
          this.externalInput.set(vec3OrX, 0, z || 0);
        } else if (vec3OrX) {
          this.externalInput.copy(vec3OrX);
        }
      }

      /**
       * Sets a sustained state ('idle', 'run', 'flex').
       */
      setState(stateName) {
        const normalized = stateName === 'tug' ? 'flex' : stateName;
        if (this.state === normalized) return;
        this.state = normalized;
        this.stateTime = 0;
        if (normalized === 'idle' || normalized === 'run') {
          this.previousLocomotionState = normalized;
        }
      }

      /**
       * Triggers one-shot acrobatic/action animations ('jump', 'slide', 'frontflip', 'backflip')
       * and automatically returns to 'run' or 'idle' upon completion.
       */
      triggerAction(actionName) {
        const normalized = actionName === 'tug' ? 'flex' : actionName;
        if (normalized === 'idle' || normalized === 'run' || normalized === 'flex') {
          this.setState(normalized);
          return;
        }

        // Prevent re-triggering mid-air flip unless grounded
        const isAirborne = this.state === 'jump' || this.state === 'frontflip' || this.state === 'backflip';
        if (isAirborne && this.verticalOffset > 0.08) return;

        if (this.state === 'idle' || this.state === 'run') {
          this.previousLocomotionState = this.state;
        }

        this.state = normalized;
        this.stateTime = 0;

        if (normalized === 'jump') {
          this.verticalVelocity = this.tune.jumpPower;
          this._squash(0.22); // Anticipation squash -> stretch
          this.spawnDustPuff(new THREE.Vector3(-0.15, 0.06, 0), 1.1);
          this.spawnDustPuff(new THREE.Vector3(0.15, 0.06, 0), 1.1);
        } else if (normalized === 'frontflip') {
          this.verticalVelocity = this.tune.flipPower;
          this.flipPitch = 0;
          this._squash(0.24);
          this.spawnDustPuff(new THREE.Vector3(0, 0.08, 0), 1.25);
        } else if (normalized === 'backflip') {
          this.verticalVelocity = this.tune.flipPower;
          this.flipPitch = 0;
          this._squash(0.24);
          this.spawnDustPuff(new THREE.Vector3(0, 0.08, 0), 1.25);
        } else if (normalized === 'slide') {
          this._squash(0.18);
          this.spawnDustPuff(new THREE.Vector3(0, 0.08, -0.15), 1.2);
        }
      }

      /** The face the character should be making right now. */
      _targetFace() {
        const mode = this.options.expressionMode;
        let name = mode;
        if (mode === 'auto') {
          // action face for the whole jump, both flips and Power Flex; rest face otherwise
          const inAction =
            this.state === 'jump' ||
            this.state === 'flex' ||
            this.state === 'frontflip' ||
            this.state === 'backflip';
          name = inAction ? this.tune.autoAction : this.tune.autoRest;
        }
        if (name === 'custom') return this.tune.custom;
        return FACE_PRESETS[name] || FACE_PRESETS.glare;
      }

      /** Name of the face currently shown (for the HUD). */
      get currentFaceName() {
        const t = this._targetFace();
        return t === this.tune.custom ? 'custom' : FACE_NAMES.find((n) => FACE_PRESETS[n] === t);
      }

      _updateFace(dt) {
        const F = this.face;
        const T = this.tune;
        const target = this._targetFace();
        const cur = F.cur;

        // blend the numeric parts, switch the discrete ones
        const a = 1 - Math.exp(-dt * T.faceBlend);
        for (const k of FACE_BLEND_KEYS) cur[k] += (target[k] - cur[k]) * a;
        cur.eyeStyle = target.eyeStyle;
        cur.teeth = target.teeth;

        // blink: a quick close/open every few seconds (open eyes only)
        F.nextBlink -= dt;
        if (T.blink && F.nextBlink <= 0 && F.blinkT < 0) F.blinkT = 0;
        if (F.blinkT >= 0) {
          F.blinkT += dt;
          const k = F.blinkT / 0.14;
          F.blink = k < 1 ? Math.sin(k * Math.PI) : 0;
          if (k >= 1) {
            F.blinkT = -1;
            F.nextBlink = T.blinkEvery * (0.6 + Math.random() * 0.8);
          }
        } else {
          F.blink = 0;
        }

        // eyes
        const ey = T.eyeHeight;
        for (const e of F.eyes) {
          const x = e.side * T.eyeSpacing;
          e.anchor.position.set(x, ey, faceZ(x, ey) + T.eyeDepth);
          e.anchor.rotation.set(0, faceYaw(x, ey) * 0.88, 0);
          e.anchor.scale.setScalar(T.eyeSize);
          for (const [style, obj] of Object.entries(e.styles)) obj.visible = style === cur.eyeStyle;
          if (cur.eyeStyle === 'squint') this._placeSquint(e);
          const open = Math.max(0.04, cur.eyeOpen * (1 - F.blink * 0.94));
          e.open.scale.set(1, open, 1);
          const gx = THREE.MathUtils.clamp(cur.gazeX + T.look.x, -1, 1);
          const gy = THREE.MathUtils.clamp(cur.gazeY + T.look.y, -1, 1);
          e.pupil.position.set(e.side * T.pupilSpread + gx * 0.032, -0.0074 + gy * 0.028, 0.002);
          e.pupil.scale.setScalar(cur.pupil);
        }

        // brows
        this.mats.brow.color.copy(T.browColor).lerp(T.browHot, THREE.MathUtils.clamp(cur.browTint, 0, 1));
        for (const b of F.brows) {
          const x = b.side * (T.eyeSpacing - 0.015);
          const y = ey + 0.103 + cur.browRaise;
          b.mesh.position.set(x, y, faceZ(x, y) + 0.006);
          b.mesh.rotation.set(0, b.side * 0.25, b.side * cur.browTilt);
          b.mesh.scale.set(T.browLength, T.browThickness, T.browThickness);
        }

        // blush
        for (const m of this.refs.blush) m.scale.setScalar(Math.max(0.001, T.blushSize * cur.blush));

        // mouth (teeth replace the lips)
        F.teeth.visible = cur.teeth;
        F.mouth.visible = !cur.teeth;
        const hw = 0.055 * T.mouthWidth * cur.mouthWidth;
        F.teeth.scale.set(T.mouthWidth * cur.mouthWidth, 1, 1);
        F.teeth.position.y = T.mouthHeight - 0.002;
        F.teeth.position.z = faceZ(0, T.mouthHeight) + 0.014;
        if (!cur.teeth) this._rebuildMouth(hw, cur);
      }

      /**
       * Squint chevron for one eye. Each arm starts at the chevron's tip and opens out by
       * `angle` above/below horizontal. 'outward' points the tips away from the nose (< >),
       * 'inward' points them at it (> <). Tilt rotates the whole chevron, mirrored per eye:
       * + drops the open ends, - lifts them.
       */
      _placeSquint(e) {
        const S = this.tune.squint;
        const L = 0.118 * S.length;
        const tipSign = S.direction === 'inward' ? -e.side : e.side;
        const cx = Math.cos(S.angle);
        const sy = Math.sin(S.angle);
        const tipX = (tipSign * L * cx) / 2;
        e.squintArms.forEach((arm, i) => {
          const dx = -tipSign * cx;
          const dy = i === 0 ? sy : -sy;
          arm.position.set(tipX + (dx * L) / 2, (dy * L) / 2, 0);
          arm.rotation.set(0, 0, Math.atan2(dy, dx) - Math.PI / 2); // capsule runs along +Y
          arm.scale.set(S.thickness, S.length, S.thickness);
        });
        e.styles.squint.rotation.z = (tipSign === e.side ? 1 : -1) * e.side * S.tilt;
      }

      /**
       * Eyelashes as tapered spikes standing out from the white's edge.
       * Upper lashes fan over an arc of `range` radians, shifted toward the outer corner by
       * `offset`; `flick` rotates each spike further toward the outer side. Lower lashes
       * mirror that along the bottom edge, shorter.
       */
      _buildLashes(L) {
        const a = 0.081, b = 0.085, cy = -0.0055; // sclera ellipse
        for (const e of this.face.eyes) {
          for (const c of [...e.lashes.children]) { c.geometry.dispose(); e.lashes.remove(c); }
          if (!L.show) continue;
          const add = (theta, len, flickDir) => {
            const geo = new THREE.ConeGeometry(0.0085 * L.thickness, len, 6);
            const lash = new THREE.Mesh(geo, this.mats.lash);
            const nx0 = Math.cos(theta) / a, ny0 = Math.sin(theta) / b;
            const nl = Math.hypot(nx0, ny0);
            const ang = Math.atan2(ny0 / nl, nx0 / nl) + flickDir; // outward normal, flicked
            const nx = Math.cos(ang), ny = Math.sin(ang);
            const bx = a * Math.cos(theta), by = b * Math.sin(theta) + cy;
            lash.position.set(bx + nx * len * 0.5 - nx * 0.004, by + ny * len * 0.5 - ny * 0.004, 0);
            lash.rotation.z = ang - Math.PI / 2; // cone points along +Y
            lash.renderOrder = 6;
            e.lashes.add(lash);
          };
          // outer corner is -x for the left eye (side -1) and +x for the right eye
          const upper = Math.round(L.count);
          for (let i = 0; i < upper; i++) {
            const t = upper === 1 ? 0.5 : i / (upper - 1);
            const theta = Math.PI / 2 - e.side * (L.offset + (t - 0.5) * L.range);
            // outer lashes a little longer
            const len = L.length * (0.8 + 0.4 * t);
            add(theta, len, -e.side * L.flick * (0.4 + 0.6 * t));
          }
          const lower = Math.round(L.lower);
          for (let i = 0; i < lower; i++) {
            const t = lower === 1 ? 0.5 : i / (lower - 1);
            const theta = -Math.PI / 2 + e.side * (L.offset * 0.8 + (t - 0.5) * L.range * 0.7);
            add(theta, L.length * 0.55, e.side * L.flick * 0.5);
          }
        }
      }

      /** Lip lines follow a parabola (curve) seated on the face; an open mouth adds a lower lip and the inside. */
      _rebuildMouth(hw, cur) {
        const F = this.face;
        const T = this.tune;
        const open = Math.max(0, cur.mouthOpen);
        const key = [hw, cur.mouthCurve, open, cur.mouthRound, T.mouthHeight, T.mouthThickness].map((v) => v.toFixed(4)).join();
        if (key === F.mouthKey) return;
        F.mouthKey = key;

        const N = 14;
        const c = cur.mouthCurve;
        const lip = (t) => T.mouthHeight - c * 0.012 + c * 0.024 * t * t;
        const top = [];
        const bot = [];
        for (let i = 0; i <= N; i++) {
          const t = -1 + (2 * i) / N;
          const x = t * hw;
          const bulge = 1 - t * t;
          top.push([x, lip(t) + open * cur.mouthRound * 0.03 * bulge]);
          bot.push([x, lip(t) - open * 0.075 * Math.pow(bulge, 0.8)]);
        }
        const onFace = ([x, y], lift) => new THREE.Vector3(x, y, faceZ(x, y) + lift);
        const radius = 0.016 * T.mouthThickness;

        F.upperLip.geometry.dispose();
        F.upperLip.geometry = new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(top.map((p) => onFace(p, 0.017))), 24, radius, 8, false);

        const isOpen = open > 0.02;
        F.lowerLip.visible = isOpen;
        F.inside.visible = isOpen;
        if (!isOpen) return;

        F.lowerLip.geometry.dispose();
        F.lowerLip.geometry = new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(bot.map((p) => onFace(p, 0.017))), 24, radius, 8, false);

        const shape = new THREE.Shape();
        top.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
        for (let i = bot.length - 1; i >= 0; i--) shape.lineTo(bot[i][0], bot[i][1]);
        const g = new THREE.ShapeGeometry(shape);
        const pos = g.attributes.position;
        for (let i = 0; i < pos.count; i++) pos.setZ(i, faceZ(pos.getX(i), pos.getY(i)) + 0.012);
        F.inside.geometry.dispose();
        F.inside.geometry = g;
      }

      /** Squash/stretch kick scaled by the DevKit's squash amount. */
      _squash(amount) {
        const k = amount * this.tune.squash;
        this.squashScale.set(1 + k, 1 - k, 1 + k);
      }

      /**
       * Applies a full DevKit values object (see DEVKIT in the page script).
       * Safe to call with partial objects; missing folders are skipped.
       */
      applyDevkit(D) {
        // Adults: same rig, grown-up proportions (smaller head, longer legs, arms and torso, broader shoulders)
        const adult = !!(D.build && D.build.age === 'adult');
        if (adult) {
          D = JSON.parse(JSON.stringify(D));
          if (D.head) D.head.size *= 0.72;
          if (D.legs) { D.legs.length *= 1.32; D.legs.thickness *= 0.9; D.legs.foot *= 0.88; }
          if (D.arms) { D.arms.length *= 1.3; D.arms.thickness *= 0.92; D.arms.hand *= 0.78; }
          if (D.hair) D.hair.bunSize *= 0.9;
        }
        this.isAdult = adult;
        const T = this.tune;
        const m = this.mats;
        if (D.expression) {
          const E = D.expression;
          this.setExpressionMode(E.mode);
          T.autoRest = E.auto.rest;
          T.autoAction = E.auto.action;
          T.faceBlend = E.blendSpeed;
          T.blink = E.blink;
          T.blinkEvery = E.blinkEvery;
          T.look = E.look;
          T.squint = { ...E.squint };
          T.custom = { ...E.custom, gazeX: 0, gazeY: 0 };
        }
        if (D.face) {
          const F = D.face;
          T.eyeSize = F.eyes.size;
          T.eyeSpacing = F.eyes.spacing;
          T.eyeDepth = F.eyes.depth;
          T.eyeHeight = F.eyes.height;
          T.pupilSpread = F.eyes.pupilSpread;
          m.sclera.color.copy(col(F.eyes.white));
          m.iris.color.copy(col(F.eyes.iris));
          m.irisSheen.color.copy(col(F.eyes.iris)).lerp(new THREE.Color('#ffffff'), 0.12);
          m.eyeLine.color.copy(col(F.eyes.line));
          this.face.eyes.forEach((e) => {
            e.glint.visible = F.eyes.catchlight;
            const w = F.eyes.outline;
            e.ring.visible = w > 0;
            e.ring.scale.set(0.081 + w, 0.085 + w, 1);
          });
          m.eyeOutline.color.copy(col(F.eyes.line));
          m.lash.color.copy(col(F.lashes.color));
          const lashKey = JSON.stringify(F.lashes);
          if (lashKey !== this._lashKey) { this._lashKey = lashKey; this._buildLashes(F.lashes); }
          T.browLength = F.brows.length;
          T.browThickness = F.brows.thickness;
          T.browColor = col(F.brows.color);
          T.browHot = col(F.brows.hotColor);
          T.mouthHeight = F.mouth.height;
          T.mouthWidth = F.mouth.width;
          T.mouthThickness = F.mouth.thickness;
          m.mouthLine.color.copy(col(F.mouth.color));
          m.mouthInside.color.copy(col(F.mouth.inside));
          T.blushSize = F.blush.size;
          m.blush.color.copy(col(F.blush.color));
          this.refs.nose.visible = F.nose.show;
          m.nose.color.copy(col(F.nose.color));
          const nb = this.refs.nose.userData.base;
          this.refs.nose.scale.set(nb.x * F.nose.size, nb.y * F.nose.size, nb.z * F.nose.size);
        }
        if (D.head) {
          const H = D.head;
          this.refs.head.scale.set(H.size * H.width, H.size * H.height, H.size);
          m.skin.color.copy(col(H.skin));
          this.refs.ears.forEach((g) => g.scale.setScalar(H.ears));
        }
        if (D.hair) {
          const R = D.hair;
          m.hair.color.copy(col(R.color));
          m.hairDS.color.copy(m.hair.color);
          m.hairStrand.color.copy(m.hair.color).lerp(new THREE.Color('#ffffff'), 0.14);
          m.hairHighlight.color.copy(col(R.ties));
          const style = R.style;
          const bald = style === 'bald';
          const isBuns = style === 'buns';
          for (const [name, g] of Object.entries(this.refs.hairStyles)) {
            if (!g) continue;
            g.visible = name === style;
            g.scale.setScalar(R.volume);
          }
          this.refs.buns.upper.forEach((b) => { b.visible = isBuns && R.topBuns; b.scale.setScalar(R.bunSize); });
          this.refs.buns.lower.forEach((b) => { b.visible = isBuns && R.pigtails; b.scale.setScalar(R.bunSize); });
          this.refs.singleBun.scale.setScalar(R.bunSize);
          this.refs.bangs.forEach((b) => (b.visible = !bald && R.bangs));
          for (const [name, g] of Object.entries(this.refs.styleFringe)) g.visible = name === style && R.bangs;
          // the two square centre locks on top of the forehead (bangs[0] = left, bangs[1] = right)
          const L = R.frontLocks;
          this.refs.bangs.slice(0, 2).forEach((b) => {
            const side = Math.sign(b.userData.basePos.x);
            const p0 = b.userData.basePos, r0 = b.userData.baseRot;
            b.visible = b.visible && L.show;
            b.scale.set(L.width, L.height, L.thickness);
            b.position.set(p0.x + side * L.spread, p0.y + L.lift, p0.z + L.forward);
            b.rotation.set(r0.x + L.lean, r0.y + side * L.turn, r0.z + side * L.tilt);
          });
          this.refs.crown.visible = !bald;
          this.refs.hairline.rotation.x = -R.hairline;
          const crownKey = [R.hairlineShape, R.points, R.notch].join();
          if (crownKey !== this._crownKey) {
            this._crownKey = crownKey;
            this.refs.crown.geometry.dispose();
            this.refs.crown.geometry = crownGeometry(R.hairlineShape, R.points, R.notch);
          }
          this.refs.backHair.visible = !bald && style !== 'pixie' && style !== 'bob'; // bob's shell replaces it
          this.refs.hairLength.forEach((g) => g.scale.set(1, R.length, 1));
          T.hairBounce = R.bounce;
        }
        if (D.body) {
          const B = D.body;
          this.group.scale.setScalar(B.scale);
          m.dress.color.copy(col(B.dress));
          T.skirtFlare = B.skirtFlare;
          T.skirtLength = B.skirtLength;
          this.skirtMesh.position.y = 0.18 - 0.24 * B.skirtLength;
          this.refs.daisy.visible = B.daisy;
          m.daisyPetal.color.copy(col(B.petals));
          m.daisyCenter.color.copy(col(B.daisyCenter));
        }
        // scale a mesh from its built size: (thickness on x/z, length on y), and slide it along the bone
        const fit = (mesh, thick, len = 1, posY = 1, posZ = 1) => {
          const b = mesh.userData.base, p = mesh.userData.basePos;
          mesh.scale.set(b.x * thick, b.y * len, b.z * thick);
          mesh.position.set(p.x, p.y * posY, p.z * posZ);
        };
        if (D.arms) {
          const A = D.arms;
          T.armLength = A.length;
          T.armSpread = A.spread;
          for (const a of this.refs.arms) {
            fit(a.shoulderCap, A.thickness, A.thickness);
            fit(a.upperArm, A.thickness, A.length, A.length);
            fit(a.elbowCap, A.thickness, A.thickness);
            fit(a.forearm, A.thickness, A.length, A.length);
            fit(a.palm, A.hand, A.hand);
          }
        }
        if (D.legs) {
          const L = D.legs;
          T.legLength = L.length;
          T.legSpread = L.spread;
          T.legStance = L.stance;
          for (const l of this.refs.legs) {
            fit(l.thigh, L.thickness, L.length, L.length);
            fit(l.kneeCap, L.thickness, L.thickness);
            fit(l.shin, L.thickness, L.length, L.length);
            fit(l.footMesh, L.foot, L.foot, L.foot, L.foot);
          }
        }
        if (D.build) this._applyBuild(D.build, adult);
        if (D.outfit) this._applyOutfit(D.outfit);
        if (D.extras) this._applyExtras(D.extras);
        if (D.motion) {
          const M = D.motion;
          this.setSpeedMultiplier(M.animSpeed);
          this.options.moveSpeed = M.moveSpeed;
          T.jumpPower = M.jumpPower;
          T.flipPower = M.flipPower;
          T.sprint = M.sprint;
          T.gravity = M.gravity;
          T.slideTime = M.slideTime;
          T.crossfade = M.crossfade;
          T.squash = M.squash;
          T.idleBreath = M.idleBreath;
          T.runBounce = M.runBounce;
          T.dust = M.dust;
        }
      }

      // torso length + shoulder width (adults get 1.45x / 1.18x on top of the sliders)
      _applyBuild(Bd, adult) {
        const r = this.refs, T = this.tune;
        const tl = Bd.torso * (adult ? 1.45 : 1), sw = Bd.shoulders * (adult ? 1.18 : 1);
        const base = (o) => (o.userData.bp ||= { p: o.position.clone(), s: o.scale.clone() });
        T.bodyWidth = sw;
        let b = base(r.chest);
        r.chest.scale.set(b.s.x * sw, b.s.y * tl, b.s.z * sw);
        r.chest.position.y = 0.04 + 0.18 * tl;              // the chest grows upward from the waist
        b = base(r.bodice);
        r.bodice.scale.set(b.s.x * sw, b.s.y * tl, b.s.z * sw);
        r.bodice.position.y = 0.03 + 0.135 * tl;
        for (const s of r.straps) s.scale.set(sw, tl, 1);
        b = base(r.daisy);
        r.daisy.position.set(b.p.x, 0.03 + 0.11 * tl, b.p.z * sw);
        r.neckJoint.position.y = 0.04 + 0.36 * tl;
        r.hips.scale.set(sw, 1, sw);
        for (const a of [this.leftArm, this.rightArm]) {
          b = base(a.shoulder);
          a.shoulder.position.set(b.p.x * sw, b.p.y + 0.36 * (tl - 1), b.p.z);
        }
      }

      // sundress (the original look), shirt & trousers, or overalls
      _applyOutfit(O) {
        const m = this.mats, r = this.refs, st = O.style;
        m.shirt.color.copy(col(O.shirt));
        m.pants.color.copy(col(O.pants));
        m.shoes.color.copy(col(O.shoeColor));
        const dress = st === 'dress', overalls = st === 'overalls';
        r.chest.material = dress ? m.skin : m.shirt;
        r.bodice.material = overalls ? m.pants : dress ? m.dress : m.shirt;
        for (const s of r.straps) { s.visible = st !== 'shirt'; s.material = overalls ? m.pants : m.dress; }
        this.skirtMesh.visible = dress;
        r.hips.visible = !dress;
        if (st === 'shirt') r.daisy.visible = false;
        const sleeve = !dress && O.sleeves;
        for (const a of r.arms) { a.shoulderCap.material = a.upperArm.material = sleeve ? m.shirt : m.skin; }
        const trousers = !dress, longLegs = trousers && !O.shorts;
        for (const l of r.legs) {
          l.thigh.material = trousers ? m.pants : m.skin;
          l.kneeCap.material = l.shin.material = longLegs ? m.pants : m.skin;
          l.footMesh.material = O.shoes ? m.shoes : m.skin;
        }
      }

      // mustache / beard and glasses, built the first time they're needed
      _buildExtras() {
        const head = this.refs.head, m = this.mats;
        const stache = new THREE.Group();
        const lobe = new THREE.SphereGeometry(0.075, 18, 12);
        lobe.scale(1.3, 0.42, 0.5);
        [-1, 1].forEach((s) => {
          const l = new THREE.Mesh(lobe, m.facialHair);
          l.position.set(s * 0.078, -s * 0.0, 0);
          l.rotation.z = s * -0.3;
          stache.add(l);
        });
        stache.rotation.x = -0.25;
        head.add(stache);
        // beard: a shell over the jaw, from just under the mouth round to the cheeks
        const beardGeo = new THREE.SphereGeometry(0.46, 36, 14, Math.PI / 2 - 1.75, 3.5, 2.02, Math.PI - 2.02 - 0.05);
        beardGeo.scale(1.12 * 1.045, 0.94 * 1.05, 1.02 * 1.07);
        const beard = new THREE.Mesh(beardGeo, m.facialHair);
        head.add(beard);
        const lensGeo = new THREE.TorusGeometry(0.105, 0.011, 8, 28);
        const lenses = this.face.eyes.map((e) => { const r = new THREE.Mesh(lensGeo, m.glasses); r.position.set(0, -0.004, 0.03); e.anchor.add(r); return r; });
        const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 1, 8).rotateZ(Math.PI / 2), m.glasses);
        head.add(bridge);
        Object.assign(this.refs, { stache, beard, lenses, bridge });
      }

      _applyExtras(X) {
        if (!this.refs.stache) this._buildExtras();
        const r = this.refs, T = this.tune, m = this.mats;
        m.facialHair.color.copy(col(X.facialHairColor));
        m.glasses.color.copy(col(X.glassesColor));
        r.stache.visible = X.facialHair === 'mustache' || X.facialHair === 'beard';
        r.beard.visible = X.facialHair === 'beard';
        const my = (T.mouthHeight ?? -0.123) + 0.06;
        r.stache.position.set(0, my, faceZ(0, my) + 0.01);
        for (const l of r.lenses) l.visible = X.glasses;
        const ey = T.eyeHeight ?? 0.015, gap = 2 * ((T.eyeSpacing ?? 0.192) - 0.105 * (T.eyeSize ?? 1.47));
        r.bridge.visible = X.glasses && gap > 0.005;
        r.bridge.scale.set(Math.max(0.005, gap), 1, 1);
        r.bridge.position.set(0, ey + 0.012, faceZ(0, ey) + (T.eyeDepth ?? 0.02) + 0.04);
      }

      _setTarget(name, rx = 0, ry = 0, rz = 0, px = null, py = null, pz = null) {
        const t = this.targetPose[name];
        if (!t) return;
        t.rx = rx;
        t.ry = ry;
        t.rz = rz;
        if (px !== null) t.px = px;
        if (py !== null) t.py = py;
        if (pz !== null) t.pz = pz;
      }

      /**
       * Computes target joint poses for Idle, Run, Jump, Slide, Front Flip,
       * Back Flip, and Empty-Handed Power Flex, then crossfades smoothly.
       */
      _evaluateAnimationState(dt, isMoving) {
        const s = this.state;
        const t = this.stateTime;

        // Reset defaults
        this._setTarget('pelvis', 0, 0, 0, 0, 0.70, 0);
        this._setTarget('bodyFlipPivot', 0, 0, 0, 0, 0, 0);
        this._setTarget('torso', 0, 0, 0, 0, 0, 0);
        this._setTarget('neck', 0, 0, 0);
        this._setTarget('head', 0, 0, 0);

        if (s === 'idle') {
          this.cyclePhase += dt * 2.4;
          const breathe = Math.sin(this.cyclePhase) * this.tune.idleBreath;
          const sway = Math.sin(this.cyclePhase * 0.5) * this.tune.idleBreath;

          this._setTarget('pelvis', 0, sway * 0.04, 0, 0, 0.70 + breathe * 0.014, 0);
          this._setTarget('torso', -0.03 + breathe * 0.025, sway * 0.05, sway * 0.02);
          this._setTarget('head', 0.03 - breathe * 0.02, -sway * 0.04, sway * 0.025);

          // Symmetric relaxed empty-handed arms with gentle breathing sway
          this._setTarget('leftShoulder', 0.08 + breathe * 0.04, 0, 0.18);
          this._setTarget('leftElbow', -0.28 + breathe * 0.05, 0, 0);

          this._setTarget('rightShoulder', 0.08 + breathe * 0.04, 0, -0.18);
          this._setTarget('rightElbow', -0.28 + breathe * 0.05, 0, 0);

          // Planted chubby legs
          this._setTarget('leftHip', -0.04, 0.08, 0.06);
          this._setTarget('leftKnee', 0.08, 0, 0);
          this._setTarget('leftFoot', -0.04, 0, -0.06);

          this._setTarget('rightHip', 0.04, -0.08, -0.06);
          this._setTarget('rightKnee', 0.08, 0, 0);
          this._setTarget('rightFoot', -0.04, 0, 0.06);
        } else if (s === 'run') {
          this.cyclePhase += dt * 11.5 * (this.sprinting ? 1 + (this.tune.sprint - 1) * 0.6 : 1);   // quicker strides when sprinting
          const p = this.cyclePhase;
          const stride = Math.sin(p);
          const doubleBounce = Math.abs(Math.sin(p)) * this.tune.runBounce;
          // sprint blend (0 = run, 1 = sprint), eased so the bigger swings grow in and out smoothly
          this.sprintBlend = THREE.MathUtils.lerp(this.sprintBlend || 0, this.sprinting ? 1 : 0, Math.min(1, dt * 8));
          const sb = this.sprintBlend, mix = (a, b) => a + (b - a) * sb;
          const armAmp = mix(0.88, 1.38), elbowBend = mix(0.78, 1.12), elbowPump = mix(0.45, 0.62);
          const hipAmp = mix(0.92, 1.32), kneeLift = mix(0.95, 1.3), kneeBase = mix(0.45, 0.6), footAmp = mix(0.35, 0.62);

          // Energetic forward lean, vertical bounce, and hip twist
          this._setTarget('pelvis', 0.06, -stride * 0.14, stride * 0.05, 0, 0.67 + doubleBounce * 0.075, 0);
          this._setTarget('torso', mix(0.22, 0.36), stride * mix(0.18, 0.24), -stride * 0.06);
          this._setTarget('head', -0.16 + doubleBounce * 0.04, -stride * 0.08, stride * 0.04);

          // Symmetric opposing empty-handed sprint arm pump
          this._setTarget('leftShoulder', stride * armAmp, 0, 0.22);
          this._setTarget('leftElbow', -elbowBend - Math.max(0, -stride) * elbowPump, 0, 0);

          this._setTarget('rightShoulder', -stride * armAmp, 0, -0.22);
          this._setTarget('rightElbow', -elbowBend - Math.max(0, stride) * elbowPump, 0, 0);

          // Snappy cartoon leg cycle with knee lift & foot push-off
          const leftSwing = -stride;
          const rightSwing = stride;

          this._setTarget('leftHip', leftSwing * hipAmp, 0, 0.05);
          this._setTarget('leftKnee', Math.max(0.08, Math.cos(p) * kneeLift + kneeBase), 0, 0);
          this._setTarget('leftFoot', -leftSwing * footAmp, 0, -0.05);

          this._setTarget('rightHip', rightSwing * hipAmp, 0, -0.05);
          this._setTarget('rightKnee', Math.max(0.08, -Math.cos(p) * kneeLift + kneeBase), 0, 0);
          this._setTarget('rightFoot', -rightSwing * footAmp, 0, 0.05);

          // Spawn footstep dust puffs on foot strike
          this.dustSpawnTimer += dt;
          if (this.dustSpawnTimer > 0.22) {
            this.dustSpawnTimer = 0;
            const sideX = stride > 0 ? -0.15 : 0.15;
            this.spawnDustPuff(new THREE.Vector3(sideX, 0.05, -0.12), 0.72);
          }
        } else if (s === 'jump') {
          const rising = this.verticalVelocity > 0;
          this._setTarget('pelvis', 0, 0, 0, 0, 0.72, 0);
          this._setTarget('torso', rising ? 0.16 : -0.12, 0, 0);
          this._setTarget('head', rising ? -0.14 : 0.10, 0, 0);

          // Both empty hands thrown upward on takeoff, out for balance on descent
          this._setTarget('leftShoulder', rising ? -2.2 : -0.65, 0, 0.45);
          this._setTarget('leftElbow', -0.45, 0, 0);

          this._setTarget('rightShoulder', rising ? -2.2 : -0.65, 0, -0.45);
          this._setTarget('rightElbow', -0.45, 0, 0);

          // Asymmetric dynamic hero jump legs
          this._setTarget('leftHip', -0.68, 0, 0.08);
          this._setTarget('leftKnee', 1.15, 0, 0);
          this._setTarget('leftFoot', 0.25, 0, 0);

          this._setTarget('rightHip', 0.38, 0, -0.08);
          this._setTarget('rightKnee', 0.55, 0, 0);
          this._setTarget('rightFoot', 0.35, 0, 0);
        } else if (s === 'slide') {
          const slideDuration = this.tune.slideTime;
          // Low ground-skimming baseball/parkour slide pose
          this._setTarget('pelvis', -1.08, 0.25, 0.12, 0, 0.30, 0);
          this._setTarget('torso', -0.18, -0.22, -0.10);
          this._setTarget('head', 0.88, -0.05, -0.12); // Keeps eyes locked forward!

          // Free trailing & bracing arms
          this._setTarget('leftShoulder', 0.55, 0, 0.55);
          this._setTarget('leftElbow', -0.45, 0, 0);

          this._setTarget('rightShoulder', -0.45, 0, -0.55);
          this._setTarget('rightElbow', -0.35, 0, 0);

          // Front leg extended straight forward, back leg tucked underneath
          this._setTarget('leftHip', -0.42, 0, 0.06);
          this._setTarget('leftKnee', 0.12, 0, 0);
          this._setTarget('leftFoot', -0.35, 0, 0);

          this._setTarget('rightHip', 0.65, 0, -0.25);
          this._setTarget('rightKnee', 1.75, 0, 0);
          this._setTarget('rightFoot', 0.35, 0, 0);

          // Continuous trailing dust cloud while sliding
          this.dustSpawnTimer += dt;
          if (this.dustSpawnTimer > 0.06) {
            this.dustSpawnTimer = 0;
            this.spawnDustPuff(new THREE.Vector3((Math.random() - 0.5) * 0.28, 0.06, -0.22), 0.95);
          }

          if (t >= slideDuration) {
            this.setState(isMoving || this.forceContinuousRun ? 'run' : 'idle');
          }
        } else if (s === 'frontflip' || s === 'backflip') {
          const isFront = s === 'frontflip';
          const dir = isFront ? 1 : -1;
          // spin finishes just before landing, whatever the flip power / gravity are
          const totalDuration = ((2 * this.tune.flipPower) / this.tune.gravity) * 0.97;
          const progress = Math.min(1, t / totalDuration);

          // Smooth eased 360° somersault rotation around X axis
          const eased = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
          this.flipPitch = dir * eased * Math.PI * 2;

          // Tight mid-air cannonball/tuck between 15% and 80% of flip
          const tuckFactor = Math.sin(progress * Math.PI);

          this._setTarget('pelvis', 0, 0, 0, 0, 0.72, 0);
          this._setTarget('bodyFlipPivot', this.flipPitch, 0, 0);
          this._setTarget('torso', dir * 0.42 * tuckFactor, 0, 0);
          this._setTarget('head', dir * 0.35 * tuckFactor, 0, 0);

          // Both arms hug knees cleanly in mid-air tuck
          this._setTarget('leftShoulder', -0.85 * tuckFactor, 0, 0.15);
          this._setTarget('leftElbow', -1.35 * tuckFactor, 0, 0);

          this._setTarget('rightShoulder', -0.85 * tuckFactor, 0, -0.15);
          this._setTarget('rightElbow', -1.35 * tuckFactor, 0, 0);

          // Knees tucked tightly to chest
          this._setTarget('leftHip', -1.45 * tuckFactor, 0, 0.08);
          this._setTarget('leftKnee', 2.05 * tuckFactor, 0, 0);
          this._setTarget('leftFoot', 0.35 * tuckFactor, 0, 0);

          this._setTarget('rightHip', -1.45 * tuckFactor, 0, -0.08);
          this._setTarget('rightKnee', 2.05 * tuckFactor, 0, 0);
          this._setTarget('rightFoot', 0.35 * tuckFactor, 0, 0);
        } else if (s === 'sit') {
          // Riding in a truck bed: sitting on the floor, legs out, hands on the bed, a little sway
          const sw = Math.sin(t * 2.1) * 0.05;
          this._setTarget('pelvis', 0, 0, 0, 0, 0.2, 0);
          this._setTarget('torso', -0.12 + sw, 0, sw * 0.6);
          this._setTarget('head', 0.08, Math.sin(t * 0.7) * 0.35, 0);
          this._setTarget('leftShoulder', 0.35, 0, 0.55);
          this._setTarget('leftElbow', -0.2, 0, 0);
          this._setTarget('rightShoulder', 0.35, 0, -0.55);
          this._setTarget('rightElbow', -0.2, 0, 0);
          this._setTarget('leftHip', -1.45, 0, 0.12);
          this._setTarget('leftKnee', 0.25, 0, 0);
          this._setTarget('leftFoot', -0.2, 0, 0);
          this._setTarget('rightHip', -1.45, 0, -0.12);
          this._setTarget('rightKnee', 0.25, 0, 0);
          this._setTarget('rightFoot', -0.2, 0, 0);
        } else if (s === 'flex') {
          // Empty-handed energetic Power Flex / Victory Stance!
          this.cyclePhase += dt * 6.5;
          const pulse = Math.sin(this.cyclePhase) * 0.06;

          this._setTarget('pelvis', 0, -0.12, 0, 0, 0.67 + pulse * 0.3, 0);
          this._setTarget('torso', -0.14 - pulse * 0.6, -0.08, 0.03);
          this._setTarget('head', 0.08 + pulse * 0.4, 0.08, -0.03);

          // Both arms raised & flexed with determined grit expression
          this._setTarget('leftShoulder', -0.65 + pulse * 0.5, 0.25, 1.05);
          this._setTarget('leftElbow', -1.45 - pulse * 0.6, 0, 0);

          this._setTarget('rightShoulder', -0.65 + pulse * 0.5, -0.25, -1.05);
          this._setTarget('rightElbow', -1.45 - pulse * 0.6, 0, 0);

          // Wide braced hero stance
          this._setTarget('leftHip', -0.28, 0.14, 0.18);
          this._setTarget('leftKnee', 0.42, 0, 0);
          this._setTarget('leftFoot', -0.14, 0, -0.16);

          this._setTarget('rightHip', 0.32, -0.14, -0.16);
          this._setTarget('rightKnee', 0.28, 0, 0);
          this._setTarget('rightFoot', -0.16, 0, 0.14);
        }

        // DevKit proportions: bone lengths move the child joints, spreads add to every pose,
        // and longer legs lift the pelvis so the feet stay on the ground
        {
          const T = this.tune;
          const P = this.targetPose;
          const seated = this.state === 'sit'; // seated: the legs are horizontal, so they don't lift the hips
          if (!seated) P.pelvis.py += (0.30 + 0.28) * (T.legLength - 1) * Math.cos(P.pelvis.rx);
          for (const [side, sgn] of [['left', -1], ['right', 1]]) {
            if (!seated) P[`${side}Shoulder`].rz += sgn * T.armSpread;
            P[`${side}Elbow`].py = -0.23 * T.armLength;
            P[`${side}Hand`].py = -0.22 * T.armLength;
            if (!seated) P[`${side}Hip`].rz += sgn * T.legSpread;
            P[`${side}Hip`].px = sgn * 0.17 * T.legStance;
            P[`${side}Knee`].py = -0.30 * T.legLength;
            P[`${side}Foot`].py = -0.28 * T.legLength;
          }
        }

        // Crossfade all joint rotations & positions smoothly (~0.12s blend time)
        const blendAlpha = 1 - Math.exp(-dt * this.tune.crossfade);
        for (const name of Object.keys(this.joints)) {
          const obj = this.joints[name];
          const cur = this.currentPose[name];
          const tgt = this.targetPose[name];

          // Snap flip pivot cleanly on non-flip states so it never unwinds backward
          if (name === 'bodyFlipPivot' && s !== 'frontflip' && s !== 'backflip') {
            cur.rx = 0;
            tgt.rx = 0;
          }

          cur.rx = THREE.MathUtils.lerp(cur.rx, tgt.rx, blendAlpha);
          cur.ry = THREE.MathUtils.lerp(cur.ry, tgt.ry, blendAlpha);
          cur.rz = THREE.MathUtils.lerp(cur.rz, tgt.rz, blendAlpha);
          cur.px = THREE.MathUtils.lerp(cur.px, tgt.px, blendAlpha);
          cur.py = THREE.MathUtils.lerp(cur.py, tgt.py, blendAlpha);
          cur.pz = THREE.MathUtils.lerp(cur.pz, tgt.pz, blendAlpha);

          obj.rotation.set(cur.rx, cur.ry, cur.rz);
          obj.position.set(cur.px, cur.py, cur.pz);
        }
      }

      /**
       * Secondary procedural motion: twin-buns & pigtails bounce/drag outward & backward
       * with vertical velocity & movement speed, plus dress hem sway.
       */
      _updateSecondaryMotion(dt, speedRatio) {
        const t = this.stateTime + this.cyclePhase * 0.25;
        const hb = this.tune.hairBounce;
        const vertDrag = THREE.MathUtils.clamp(-this.verticalVelocity * 0.055, -0.28, 0.32) * hb;
        const speedDrag = speedRatio * 0.16 * hb;
        const bounce = Math.sin(t * 9.0) * (0.04 + speedRatio * 0.05) * hb;

        const ul = this.joints.bunUpperLeft;
        const ur = this.joints.bunUpperRight;
        const ll = this.joints.bunLowerLeft;
        const lr = this.joints.bunLowerRight;

        if (ul && ur && ll && lr) {
          ul.rotation.z = 0.54 + vertDrag + bounce;
          ul.rotation.x = 0.14 - speedDrag;

          ur.rotation.z = -0.54 - vertDrag - bounce;
          ur.rotation.x = 0.14 - speedDrag;

          ll.rotation.z = 0.46 + vertDrag * 1.25 - bounce;
          ll.rotation.x = 0.20 - speedDrag * 1.35;

          lr.rotation.z = -0.46 - vertDrag * 1.25 + bounce;
          lr.rotation.x = 0.20 - speedDrag * 1.35;
        }

        // Hanging hair (ponytail, twin tails, long hair): trail behind when running, lift when
        // falling, sway with the bounce; the lower segment lags the upper for a little whip
        for (const h of this.refs.hairSwing) {
          if (!h.pivot.parent.visible) continue;
          const k = h.stiff ?? 1;
          const swingX = (speedDrag * 2.2 + Math.max(0, vertDrag) * 2.0 - Math.min(0, vertDrag) * 0.6) * k;
          h.pivot.rotation.x = h.baseRx + swingX + bounce * 0.5 * k;
          h.pivot.rotation.z = h.baseRz + (h.side ? h.side * Math.max(0, vertDrag) * 1.2 : bounce * 0.6) * k;
          h.lag += (swingX - h.lag) * Math.min(1, dt * 5);
          h.lower.rotation.x = (h.lag * 0.8 + bounce * 0.4) * k;
        }

        // Subtle dress hem flare during jumps/flips/running
        if (this.skirtMesh) {
          const flare = (1.0 + Math.max(0, -this.verticalVelocity * 0.015) + speedRatio * 0.03) * this.tune.skirtFlare;
          const bw = this.tune.bodyWidth || 1;
          this.skirtMesh.scale.set(1.04 * flare * bw, this.tune.skirtLength, 0.96 * flare * bw);
        }
      }

      // Sprint trail: world-space puffs that stay where her feet kicked them up
      _buildSprintTrail() {
        this.trail = [];
        this.trailTimer = 0;
        this.trailFoot = 1;
        const geo = new THREE.SphereGeometry(0.11, 8, 6);
        for (let i = 0; i < 48; i++) {
          const mesh = new THREE.Mesh(geo, this.mats.dust.clone());
          mesh.visible = false;
          mesh.material.depthWrite = false;
          this.trail.push({ mesh, active: false, life: 0, maxLife: 0.7, size: 1, vel: new THREE.Vector3() });
        }
      }

      _spawnTrailPuff() {
        const parent = this.group.parent;
        if (!parent || !this.tune.dust) return;
        const p = this.trail.find((t) => !t.active);
        if (!p) return;
        this.trailFoot = -this.trailFoot;
        if (p.mesh.parent !== parent) parent.add(p.mesh);
        // behind the heel of the foot that just pushed off, in the parent's space
        const s = this.group.scale.x;
        this.group.updateMatrix();
        const pos = new THREE.Vector3(this.trailFoot * 0.15, 0.06, -0.2).applyMatrix4(this.group.matrix);
        p.mesh.position.copy(pos);
        const back = new THREE.Vector3(-Math.sin(this.facingAngle), 0, -Math.cos(this.facingAngle));
        p.vel.copy(back).multiplyScalar((0.5 + Math.random() * 0.6) * s);
        p.vel.x += (Math.random() - 0.5) * 0.5 * s;
        p.vel.z += (Math.random() - 0.5) * 0.5 * s;
        p.vel.y = (0.35 + Math.random() * 0.45) * s;
        p.size = (0.8 + Math.random() * 0.5) * s;
        p.active = true;
        p.life = 0;
        p.maxLife = 0.55 + Math.random() * 0.35;
        p.mesh.visible = true;
        p.mesh.scale.setScalar(0.4 * p.size);
        p.mesh.material.opacity = 0.6;
      }

      _updateSprintTrail(dt) {
        const grounded = this.verticalOffset < 0.02;
        if (this.state === 'run' && this.sprinting && (this.sprintBlend || 0) > 0.5 && grounded) {
          this.trailTimer += dt;
          const every = 0.045;
          while (this.trailTimer > every) { this.trailTimer -= every; this._spawnTrailPuff(); }
        } else this.trailTimer = 0;
        for (const p of this.trail) {
          if (!p.active) continue;
          p.life += dt;
          if (p.life >= p.maxLife) { p.active = false; p.mesh.visible = false; continue; }
          const r = p.life / p.maxLife;
          p.vel.multiplyScalar(Math.max(0, 1 - dt * 2.5));   // drag: puffs slow down and hang in the air
          p.mesh.position.addScaledVector(p.vel, dt);
          p.mesh.scale.setScalar(THREE.MathUtils.lerp(0.4, 1.6, Math.sqrt(r)) * p.size);
          p.mesh.material.opacity = 0.6 * (1 - r) * (1 - r);
        }
      }

      _updateDustParticles(dt) {
        for (const p of this.dustParticles) {
          if (!p.active) continue;
          p.life += dt;
          if (p.life >= p.maxLife) {
            p.active = false;
            p.mesh.visible = false;
            continue;
          }
          const ratio = p.life / p.maxLife;
          p.mesh.position.addScaledVector(p.vel, dt);
          p.mesh.scale.setScalar(THREE.MathUtils.lerp(0.45, 1.35, ratio));
          p.mesh.material.opacity = 0.72 * (1 - ratio);
        }
      }

      /**
       * Main per-frame update method for game loop integration.
       * @param {number} rawDt - Frame delta time in seconds
       * @param {THREE.Vector3} moveInput - Normalized XZ movement vector in world space
       * @param {boolean} playableMode - Whether character translates across ground
       */
      update(rawDt, moveInput = this.externalInput, playableMode = true) {
        const dt = Math.min(rawDt, 0.05) * this.options.speedMultiplier;
        this.stateTime += dt;

        const inputLen = Math.min(1, moveInput.length());
        const isMoving = inputLen > 0.05;

        // Automatic locomotion transition between Idle and Run when grounded
        if (this.state === 'idle' && isMoving) {
          this.setState('run');
        } else if (this.state === 'run' && !isMoving && !this.forceContinuousRun) {
          this.setState('idle');
        }

        // World-space movement & smooth facing rotation
        if (playableMode) {
          let speed = 0;
          if (this.state === 'slide') {
            speed = this.options.moveSpeed * 1.32;
          } else if (isMoving && this.state !== 'flex') {
            speed = this.options.moveSpeed * inputLen * (this.sprinting ? this.tune.sprint : 1);
          }

          if (isMoving && this.state !== 'slide' && this.state !== 'flex') {
            const targetAngle = Math.atan2(moveInput.x, moveInput.z);
            let diff = targetAngle - this.facingAngle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            this.facingAngle += diff * Math.min(1, dt * 14);
          }

          this.group.rotation.y = this.facingAngle;

          if (speed > 0.01) {
            const forwardX = Math.sin(this.facingAngle);
            const forwardZ = Math.cos(this.facingAngle);
            this.group.position.x += forwardX * speed * dt;
            this.group.position.z += forwardZ * speed * dt;

            // Keep character within the wooden dock platform bounds
            const b = this.options.arenaBounds;
            this.group.position.x = THREE.MathUtils.clamp(this.group.position.x, -b, b);
            this.group.position.z = THREE.MathUtils.clamp(this.group.position.z, -b, b);
          }
        } else {
          // Showcase turntable mode: stay centered at origin facing forward
          this.group.position.x = THREE.MathUtils.lerp(this.group.position.x, 0, dt * 8);
          this.group.position.z = THREE.MathUtils.lerp(this.group.position.z, 0, dt * 8);
          this.facingAngle = THREE.MathUtils.lerp(this.facingAngle, 0, dt * 8);
          this.group.rotation.y = this.facingAngle;
        }

        // Parabolic vertical gravity arc for Jump, Front Flip, and Back Flip
        const isAirState = this.state === 'jump' || this.state === 'frontflip' || this.state === 'backflip';
        if (isAirState || this.verticalOffset > 0 || this.verticalVelocity > 0) {
          const gravity = this.tune.gravity;
          this.verticalOffset += this.verticalVelocity * dt;
          this.verticalVelocity -= gravity * dt;

          if (this.verticalOffset <= 0) {
            this.verticalOffset = 0;
            this.verticalVelocity = 0;
            // Landing squash & dust puff!
            this._squash(0.24);
            this.spawnDustPuff(new THREE.Vector3(-0.14, 0.05, 0), 1.05);
            this.spawnDustPuff(new THREE.Vector3(0.14, 0.05, 0), 1.05);

            if (isAirState) {
              this.setState(isMoving || this.forceContinuousRun ? 'run' : 'idle');
            }
          }
        }

        // Recover squash-and-stretch smoothly back to (1, 1, 1)
        this.squashScale.lerp(new THREE.Vector3(1, 1, 1), Math.min(1, dt * 14));
        this.rigContainer.position.y = this.verticalOffset;
        this.rigContainer.scale.copy(this.squashScale);

        // Contact shadow shrinks & softens as character jumps higher
        const shadowScale = Math.max(0.45, 1.0 - this.verticalOffset * 0.35);
        this.contactShadow.scale.setScalar(shadowScale);
        this.contactShadow.material.opacity = 0.24 * shadowScale;

        this._updateFace(dt);
        this._evaluateAnimationState(dt, isMoving);
        this._updateSecondaryMotion(dt, isMoving || this.forceContinuousRun ? 1.0 : 0.0);
        this._updateDustParticles(dt);
        this._updateSprintTrail(dt);
      }
    }

    // Export factory & controller globally for easy game integration
    function createFisherCharacter(options) {
      return new FisherCharacterController(options);
    }


    const faceSelect = (def, withAuto) => ({
      type: 'select',
      options: [...(withAuto ? ['auto'] : []), ...FACE_NAMES, 'custom'],
      default: def
    });
    const G = FACE_PRESETS.glare;
    const DEVKIT = {
      expression: {
        mode: faceSelect('glare', true),
        // the grit "< >" eyes (also used by a custom face with eyeStyle 'squint')
        squint: {
          direction: {
            type: 'select',
            options: [{ value: 'outward', label: '< >  tips out' }, { value: 'inward', label: '> <  tips in' }],
            default: 'inward'
          },
          angle: [0.31, 0.1, 1.3, 0.01],
          length: [0.88, 0.4, 1.8, 0.01],
          thickness: [0.97, 0.4, 2.5, 0.01],
          tilt: [-0.53, -0.8, 0.8, 0.01]
        },
        look: { type: 'pad', labels: { x: 'x', y: 'y' } },
        blendSpeed: [1, 1, 40, 1],
        blink: true,
        blinkEvery: [3.5, 0.8, 10, 0.1],
        toCustom: { type: 'action', label: 'Edit current face as custom' },
        auto: { _collapsed: true, rest: faceSelect('glare'), action: faceSelect('grit') },
        custom: {
          _collapsed: true,
          eyeStyle: { type: 'select', options: ['open', 'squint', 'happy', 'sleepy'], default: G.eyeStyle },
          eyeOpen: [G.eyeOpen, 0.05, 1.4, 0.01],
          pupil: [G.pupil, 0.3, 1.6, 0.01],
          browTilt: [G.browTilt, -0.7, 0.7, 0.01],
          browRaise: [G.browRaise, -0.04, 0.07, 0.001],
          browTint: [G.browTint, 0, 1, 0.01],
          mouthCurve: [G.mouthCurve, -1.5, 1.5, 0.01],
          mouthOpen: [G.mouthOpen, 0, 1.2, 0.01],
          mouthRound: [G.mouthRound, 0, 1, 0.01],
          mouthWidth: [G.mouthWidth, 0.4, 1.8, 0.01],
          teeth: G.teeth,
          blush: [G.blush, 0, 2, 0.01]
        }
      },
      pixel: {
        enabled: false,
        scope: {
          type: 'select',
          options: [{ value: 'character', label: 'Character only' }, { value: 'scene', label: 'Whole scene' }],
          default: 'character'
        },
        size: [2, 2, 16, 1],
        colors: [20, 0, 24, 1],
        outline: false,
        outlineWidth: [1, 1, 4, 1],
        outlineColor: '#24161c',
        faceted: true
      },
      face: {
        _collapsed: true,
        eyes: {
          size: [1.47, 0.6, 1.5, 0.01],
          spacing: [0.192, 0.14, 0.27, 0.001],
          height: [0.015, -0.06, 0.08, 0.001],
          pupilSpread: [-0.008, -0.03, 0.03, 0.001],
          depth: [0.02, 0, 0.05, 0.001],
          white: '#F7F5F2',
          iris: '#1E1B24',
          line: '#1E1A22',
          catchlight: true,
          outline: [0, 0, 0.03, 0.001] // dark ring around the eye; 0 = none
        },
        lashes: {
          show: true,
          count: [3, 1, 7, 1],
          length: [0.055, 0.01, 0.1, 0.001],
          thickness: [2.5, 0.3, 2.5, 0.01],
          range: [0.78, 0.2, 2.4, 0.01],
          offset: [0.93, -0.6, 1.2, 0.01],
          flick: [0.24, -0.6, 1, 0.01],
          lower: [0, 0, 5, 1],
          color: '#1E1A22'
        },
        brows: { length: [1.23, 0.4, 1.6, 0.01], thickness: [1.56, 0.4, 2.2, 0.01], color: '#231d26', hotColor: '#e64856' },
        mouth: { height: [-0.123, -0.2, -0.09, 0.001], width: [1.06, 0.4, 1.8, 0.01], thickness: [0.99, 0.4, 2, 0.01], color: '#9E4B3E', inside: '#5A1F2A' },
        blush: { size: [1, 0, 1.8, 0.01], color: '#ff5a2c' },
        nose: { show: false, size: [1, 0.4, 2, 0.01], color: '#ff5268' }
      },
      head: {
        _collapsed: true,
        size: [1, 0.75, 1.35, 0.01],
        width: [1, 0.8, 1.25, 0.01],
        height: [1, 0.8, 1.25, 0.01],
        ears: [1, 0, 1.8, 0.01],
        skin: '#ffad84'
      },
      hair: {
        _collapsed: true,
        style: {
          type: 'select',
          options: [
            { value: 'buns', label: 'Buns & pigtails' },
            { value: 'bun', label: 'Single bun' },
            { value: 'ponytail', label: 'Ponytail' },
            { value: 'twintails', label: 'Twin tails' },
            { value: 'bob', label: 'Bob' },
            { value: 'long', label: 'Long' },
            { value: 'flowing', label: 'Long flowing' },
            { value: 'pixie', label: 'Pixie' },
            { value: 'afro', label: 'Afro' },
            { value: 'bald', label: 'Bald' }
          ],
          default: 'long'
        },
        hairlineShape: {
          type: 'select',
          options: [{ value: 'angular', label: 'Angular (zigzag)' }, { value: 'round', label: 'Round' }],
          default: 'angular'
        },
        points: [3, 2, 11, 1],
        notch: [0.27, 0, 0.3, 0.01],
        hairline: [0.3, -0.04, 0.35, 0.01], // + raises the front edge above the brows (lower cuts into the eyes, higher lifts the bangs off the head)
        length: [1.31, 0.5, 1.8, 0.01],
        volume: [1, 0.7, 1.5, 0.01],
        color: '#ff4f62',
        ties: '#ff6b7a',
        topBuns: true,
        pigtails: true,
        bangs: true,
        // the two square locks at the top of the forehead (mirrored left/right)
        frontLocks: {
          show: true,
          width: [1, 0.3, 2, 0.01],
          height: [1, 0.3, 2.5, 0.01],
          thickness: [1, 0.3, 3, 0.01],
          spread: [0, -0.1, 0.15, 0.001],
          lift: [0, -0.12, 0.15, 0.001],
          forward: [0, -0.05, 0.08, 0.001],
          tilt: [0, -0.8, 0.8, 0.01],
          turn: [0, -0.8, 0.8, 0.01],
          lean: [0, -0.6, 0.6, 0.01]
        },
        bunSize: [1.53, 0.4, 1.7, 0.01],
        bounce: [1.85, 0, 3, 0.05]
      },
      body: {
        _collapsed: true,
        scale: [1, 0.5, 1.8, 0.01],
        dress: '#ffd000',
        skirtFlare: [0.83, 0.7, 1.5, 0.01],
        skirtLength: [1, 0.6, 1.4, 0.01],
        daisy: true,
        petals: '#fffdf8',
        daisyCenter: '#ffb700'
      },
      build: {
        _collapsed: true,
        age: { type: 'select', options: [{ value: 'kid', label: 'Kid (chibi)' }, { value: 'adult', label: 'Adult' }], default: 'kid' },
        torso: [1, 0.7, 1.6, 0.01],      // torso length (adults x1.45)
        shoulders: [1, 0.8, 1.4, 0.01]   // shoulder / body width (adults x1.18)
      },
      outfit: {
        _collapsed: true,
        style: { type: 'select', options: [{ value: 'dress', label: 'Sundress' }, { value: 'shirt', label: 'Shirt & trousers' }, { value: 'overalls', label: 'Overalls' }], default: 'dress' },
        shirt: '#f4efe2',
        pants: '#3a5a8a',
        sleeves: true,
        shorts: false,
        shoes: false,
        shoeColor: '#3a2b22'
      },
      extras: {
        _collapsed: true,
        facialHair: { type: 'select', options: [{ value: 'none', label: 'None' }, { value: 'mustache', label: 'Mustache' }, { value: 'beard', label: 'Beard & mustache' }], default: 'none' },
        facialHairColor: '#4a3426',
        glasses: false,
        glassesColor: '#2b2420'
      },
      npc: {
        _collapsed: true,
        kid: { type: 'action', label: 'Random kid villager' },
        adult: { type: 'action', label: 'Random adult villager' },
        fisher: { type: 'action', label: 'Back to the fisher girl' }
      },
      arms: {
        _collapsed: true,
        length: [1.24, 0.6, 1.6, 0.01],
        thickness: [1.44, 0.5, 1.8, 0.01],
        hand: [2, 0.5, 2, 0.01],
        spread: [0.9, -0.4, 1.2, 0.01]
      },
      legs: {
        _collapsed: true,
        length: [1.6, 0.6, 1.6, 0.01],
        thickness: [1.18, 0.5, 1.8, 0.01],
        foot: [1.36, 0.5, 2, 0.01],
        spread: [0.08, -0.2, 0.6, 0.01],
        stance: [0.82, 0.5, 1.6, 0.01]
      },
      motion: {
        _collapsed: true,
        animSpeed: [1, 0.1, 2.5, 0.05],
        moveSpeed: [5.2, 1, 12, 0.1],
        jumpPower: [6.2, 2, 12, 0.1],
        flipPower: [9.0, 4, 14, 0.1],   // higher flips (peak ~2.2 vs 1.3 for a jump)
        sprint: [1.6, 1, 3, 0.05],      // speed multiplier while Shift is held
        gravity: [18.5, 6, 40, 0.5],
        slideTime: [0.68, 0.2, 1.6, 0.01],
        crossfade: [16, 2, 40, 1],
        squash: [1, 0, 2.5, 0.05],
        idleBreath: [1, 0, 3, 0.05],
        runBounce: [1, 0, 2.5, 0.05],
        dust: true
      },
      actions: {
        _collapsed: true,
        jump: { type: 'action', label: 'Jump' },
        frontflip: { type: 'action', label: 'Front flip' },
        backflip: { type: 'action', label: 'Back flip' },
        slide: { type: 'action', label: 'Slide' },
        flex: { type: 'action', label: 'Power flex' },
        sit: { type: 'action', label: 'Sit (riding)' },
        idle: { type: 'action', label: 'Idle' }
      },
      scene: { _collapsed: true, background: '#CBE8F6', fog: true, ocean: '#45B3E0', props: true }
    };
    // the same config resolved to plain default values (used if DialKit can't load)
    const devkitDefaults = (c) =>
      Object.fromEntries(
        Object.entries(c)
          .filter(([k, v]) => k[0] !== '_' && !(v && v.type === 'action'))
          .map(([k, v]) => [
            k,
            Array.isArray(v) ? v[0]
              : v && v.type === 'select' ? v.default ?? v.options[0]
              : v && v.type === 'pad' ? { x: 0, y: 0 }
              : v && typeof v === 'object' ? devkitDefaults(v)
              : v
          ])
      );


    // ---------------------------------------------------------------------------------
    // VILLAGERS: roll a random look onto a set of DevKit values (kids or adults).
    // Used by the "Random villager" buttons here and by the NPCs in the game levels.
    // ---------------------------------------------------------------------------------
    const V_NAMES = ['Mia','Ollie','Rosa','Theo','Lena','Kai','Nina','Pip','Ada','Luca','Ines','Sami','Juno','Remy','Vera','Tess','Milo','Zoe','Ivo','Lulu','Nico','Dora','Elio','Wren'];
    const V_ADULT_NAMES = ['Marta','Giorgio','Elena','Paolo','Anna','Franco','Lucia','Sandro','Rita','Bruno','Carla','Enzo','Gina','Aldo','Nadia','Piero','Teresa','Vito','Silvia','Ugo','Olga','Dario','Irene','Marco'];
    const V_SKINS = ['#ffad84','#f1c9a5','#e8b896','#d9a27a','#c48a62'];
    const V_HAIR = ['#ff4f62','#2b2420','#4a3426','#6b4a2e','#c9a35a','#e8c872','#b8452e','#9a958a','#f2efe6','#3d5a9e','#6fb7a8','#a77bd6','#ff8fb1','#1f1b1e'];
    const V_ADULT_HAIR = ['#2b2420','#4a3426','#6b4a2e','#c9a35a','#b8452e','#9a958a','#d9d4c8','#f2efe6','#1f1b1e','#7a5a3a'];
    const V_DRESS = ['#ffd000','#e0703f','#2f7489','#7d9a43','#c8453a','#8a6bb8','#f4efe2','#d85a7f','#5fb3c0','#f1c453','#3f78b5','#ef8a5a','#6c5b9e','#9fc56a'];
    const V_SHIRTS = ['#f4efe2','#e9e2cf','#c8453a','#2f7489','#7d9a43','#f1c453','#d85a7f','#5fb3c0','#ef8a5a','#ffffff','#a6c8e8','#e8d0a6'];
    const V_PANTS = ['#3a5a8a','#2b3550','#4a3a2e','#6b5a3e','#5a6b4a','#3a3d52','#7a6a55','#2b2420','#8a5a3a'];
    const V_EYES = ['#1E1B24','#3a2516','#24435c','#2f5233','#4b2f5c','#5a3a1e'];
    const V_STYLES = ['buns','bun','ponytail','twintails','bob','long','flowing','pixie','afro'];   // villagers always have hair
    const V_ADULT_STYLES = ['pixie','pixie','bob','long','ponytail','bun','afro','flowing'];
    const V_MOODS = ['smile','smile','happy','glare','sleepy'];
    const vpick = (a) => a[Math.floor(Math.random() * a.length)];
    const vr = (lo, hi) => lo + Math.random() * (hi - lo);
    const vchance = (p) => Math.random() < p;
    // a name nobody in `taken` (a Set) has yet; repeats only once the list runs out
    const pickName = (list, taken) => { const free = taken ? list.filter((n) => !taken.has(n)) : list; const n = vpick(free.length ? free : list); if (taken) taken.add(n); return n; };
    // D: devkitDefaults(DEVKIT) (or the panel's current values). opts: { adult?: bool, scale?: number, taken?: Set of names in use }
    function rollVillager(D, opts = {}) {
      const adult = opts.adult ?? vchance(0.5);
      const H = D.hair, hair = vpick(adult ? V_ADULT_HAIR : V_HAIR);
      H.style = vpick(adult ? V_ADULT_STYLES : V_STYLES); H.color = hair; H.ties = vpick(V_DRESS);
      H.length = adult ? vr(0.7, 1.3) : vr(0.85, 1.5); H.volume = vr(0.9, 1.15); H.hairline = vr(0.1, 0.32);
      H.hairlineShape = vchance(0.6) ? 'angular' : 'round'; H.points = 2 + Math.floor(Math.random() * 4); H.notch = vr(0.12, 0.3);
      H.topBuns = vchance(0.5); H.pigtails = !adult && vchance(0.5); H.bangs = vchance(0.8); H.frontLocks.show = vchance(0.55); H.bunSize = vr(1.1, 1.6);
      D.head.skin = vpick(V_SKINS); D.head.size = vr(0.92, 1.08) * (adult ? 1 : 1.2); D.head.width = vr(0.94, 1.08); D.head.height = vr(0.94, 1.06);   // kids get a big, round head
      D.face.eyes.iris = vpick(V_EYES); D.face.brows.color = '#' + new THREE.Color(hair).multiplyScalar(0.45).getHexString();
      D.face.blush.size = adult ? vr(0.2, 0.8) : vr(0.5, 1.2);
      D.face.eyes.size = Math.min(1.5, D.face.eyes.size * (adult ? vr(0.74, 0.88) : vr(0.9, 1.02)));
      D.arms.length = vr(1.0, 1.3); D.legs.length = vr(1.2, 1.6);
      D.body.scale = (opts.scale ?? 1) * (adult ? vr(1.02, 1.14) : vr(0.68, 0.78));   // kids stand about two-thirds as tall as the grown-ups
      D.body.dress = vpick(V_DRESS); D.body.daisy = vchance(adult ? 0.15 : 0.4); D.body.skirtLength = vr(0.85, 1.15); D.body.skirtFlare = vr(0.75, 1.05);
      D.expression.mode = vpick(V_MOODS);
      D.build.age = adult ? 'adult' : 'kid'; D.build.torso = vr(0.92, 1.1); D.build.shoulders = vr(0.92, 1.12);
      const r = Math.random(), O = D.outfit;
      O.style = adult ? (r < 0.3 ? 'dress' : r < 0.75 ? 'shirt' : 'overalls') : (r < 0.55 ? 'dress' : r < 0.8 ? 'shirt' : 'overalls');
      O.shirt = vpick(V_SHIRTS); O.pants = vpick(V_PANTS); O.sleeves = vchance(adult ? 0.85 : 0.6); O.shorts = !adult && vchance(0.6);
      O.shoes = vchance(adult ? 0.9 : 0.5); O.shoeColor = vpick(['#3a2b22', '#2b2420', '#6b4a2e', '#8a3a2e', '#e8e2d6']);
      const X = D.extras;
      X.facialHair = 'none';   // no mustaches or beards on villagers (the DevKit can still add one by hand)
      X.facialHairColor = hair; X.glasses = vchance(adult ? 0.3 : 0.1); X.glassesColor = vpick(['#2b2420', '#6b3a2a', '#c9a35a', '#3d5a9e']);
      return {
        adult,
        name: pickName(adult ? V_ADULT_NAMES : V_NAMES, opts.taken),
        color: O.style === 'dress' ? D.body.dress : O.style === 'overalls' ? O.pants : O.shirt,   // their marker colour
        mood: D.expression.mode
      };
    }

    return {
      createVinylToonGradientMap, createGritMouthTexture, createDockPlankTexture,
      FACE_PRESETS, FACE_NAMES, FACE_BLEND_KEYS, col, HEAD_AXES, faceZ, faceYaw, crownGeometry,
      FisherCharacterController, createFisherCharacter, faceSelect, DEVKIT, devkitDefaults, rollVillager
    };
};
