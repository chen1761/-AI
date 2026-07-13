(function () {
  const spotlight = document.getElementById("cursorSpotlight");
  if (!spotlight || window.matchMedia("(pointer: coarse)").matches) return;

  const mouse = { x: -999, y: -999 };
  const smooth = { x: -999, y: -999 };
  let active = false;
  let rafId = 0;

  function onMove(event) {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    if (!active) {
      smooth.x = mouse.x;
      smooth.y = mouse.y;
      spotlight.classList.add("is-active");
      active = true;
    }
  }

  function onLeave() {
    active = false;
    spotlight.classList.remove("is-active");
    mouse.x = -999;
    mouse.y = -999;
  }

  function tick() {
    smooth.x += (mouse.x - smooth.x) * 0.1;
    smooth.y += (mouse.y - smooth.y) * 0.1;
    spotlight.style.setProperty("--spotlight-x", `${smooth.x}px`);
    spotlight.style.setProperty("--spotlight-y", `${smooth.y}px`);
    rafId = requestAnimationFrame(tick);
  }

  window.addEventListener("mousemove", onMove, { passive: true });
  window.addEventListener("mouseleave", onLeave, { passive: true });
  rafId = requestAnimationFrame(tick);

  window.addEventListener("pagehide", () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseleave", onLeave);
    cancelAnimationFrame(rafId);
  });
})();
