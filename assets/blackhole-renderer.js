function createBlackhole(canvas, viewport) {

    // Full-bleed cinematic pixel space background
    const ctx = canvas.getContext('2d', { alpha: true });
    ctx.imageSmoothingEnabled = false;

    // Smaller rendered pixels for a finer, denser image.
    const PIXEL = 2;
    const BAYER8 = [
        0, 32, 8, 40, 2, 34, 10, 42,
        48, 16, 56, 24, 50, 18, 58, 26,
        12, 44, 4, 36, 14, 46, 6, 38,
        60, 28, 52, 20, 62, 30, 54, 22,
        3, 35, 11, 43, 1, 33, 9, 41,
        51, 19, 59, 27, 49, 17, 57, 25,
        15, 47, 7, 39, 13, 45, 5, 37,
        63, 31, 55, 23, 61, 29, 53, 21
    ].map(v => (v + 1) / 65);

    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const smooth = (x) => x * x * (3 - 2 * x);
    const bayer = (x, y) => BAYER8[((y & 7) * 8) + (x & 7)];
    const h = (x, y, s = 0) => {
        const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453123;
        return v - Math.floor(v);
    };
    const fbm = (x, y, oct = 3) => {
        let v = 0, a = 0.5;
        for (let i = 0; i < oct; i++) {
            v += a * h(Math.floor(x), Math.floor(y), i);
            x *= 2.07;
            y *= 2.07;
            a *= 0.5;
        }
        return v;
    };

    const mix = (a, b, t) => a + (b - a) * t;

    let W = 0, H = 0, time = 0;
    let img, buf, stars = [];

    // Black hole scene mode: 0 = home (close), 1 = resume (zoomed-out + jets)
    const bhState = { t: 0, targetT: 0 };

    function setMode(mode) {
        bhState.targetT = (mode === 'resume') ? 1 : 0;
    };

    function writePixel(x, y, r, g, b, size = 1) {
        for (let oy = 0; oy < size; oy++) {
            for (let ox = 0; ox < size; ox++) {
                const px = x + ox;
                const py = y + oy;
                if (px < 0 || py < 0 || px >= W || py >= H) continue;
                const i = (py * W + px) * 4;
                buf[i] = r;
                buf[i + 1] = g;
                buf[i + 2] = b;
                buf[i + 3] = 255;
            }
        }
    }

    function resize() {
        const vw = viewport.width;
        const vh = viewport.height;
        const aspect = vh / vw;
        W = Math.floor(vw / PIXEL);
        H = Math.floor(vh / PIXEL);
        // Ensure a minimum resolution while preserving aspect ratio
        const MIN = 180;
        if (W < MIN) { W = MIN; H = Math.floor(MIN * aspect); }
        if (H < MIN) { H = MIN; W = Math.floor(MIN / aspect); }
        canvas.width = W;
        canvas.height = H;
        img = ctx.createImageData(W, H);
        buf = img.data;
        buildField();
    }

    function buildField() {
        stars = [];
        // Sparse background only; keep empty black space dominant.
        const starCount = Math.max(30, Math.floor(W * H * 0.00018));
        for (let i = 0; i < starCount; i++) {
            stars.push({
                x: h(i * 1.73, i * 7.11, 1),
                y: h(i * 4.91, i * 2.33, 2),
                depth: Math.pow(h(i * 8.23, i * 5.12, 3), 2.7),
                tw: h(i * 9.13, i * 3.77, 4)
            });
        }
    }

    function starColor(depth, tw, lum) {
        const t = clamp(lum, 0, 1);
        const hot = smooth(clamp((t - 0.58) / 0.42, 0, 1));
        const cool = 1 - hot;
        const r = mix(190, 255, hot);
        const g = mix(205, 248, hot);
        const b = mix(220, 240, hot) * cool + 240 * hot;
        return [r, g, b];
    }

    function diskColor(lum) {
        // Strong orange/yellow shift honoring Doppler beaming ranges
        const hot = smooth(clamp((lum - 0.05) / 0.8, 0, 1));
        const gold = smooth(clamp((lum - 0.4) / 0.8, 0, 1));
        const white = smooth(clamp((lum - 1.3) / 1.0, 0, 1)); // Engages on extreme doppler shift

        const r = mix(160, 255, hot);
        const g = mix(30, 255, gold + white * 1.5);
        const b = mix(5, 255, gold * gold + white * 2.0);

        return [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255)];
    }

    function draw(delta) {
        time += delta * 0.0003;
        buf.fill(0);

        // ── Animate transition t (exponential lerp — fast & silky smooth) ──
        bhState.t += (bhState.targetT - bhState.t) * (1 - Math.pow(0.91, delta / (1000 / 60)));
        if (Math.abs(bhState.targetT - bhState.t) < 0.0008) bhState.t = bhState.targetT;
        const t = smooth(bhState.t);

        // ── Interpolated scene parameters ─────────────────────────────
        // Detect mobile (narrow viewport) and adjust BH positioning
        const isMobile = viewport.width <= 768;
        const homeX = isMobile ? 0.75 : 0.70;
        const homeY = isMobile ? 0.35 : 0.48;
        const cx = W * mix(homeX, 0.74, t);
        const cy = H * mix(homeY, 0.28, t);
        // Much smaller in resume mode; also smaller on mobile
        const mobileScale = isMobile ? 0.7 : 1.0;
        const scale = mix(mobileScale, 0.13, t);

        const R_shadow = Math.min(W, H) * 0.11 * scale;
        const R_inner = R_shadow * 1.5;
        const tilt = 0.28;
        const ang = -0.15;
        const ca = Math.cos(ang), sa = Math.sin(ang);

        // Accretion disk dims as jets appear; halo stays dense
        const diskMult = mix(1.0, 0.10, t);
        // Dense luminous corona around the tiny hole in resume mode
        const haloMult = mix(1.0, 4.5, t);

        // 1. Draw Stars with Gravitational Lensing
        for (const s of stars) {
            let sx = s.x * W;
            let sy = s.y * H;
            let dx = sx - cx;
            let dy = sy - cy;
            let dist2 = dx * dx + dy * dy;
            const R_s2 = R_shadow * R_shadow;

            let lensFactor = 1.0 + 1.5 * R_s2 / (dist2 + 1.0);
            let lx = cx + dx * lensFactor;
            let ly = cy + dy * lensFactor;
            const px = Math.round(lx);
            const py = Math.round(ly);

            const l_dx = px - cx;
            const l_dy = py - cy;
            if (l_dx * l_dx + l_dy * l_dy < R_s2) continue;

            const tw = 0.78 + 0.22 * Math.sin(time * 1.5 + s.tw * 22.0);
            // Stars become slightly more visible (more spread) in resume mode
            const lumBase = mix(0.13, 0.18, t);
            const lum = (lumBase + (1 - s.depth) * 0.11) * tw;
            const starSize = s.depth > 0.94 ? 2 : 1;
            const threshold = starSize === 2 ? 0.955 : 0.985;
            if (lum > bayer(px, py) * threshold) {
                const [r, g, b] = starColor(s.depth, s.tw, lum);
                writePixel(px, py, r, g, b, starSize);
            }
        }

        // 2. Draw Black Hole + Jets
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const dx = x - cx;
                const dy = y - cy;

                const rx = dx * ca - dy * sa;
                const ry = dx * sa + dy * ca;
                const r = Math.hypot(rx, ry);
                const disk_r = Math.hypot(rx, ry / tilt);

                // Event Horizon pure black mask
                if (r <= R_shadow) {
                    const isFrontDisk = (ry > 0 && disk_r >= R_inner);
                    if (!isFrontDisk) {
                        writePixel(x, y, 0, 0, 0, 1);
                        continue;
                    }
                }

                let brightness = 0;

                // Skip only the exponentially faint tails, below the dither threshold.
                // Gravitational Lensing Halo
                if (r > R_shadow && r < R_shadow * 4) {
                    let hDist = r - R_shadow;
                    let topWeight = clamp(0.5 - 0.6 * (ry / r), 0, 1);
                    // Tighter halo profile in resume mode (denser glow)
                    const haloSpread = mix(0.15, 0.04, t);
                    let hProfile = Math.exp(-hDist * hDist / (R_shadow * R_shadow * haloSpread));
                    let doppler = clamp(1.0 - 0.5 * (rx / (R_shadow * 1.2)), 0.4, 2.5);
                    let hAngle = Math.atan2(ry, rx);
                    let spiralTh = hAngle + time * 3.5;
                    let noise = fbm(spiralTh * 4.0, hDist * 0.3 - time, 2);
                    brightness += hProfile * (0.2 + 0.8 * topWeight) * doppler * (0.4 + 1.2 * noise) * 2.0 * diskMult * haloMult;
                }

                // Flat Volumetric Accretion Disk
                if (disk_r >= R_inner && disk_r < R_inner * 16) {
                    let dDist = disk_r - R_inner;
                    let dProfile = Math.exp(-dDist * dDist / (R_inner * R_inner * 3.5));
                    dProfile += 0.2 * Math.exp(-dDist * dDist / (R_inner * R_inner * 12.0));
                    let doppler = clamp(1.0 - 0.85 * (rx / R_inner), 0.1, 3.0);
                    let dAngle = Math.atan2(ry / tilt, rx);
                    let rotSpeed = 1.0 + 1.8 * (R_inner / disk_r);
                    let spiralTh = dAngle + rotSpeed * time * 0.8;
                    let noise = fbm(disk_r * 0.05 - time * 0.3, spiralTh * 6.0, 3);
                    let streams = Math.pow(0.5 + 0.5 * Math.sin(spiralTh * 10.0 - disk_r * 0.1), 2.0);
                    let diskInt = dProfile * doppler * (0.3 + 0.7 * noise) * (0.4 + 0.6 * streams) * 3.0;
                    if (!(ry < 0 && r <= R_shadow)) brightness += diskInt * diskMult * haloMult;
                }

                // Photon ring
                if (Math.abs(r - R_shadow) < W * 0.003) {
                    let doppler = clamp(1.0 - 0.8 * (rx / R_shadow), 0.2, 3.0);
                    brightness += 1.0 * doppler * diskMult * haloMult;
                }

                // ── Relativistic Jets (M87-style, fade in with t) ─────
                if (t > 0.01) {
                    // Primary jet: toward lower-left (matches image diagonal)
                    // Counter-jet: upper-right (more diffuse cloud)
                    const JET_ANG = Math.PI * 1.18;
                    const CTR_ANG = JET_ANG - Math.PI;

                    for (let ji = 0; ji < 2; ji++) {
                        const angle = ji === 0 ? JET_ANG : CTR_ANG;
                        const isCounter = ji === 1;
                        const cosA = Math.cos(angle);
                        const sinA = Math.sin(angle);

                        // Signed projection along jet axis
                        const projLen = dx * cosA + dy * sinA;
                        const minProj = R_shadow * 2.2;
                        const maxProj = isCounter ? W * 0.24 : W * 0.62;
                        if (projLen < minProj || projLen > maxProj) continue;

                        // Perpendicular distance from jet axis
                        const perpDist = Math.abs(-dx * sinA + dy * cosA);
                        // Jet widens linearly with distance (cone)
                        const halfW = R_shadow * 0.9 + projLen * 0.095;
                        if (perpDist > halfW * 2.8) continue;

                        const angFall = Math.exp(-perpDist * perpDist / (halfW * halfW * 0.55));
                        const distFall = isCounter
                            ? Math.exp(-projLen / (W * 0.09)) * 0.55
                            : Math.pow((R_shadow * 3.5) / (projLen + R_shadow), 1.05)
                            * Math.exp(-projLen / (W * 0.52));

                        const jNoise = fbm(projLen * 0.022 - time * 0.14,
                            perpDist * 0.038 + time * 0.09, 3);
                        // Bright knots along primary jet
                        const knots = isCounter ? 0.9
                            : Math.pow(0.5 + 0.5 * Math.sin(projLen * 0.052 - time * 0.95), 2.5);

                        let jb = angFall * distFall
                            * (0.22 + 0.78 * jNoise)
                            * (0.32 + 0.68 * knots)
                            * (isCounter ? 1.1 : 2.4)
                            * t;
                        brightness += jb;
                    }
                }

                if (brightness > 0) {
                    brightness *= 0.85 + 0.15 * h(x, y, 9);
                    brightness = clamp(brightness, 0, 3.0);
                    let density = clamp(brightness * 0.7, 0, 1.1);
                    if (density > bayer(x, y)) {
                        const [rC, gC, bC] = diskColor(brightness);
                        const size = brightness > 1.8 ? 2 : 1;
                        writePixel(x, y, rC, gC, bC, size);
                    }
                }
            }
        }

        ctx.putImageData(img, 0, 0);

    }


    // Keep the full pixel resolution; render independently of UI animation.
    const frameInterval = 1000 / 30;
    let timer = null;
    let lastFrame = 0;
    let paused = true;
    function frame() {
        if (paused) return;
        const now = performance.now();
        const delta = lastFrame ? Math.min(now - lastFrame, 100) : 1000 / 60;
        lastFrame = now;
        draw(delta);
        timer = setTimeout(frame, Math.max(0, frameInterval - (performance.now() - now)));
    }
    function setPaused(value) {
        if (paused === value) return;
        paused = value;
        clearTimeout(timer);
        lastFrame = 0;
        if (!paused) timer = setTimeout(frame, 0);
    }
    resize();
    return {
        setMode,
        setPaused,
        resize(nextViewport) {
            if (viewport.width === nextViewport.width && viewport.height === nextViewport.height) return;
            viewport = nextViewport;
            resize();
        }
    };
}

// This file also runs directly as a worker; the same renderer supports older browsers.
if (typeof document === 'undefined') {
    let scene;
    self.onmessage = ({ data }) => {
        if (data.type === 'init') {
            scene = createBlackhole(data.canvas, data.viewport);
            scene.setPaused(data.hidden);
        } else if (data.type === 'resize') scene.resize(data.viewport);
        else if (data.type === 'mode') scene.setMode(data.mode);
        else if (data.type === 'visibility') scene.setPaused(data.hidden);
    };
}
