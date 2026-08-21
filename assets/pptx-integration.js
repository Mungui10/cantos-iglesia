(function () {
  "use strict";

  const MODULE_URL = new URL("./pptx-renderer-1.2.4.es.js", document.currentScript.src).href;
  const containerRenders = new WeakMap();
  let modulePromise = null;

  function rendererModule() {
    if (!modulePromise) modulePromise = import(MODULE_URL);
    return modulePromise;
  }

  function assertSession(session) {
    if (!session?.presentation?.slides?.length) throw new Error("La presentación PowerPoint no contiene diapositivas válidas");
  }

  async function createSession(blob) {
    if (!(blob instanceof Blob)) throw new TypeError("El archivo PowerPoint no es válido");
    const renderer = await rendererModule();
    const files = await renderer.parseZipLazyMedia(await blob.arrayBuffer(), renderer.RECOMMENDED_ZIP_LIMITS);
    const presentation = renderer.buildPresentation(files, { lazySlides: true });
    const session = { renderer, presentation, mediaUrlCache: new Map(), chartInstances: new Set() };
    assertSession(session);
    return session;
  }

  function metadata(session) {
    assertSession(session);
    const { width, height, slides } = session.presentation;
    return { width, height, slideCount: slides.length, aspectRatio: width > 0 && height > 0 ? width / height : 16 / 9 };
  }

  function disposeContainer(container) {
    const active = containerRenders.get(container);
    if (!active) return;
    active.resizeObserver?.disconnect();
    active.handle?.dispose();
    containerRenders.delete(container);
  }

  async function render(session, slideIndex, container) {
    assertSession(session);
    const index = Number(slideIndex);
    if (!Number.isInteger(index) || index < 0 || index >= session.presentation.slides.length) throw new RangeError("La diapositiva PowerPoint solicitada no existe");
    disposeContainer(container);
    container.replaceChildren();
    container.classList.add("pptx-render-host");

    const frame = document.createElement("div");
    frame.className = "pptx-render-frame";
    const handle = session.renderer.renderSlide(session.presentation, session.presentation.slides[index], {
      mediaUrlCache: session.mediaUrlCache,
      chartInstances: session.chartInstances,
      onNodeError: (nodeId, error) => console.warn("PPTX NODE RENDER skipped", { slideIndex: index, nodeId, error })
    });
    frame.append(handle.element);
    container.append(frame);

    const resize = () => {
      const { width, height } = session.presentation;
      const scale = Math.min(container.clientWidth / width, container.clientHeight / height);
      frame.style.width = `${width}px`;
      frame.style.height = `${height}px`;
      frame.style.transform = `translate(-50%, -50%) scale(${Number.isFinite(scale) && scale > 0 ? scale : 1})`;
    };
    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
    resizeObserver?.observe(container);
    containerRenders.set(container, { handle, resizeObserver });
    resize();
    await handle.ready;
    resize();
  }

  function disposeSession(session) {
    if (!session) return;
    session.chartInstances?.forEach(instance => instance.dispose?.());
    session.chartInstances?.clear();
    session.mediaUrlCache?.forEach(url => { if (String(url).startsWith("blob:")) URL.revokeObjectURL(url); });
    session.mediaUrlCache?.clear();
  }

  window.HimnarioPptx = Object.freeze({ createSession, metadata, render, disposeContainer, disposeSession });
})();
