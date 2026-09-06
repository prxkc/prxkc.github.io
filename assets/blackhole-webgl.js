// The expensive per-pixel scene runs in fragment shaders. JavaScript only updates
// a few uniforms; the 2D renderer is loaded separately if WebGL is unavailable.
function createBlackholeWebGL(canvas, viewport, onFailure) {
    const gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance'
    });
    if (!gl) return null;

    const fullscreenVertex = `#version 300 es
        void main() {
            vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
            gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
        }
    `;
    const common = `
        precision highp float;
        precision highp int;
        uniform vec2 uResolution;
        uniform vec2 uCenter;
        uniform float uRadius;
        uniform float uTime;
        uniform float uMode;
        uniform highp sampler2D uBayer;
        float smoothCurve(float x) { return x * x * (3.0 - 2.0 * x); }
        float bayer(ivec2 p) {
            return texelFetch(uBayer, p & ivec2(7), 0).r * (255.0 / 65.0);
        }
    `;
    const sceneFragment = `#version 300 es
        ${common}
        out vec4 outColor;

        float hash(vec2 p, float seed) {
            return fract(sin(dot(p, vec2(127.1, 311.7)) + seed * 74.7) * 43758.5453123);
        }
        float fbm(vec2 p, int octaves) {
            float value = 0.0;
            float amplitude = 0.5;
            for (int i = 0; i < 3; i++) {
                if (i >= octaves) break;
                value += amplitude * hash(floor(p), float(i));
                p *= 2.07;
                amplitude *= 0.5;
            }
            return value;
        }
        vec3 diskColor(float lum) {
            float hot = smoothCurve(clamp((lum - 0.05) / 0.8, 0.0, 1.0));
            float gold = smoothCurve(clamp((lum - 0.4) / 0.8, 0.0, 1.0));
            float white = smoothCurve(clamp((lum - 1.3), 0.0, 1.0));
            return clamp(vec3(
                mix(160.0, 255.0, hot),
                mix(30.0, 255.0, gold + white * 1.5),
                mix(5.0, 255.0, gold * gold + white * 2.0)
            ) / 255.0, 0.0, 1.0);
        }
        void main() {
            // Retain the original top-left pixel grid and two-CSS-pixel blocks.
            vec2 pixel = vec2(floor(gl_FragCoord.x), uResolution.y - 1.0 - floor(gl_FragCoord.y));
            vec2 d = pixel - uCenter;
            float ca = cos(-0.15), sa = sin(-0.15);
            vec2 rotated = vec2(d.x * ca - d.y * sa, d.x * sa + d.y * ca);
            float r = length(rotated);
            float diskR = length(vec2(rotated.x, rotated.y / 0.28));
            float inner = uRadius * 1.5;
            float diskMult = mix(1.0, 0.10, uMode);
            float haloMult = mix(1.0, 4.5, uMode);

            // Alpha encodes the original painter's operation: empty, 1px, or 2px.
            // The composite pass preserves bright 2x2 pixels without running the
            // costly scene shader four times per pixel.
            if (r <= uRadius && !(rotated.y > 0.0 && diskR >= inner)) {
                outColor = vec4(0.0, 0.0, 0.0, 0.5);
                return;
            }
            float brightness = 0.0;
            if (r > uRadius && r < uRadius * 4.0) {
                float hDist = r - uRadius;
                float topWeight = clamp(0.5 - 0.6 * rotated.y / r, 0.0, 1.0);
                float spread = mix(0.15, 0.04, uMode);
                float profile = exp(-hDist * hDist / (uRadius * uRadius * spread));
                float doppler = clamp(1.0 - 0.5 * rotated.x / (uRadius * 1.2), 0.4, 2.5);
                float spiral = atan(rotated.y, rotated.x) + uTime * 3.5;
                float noise = fbm(vec2(spiral * 4.0, hDist * 0.3 - uTime), 2);
                brightness += profile * (0.2 + 0.8 * topWeight) * doppler
                    * (0.4 + 1.2 * noise) * 2.0 * diskMult * haloMult;
            }
            if (diskR >= inner && diskR < inner * 16.0) {
                float dDist = diskR - inner;
                float profile = exp(-dDist * dDist / (inner * inner * 3.5));
                profile += 0.2 * exp(-dDist * dDist / (inner * inner * 12.0));
                float doppler = clamp(1.0 - 0.85 * rotated.x / inner, 0.1, 3.0);
                float angle = atan(rotated.y / 0.28, rotated.x);
                float speed = 1.0 + 1.8 * inner / diskR;
                float spiral = angle + speed * uTime * 0.8;
                float noise = fbm(vec2(diskR * 0.05 - uTime * 0.3, spiral * 6.0), 3);
                float streams = pow(0.5 + 0.5 * sin(spiral * 10.0 - diskR * 0.1), 2.0);
                brightness += profile * doppler * (0.3 + 0.7 * noise)
                    * (0.4 + 0.6 * streams) * 3.0 * diskMult * haloMult;
            }
            if (abs(r - uRadius) < uResolution.x * 0.003) {
                float doppler = clamp(1.0 - 0.8 * rotated.x / uRadius, 0.2, 3.0);
                brightness += doppler * diskMult * haloMult;
            }
            if (uMode > 0.01) {
                for (int jet = 0; jet < 2; jet++) {
                    bool counter = jet == 1;
                    float angle = counter ? 0.565486677646 : 3.707079331236;
                    vec2 axis = vec2(cos(angle), sin(angle));
                    float projection = dot(d, axis);
                    float maxProjection = uResolution.x * (counter ? 0.24 : 0.62);
                    if (projection < uRadius * 2.2 || projection > maxProjection) continue;
                    float perpendicular = abs(-d.x * axis.y + d.y * axis.x);
                    float halfWidth = uRadius * 0.9 + projection * 0.095;
                    if (perpendicular > halfWidth * 2.8) continue;
                    float angleFall = exp(-perpendicular * perpendicular / (halfWidth * halfWidth * 0.55));
                    float distanceFall = counter
                        ? exp(-projection / (uResolution.x * 0.09)) * 0.55
                        : pow(uRadius * 3.5 / (projection + uRadius), 1.05)
                            * exp(-projection / (uResolution.x * 0.52));
                    float noise = fbm(vec2(projection * 0.022 - uTime * 0.14,
                        perpendicular * 0.038 + uTime * 0.09), 3);
                    float knots = counter ? 0.9
                        : pow(0.5 + 0.5 * sin(projection * 0.052 - uTime * 0.95), 2.5);
                    brightness += angleFall * distanceFall * (0.22 + 0.78 * noise)
                        * (0.32 + 0.68 * knots) * (counter ? 1.1 : 2.4) * uMode;
                }
            }
            brightness = clamp(brightness * (0.85 + 0.15 * hash(pixel, 9.0)), 0.0, 3.0);
            if (clamp(brightness * 0.7, 0.0, 1.1) > bayer(ivec2(pixel))) {
                outColor = vec4(diskColor(brightness), brightness > 1.8 ? 1.0 : 0.5);
            } else {
                outColor = vec4(0.0);
            }
        }
    `;
    const compositeFragment = `#version 300 es
        precision highp float;
        precision highp int;
        uniform highp sampler2D uScene;
        out vec4 outColor;
        vec4 samplePixel(ivec2 p) {
            if (any(lessThan(p, ivec2(0))) || any(greaterThanEqual(p, textureSize(uScene, 0)))) return vec4(0.0);
            return texelFetch(uScene, p, 0);
        }
        void main() {
            ivec2 p = ivec2(gl_FragCoord.xy);
            vec4 color = samplePixel(p);
            if (color.a == 0.0) {
                // Last write wins in the original top-to-bottom, left-to-right loop.
                color = samplePixel(p + ivec2(-1, 0));
                if (color.a < 0.9) color = samplePixel(p + ivec2(0, 1));
                if (color.a < 0.9) color = samplePixel(p + ivec2(-1, 1));
                if (color.a < 0.9) discard;
            }
            outColor = vec4(color.rgb, 1.0);
        }
    `;
    const starVertex = `#version 300 es
        ${common}
        layout(location = 0) in vec4 aStar;
        out vec3 vColor;
        void main() {
            vec2 d = aStar.xy * uResolution - uCenter;
            float radiusSquared = uRadius * uRadius;
            float lens = 1.0 + 1.5 * radiusSquared / (dot(d, d) + 1.0);
            vec2 pixel = floor(uCenter + d * lens + 0.5);
            vec2 offset = pixel - uCenter;
            float twinkle = 0.78 + 0.22 * sin(uTime * 1.5 + aStar.w * 22.0);
            float lum = (mix(0.13, 0.18, uMode) + (1.0 - aStar.z) * 0.11) * twinkle;
            float size = aStar.z > 0.94 ? 2.0 : 1.0;
            float threshold = size == 2.0 ? 0.955 : 0.985;
            float hot = smoothCurve(clamp((lum - 0.58) / 0.42, 0.0, 1.0));
            vColor = vec3(mix(190.0, 255.0, hot), mix(205.0, 248.0, hot),
                mix(220.0, 240.0, hot) * (1.0 - hot) + 240.0 * hot) / 255.0;
            vec2 position = (pixel + size * 0.5) / uResolution * 2.0 - 1.0;
            gl_Position = vec4(position.x, -position.y, 0.0, 1.0);
            gl_PointSize = size;
            if (dot(offset, offset) < radiusSquared || lum <= bayer(ivec2(pixel)) * threshold) {
                gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
            }
        }
    `;
    const starFragment = `#version 300 es
        precision highp float;
        in vec3 vColor;
        out vec4 outColor;
        void main() { outColor = vec4(vColor, 1.0); }
    `;

    const bayerValues = new Uint8Array([
        0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
        12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
        3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
        15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21
    ].map(value => value + 1));
    let resources = [];
    let sceneProgram, compositeProgram, starProgram;
    let sceneTexture, bayerTexture, framebuffer, starBuffer, starArray;
    let width = 0, height = 0, starCount = 0;
    let time = 0, transition = 0, target = 0;
    let paused = true, lost = false, disposed = false;
    let frameID = null, lastFrame = null;

    function track(resource, remove) {
        if (!resource) throw new Error('Unable to allocate WebGL resource');
        resources.push(() => remove.call(gl, resource));
        return resource;
    }
    function program(vertexSource, fragmentSource) {
        const shaders = [vertexSource, fragmentSource].map((source, index) => {
            const shader = track(gl.createShader(index === 0 ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER), gl.deleteShader);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
            return shader;
        });
        const handle = track(gl.createProgram(), gl.deleteProgram);
        shaders.forEach(shader => gl.attachShader(handle, shader));
        gl.linkProgram(handle);
        if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(handle));
        const uniforms = {};
        for (const name of ['uResolution', 'uCenter', 'uRadius', 'uTime', 'uMode', 'uBayer', 'uScene']) {
            uniforms[name] = gl.getUniformLocation(handle, name);
        }
        return { handle, uniforms };
    }
    function texture() {
        const handle = track(gl.createTexture(), gl.deleteTexture);
        gl.bindTexture(gl.TEXTURE_2D, handle);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return handle;
    }
    function initialize() {
        // Old handles are invalid after context restoration.
        resources = [];
        sceneProgram = program(fullscreenVertex, sceneFragment);
        compositeProgram = program(fullscreenVertex, compositeFragment);
        starProgram = program(starVertex, starFragment);
        gl.activeTexture(gl.TEXTURE0);
        bayerTexture = texture();
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 8, 8, 0, gl.RED, gl.UNSIGNED_BYTE, bayerValues);
        gl.activeTexture(gl.TEXTURE1);
        sceneTexture = texture();
        framebuffer = track(gl.createFramebuffer(), gl.deleteFramebuffer);
        starBuffer = track(gl.createBuffer(), gl.deleteBuffer);
        starArray = track(gl.createVertexArray(), gl.deleteVertexArray);
        gl.bindVertexArray(starArray);
        gl.bindBuffer(gl.ARRAY_BUFFER, starBuffer);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
        gl.disable(gl.DITHER);
        gl.disable(gl.BLEND);
        gl.clearColor(0, 0, 0, 1);
        resize(viewport, true);
    }
    function resize(nextViewport, force = false) {
        viewport = nextViewport;
        if (lost || disposed) return;
        let nextWidth = Math.max(1, Math.floor(viewport.width / 2));
        let nextHeight = Math.max(1, Math.floor(viewport.height / 2));
        const aspect = viewport.height / viewport.width;
        if (nextWidth < 180) { nextWidth = 180; nextHeight = Math.floor(180 * aspect); }
        if (nextHeight < 180) { nextHeight = 180; nextWidth = Math.floor(180 / aspect); }
        const limit = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        const ratio = Math.min(1, limit / Math.max(nextWidth, nextHeight));
        nextWidth = Math.max(1, Math.floor(nextWidth * ratio));
        nextHeight = Math.max(1, Math.floor(nextHeight * ratio));
        if (!force && nextWidth === width && nextHeight === height) return;
        width = canvas.width = nextWidth;
        height = canvas.height = nextHeight;
        gl.viewport(0, 0, width, height);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTexture, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete WebGL framebuffer');
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        const hash = (x, y, seed) => {
            const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
            return value - Math.floor(value);
        };
        starCount = Math.max(30, Math.floor(width * height * 0.00018));
        const stars = new Float32Array(starCount * 4);
        for (let i = 0; i < starCount; i++) {
            stars.set([hash(i * 1.73, i * 7.11, 1), hash(i * 4.91, i * 2.33, 2),
                Math.pow(hash(i * 8.23, i * 5.12, 3), 2.7), hash(i * 9.13, i * 3.77, 4)], i * 4);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, starBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, stars, gl.STATIC_DRAW);
    }
    function useSceneProgram(program, t, cx, cy, radius) {
        gl.useProgram(program.handle);
        const u = program.uniforms;
        gl.uniform2f(u.uResolution, width, height);
        gl.uniform2f(u.uCenter, cx, cy);
        gl.uniform1f(u.uRadius, radius);
        gl.uniform1f(u.uTime, time);
        gl.uniform1f(u.uMode, t);
        gl.uniform1i(u.uBayer, 0);
    }
    function render(delta) {
        time += delta * 0.0003;
        transition += (target - transition) * (1 - Math.pow(0.91, delta / (1000 / 60)));
        if (Math.abs(target - transition) < 0.0008) transition = target;
        const t = transition * transition * (3 - 2 * transition);
        const mobile = viewport.width <= 768;
        const mix = (a, b) => a + (b - a) * t;
        const cx = width * mix(mobile ? 0.75 : 0.70, 0.74);
        const cy = height * mix(mobile ? 0.35 : 0.48, 0.28);
        const radius = Math.min(width, height) * 0.11 * mix(mobile ? 0.7 : 1.0, 0.13);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, bayerTexture);
        gl.bindVertexArray(null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        useSceneProgram(sceneProgram, t, cx, cy, radius);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clear(gl.COLOR_BUFFER_BIT);
        useSceneProgram(starProgram, t, cx, cy, radius);
        gl.bindVertexArray(starArray);
        gl.drawArrays(gl.POINTS, 0, starCount);
        gl.bindVertexArray(null);
        gl.useProgram(compositeProgram.handle);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
        gl.uniform1i(compositeProgram.uniforms.uScene, 1);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function frame(timestamp) {
        frameID = null;
        if (paused || lost || disposed) return;
        const elapsed = lastFrame === null ? 1000 / 60 : timestamp - lastFrame;
        // Follow the display refresh rate. A fixed 60fps threshold would skip
        // every other frame on 75/90Hz displays; elapsed time keeps motion steady.
        lastFrame = timestamp;
        render(Math.min(elapsed, 100));
        frameID = requestAnimationFrame(frame);
    }
    function setPaused(value) {
        paused = value;
        cancelAnimationFrame(frameID);
        frameID = null;
        lastFrame = null;
        if (!paused && !lost && !disposed) frameID = requestAnimationFrame(frame);
    }
    function contextLost(event) {
        event.preventDefault();
        lost = true;
        cancelAnimationFrame(frameID);
        frameID = null;
    }
    function contextRestored() {
        if (disposed) return;
        lost = false;
        try {
            initialize();
            setPaused(paused);
        } catch (error) {
            destroy();
            onFailure(error);
        }
    }
    function destroy() {
        disposed = true;
        cancelAnimationFrame(frameID);
        canvas.removeEventListener('webglcontextlost', contextLost);
        canvas.removeEventListener('webglcontextrestored', contextRestored);
        resources.forEach(remove => remove());
        resources = [];
    }
    try {
        initialize();
    } catch (error) {
        destroy();
        throw error;
    }
    canvas.addEventListener('webglcontextlost', contextLost);
    canvas.addEventListener('webglcontextrestored', contextRestored);
    return { setMode(mode) { target = mode === 'resume' ? 1 : 0; }, setPaused, resize, destroy };
}
