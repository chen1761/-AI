(function () {
  const scroller = document.getElementById("scroller");
  if (!scroller) return;

  scroller.addEventListener("wheel", (event) => {
    if (window.matchMedia("(max-width: 1100px)").matches) return;
    event.preventDefault();
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    scroller.scrollBy({ left: delta, behavior: "smooth" });
  }, { passive: false });

  window.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") scroller.scrollBy({ left: window.innerWidth, behavior: "smooth" });
    if (event.key === "ArrowLeft") scroller.scrollBy({ left: -window.innerWidth, behavior: "smooth" });
  });
})();
