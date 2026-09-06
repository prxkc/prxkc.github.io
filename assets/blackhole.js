(() => {
    let canvas = document.getElementById('bh');
    const rendererURL = new URL('blackhole-renderer.js', document.currentScript.src);
    const viewport = () => ({ width: innerWidth, height: innerHeight });
    let worker;
    let scene;
    let mode = 'home';
    let fallbackStarted = false;
    let cpuStarted = false;

    window.setBlackholeMode = nextMode => {
        mode = nextMode;
        if (worker) worker.postMessage({ type: 'mode', mode });
        else scene?.setMode(mode);
    };

    function replaceCanvas() {
        const replacement = canvas.cloneNode();
        canvas.replaceWith(replacement);
        canvas = replacement;
    }

    function fallback() {
        if (fallbackStarted) return;
        fallbackStarted = true;
        worker?.terminate();
        worker = null;
        // A transferred canvas cannot be reused on the main thread.
        replaceCanvas();
        const script = document.createElement('script');
        script.src = rendererURL.href;
        script.onload = () => {
            scene = createBlackhole(canvas, viewport());
            scene.setMode(mode);
            scene.setPaused(document.hidden);
        };
        document.head.append(script);
    }

    function startCPU() {
        if (cpuStarted) return;
        cpuStarted = true;
        scene?.destroy();
        scene = null;
        // A canvas that acquired WebGL cannot subsequently acquire a 2D context.
        replaceCanvas();
        try {
            if (!canvas.transferControlToOffscreen || !window.Worker) {
                fallback();
            } else {
                worker = new Worker(rendererURL);
                worker.onerror = fallback;
                const offscreen = canvas.transferControlToOffscreen();
                worker.postMessage({ type: 'init', canvas: offscreen, viewport: viewport(), hidden: document.hidden }, [offscreen]);
                worker.postMessage({ type: 'mode', mode });
            }
        } catch {
            fallback();
        }
    }

    try {
        scene = window.createBlackholeWebGL?.(canvas, viewport(), startCPU);
        if (scene) scene.setPaused(document.hidden);
        else startCPU();
    } catch {
        startCPU();
    }

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (worker) worker.postMessage({ type: 'resize', viewport: viewport() });
            else {
                try { scene?.resize(viewport()); }
                catch { startCPU(); }
            }
        }, 120);
    }, { passive: true });

    document.addEventListener('visibilitychange', () => {
        if (worker) worker.postMessage({ type: 'visibility', hidden: document.hidden });
        else scene?.setPaused(document.hidden);
    });
})();
