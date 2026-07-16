(function () {
  const modal = document.getElementById("commercialModal");
  const closeBtn = document.getElementById("commercialClose");
  const continueLink = document.getElementById("continueCommercial");
  const params = new URLSearchParams(location.search);
  if (params.get("launchSaas") === "1") {
    document.body.classList.add("launcher-mode");
    setTimeout(() => {
      location.href = "./workbench/?from=launcher";
    }, 2000);
  }

  function openModal(targetHref) {
    if (!modal) return;
    if (continueLink && targetHref) continueLink.href = targetHref;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    closeBtn?.focus();
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  }

  document.querySelectorAll("[data-local-saas]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      openModal(link.href);
    });
  });

  closeBtn?.addEventListener("click", closeModal);
  modal?.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });
})();

