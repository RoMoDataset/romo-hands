const header = document.querySelector("#site-header");
const topButton = document.querySelector("#to-top");
const sections = [...document.querySelectorAll("main section[id]")];
const navLinks = [...document.querySelectorAll(".nav-links a")];
const workTabs = [...document.querySelectorAll("[data-work-tab]")];
const workPanels = [...document.querySelectorAll("[data-work-panel]")];

function resizeVisiblePlots(panel) {
  if (!window.Plotly) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      panel.querySelectorAll(".js-plotly-plot").forEach((plot) => {
        window.Plotly.Plots.resize(plot);
      });
    });
  });
}

function activateWorkPanel(panelId, updateUrl = false) {
  const selectedPanel = workPanels.find(
    (panel) => panel.dataset.workPanel === panelId,
  );
  if (!selectedPanel) return false;

  workPanels.forEach((panel) => {
    panel.hidden = panel !== selectedPanel;
  });
  workTabs.forEach((tab) => {
    const isActive = tab.dataset.workTab === panelId;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
  });

  if (updateUrl) {
    history.replaceState(null, "", `#${panelId}`);
  }
  resizeVisiblePlots(selectedPanel);
  updateChrome();
  return true;
}

workTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => {
    activateWorkPanel(tab.dataset.workTab, true);
  });
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    let nextIndex = index;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + workTabs.length) % workTabs.length;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % workTabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = workTabs.length - 1;
    workTabs[nextIndex].focus();
    activateWorkPanel(workTabs[nextIndex].dataset.workTab, true);
  });
});

const initialPanel = window.location.hash.slice(1);
if (!activateWorkPanel(initialPanel)) activateWorkPanel("dataset");

window.addEventListener("hashchange", () => {
  activateWorkPanel(window.location.hash.slice(1));
});

function updateChrome() {
  const y = window.scrollY;
  header?.classList.toggle("scrolled", y > 18);
  topButton?.classList.toggle("visible", y > 700);

  const active = [...sections]
    .filter((section) => !section.hidden)
    .reverse()
    .find((section) => section.getBoundingClientRect().top <= 120);
  const activeHash = active?.classList.contains("work-panel")
    ? "#explore"
    : active
      ? `#${active.id}`
      : "";

  navLinks.forEach((link) => {
    link.classList.toggle("active", Boolean(activeHash) && link.hash === activeHash);
  });
}

window.addEventListener("scroll", updateChrome, { passive: true });
window.addEventListener("load", updateChrome);

topButton?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

const revealObserver = new IntersectionObserver(
  (entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("in");
      observer.unobserve(entry.target);
    });
  },
  { threshold: 0.12, rootMargin: "0px 0px -48px" },
);

document.querySelectorAll(".reveal").forEach((element) => {
  revealObserver.observe(element);
});

function formatCount(value) {
  if (!Number.isInteger(value)) return value.toFixed(1);
  return new Intl.NumberFormat("en-US").format(value);
}

const countObserver = new IntersectionObserver(
  (entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;

      const element = entry.target;
      const target = Number(element.dataset.count);
      const suffix = element.dataset.suffix ?? "";
      const start = performance.now();
      const duration = 1100;

      function frame(now) {
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = target * eased;
        element.textContent = `${formatCount(
          Number.isInteger(target) ? Math.round(current) : current,
        )}${suffix}`;

        if (progress < 1) requestAnimationFrame(frame);
      }

      requestAnimationFrame(frame);
      observer.unobserve(element);
    });
  },
  { threshold: 0.6 },
);

document.querySelectorAll("[data-count]").forEach((element) => {
  countObserver.observe(element);
});

document.querySelectorAll("[data-copy-target]").forEach((button) => {
  button.addEventListener("click", async () => {
    const source = document.getElementById(button.dataset.copyTarget);
    if (!source) return;
    await navigator.clipboard.writeText(source.textContent.trim());
    button.textContent = "Copied";
    setTimeout(() => {
      button.textContent = "Copy";
    }, 1600);
  });
});
