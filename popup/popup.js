const tabButtons = document.querySelectorAll(".tab");
const tabPanels = document.querySelectorAll(".tab-panel");
const statusElement = document.getElementById("status");
const fields = {
  title: document.getElementById("title"),
  description: document.getElementById("description"),
  ogTitle: document.getElementById("ogTitle"),
  ogDescription: document.getElementById("ogDescription"),
};
const counters = {
  title: document.getElementById("titleCount"),
  description: document.getElementById("descriptionCount"),
};
const cards = {
  title: document.getElementById("titleCard"),
  description: document.getElementById("descriptionCard"),
  robots: document.getElementById("robotsCard"),
  ogTitle: document.getElementById("ogTitleCard"),
  ogDescription: document.getElementById("ogDescriptionCard"),
  canonicals: document.getElementById("canonicalsCard"),
  headings: document.getElementById("headingsCard"),
};
const canonicalsList = document.getElementById("canonicals");
const headingsList = document.getElementById("headings");
const robotsLink = document.getElementById("robotsLink");
const gaStatusElement = document.getElementById("gaStatus");
const gaCard = document.getElementById("gaCard");

let hasData = false;

const activateTab = (tabName) => {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === tabName;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  tabPanels.forEach((panel) => {
    const isActive = panel.dataset.panel === tabName;
    panel.hidden = !hasData || !isActive;
  });
};

tabButtons.forEach((button) => {
  button.addEventListener("click", () => activateTab(button.dataset.tab));
});

activateTab("overview");

const queryActiveTab = () =>
  new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(tabs[0]);
    });
  });

const requestSeoData = (tabId) =>
  new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        action: "collectSEOData",
        tabId,
      },
      (response) => {
        resolve(response || { success: false, error: "No response from background script." });
      }
    );
  });

const updateStatus = (message, { muted = false } = {}) => {
  statusElement.textContent = message;
  statusElement.classList.toggle("muted", muted);
};

const setCardAlert = (key, isAlert) => {
  const card = cards[key];
  if (!card) {
    return;
  }

  if (isAlert) {
    card.classList.add("alert");
    if (card.dataset.accent === "true") {
      card.classList.remove("highlight");
    }
  } else {
    card.classList.remove("alert");
    if (card.dataset.accent === "true") {
      card.classList.add("highlight");
    }
  }

  if (counters[key]) {
    counters[key].classList.toggle("alert", isAlert);
  }

  if (key === "robots") {
    robotsLink.classList.toggle("alert", isAlert);
  }
};

const renderList = (listElement, items, buildItem) => {
  listElement.replaceChildren();
  if (!items?.length) {
    const li = document.createElement("li");
    li.textContent = "No data found.";
    listElement.appendChild(li);
    return false;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    li.appendChild(buildItem(item));
    listElement.appendChild(li);
  });

  return true;
};

const renderSeoData = (data) => {
  Object.entries(fields).forEach(([key, element]) => {
    const rawValue = typeof data?.[key] === "string" ? data[key].trim() : data?.[key];
    const displayValue = rawValue || "N/A";
    element.textContent = displayValue;

    if (counters[key]) {
      counters[key].textContent = typeof rawValue === "string" && rawValue.length ? rawValue.length : 0;
    }

    let isAlert = !displayValue || displayValue === "N/A";

    if (key === "title" && typeof rawValue === "string") {
      const length = rawValue.length;
      counters[key].textContent = length;
      isAlert = !length || length > 56;
    }

    if (key === "description" && typeof rawValue === "string") {
      const length = rawValue.length;
      counters[key].textContent = length;
      isAlert = !length || length > 156;
    }

    if (displayValue === "N/A") {
      isAlert = true;
    }

    setCardAlert(key, isAlert);
  });

  let robotsHref = "#";
  let robotsText = "N/A";

  try {
    if (data?.url) {
      const { origin } = new URL(data.url);
      robotsHref = `${origin}/robots.txt`;
      robotsText = robotsHref;
    }
  } catch (error) {
    console.warn("Failed to resolve robots.txt URL", error);
  }

  robotsLink.href = robotsHref;
  robotsLink.textContent = robotsText;
  setCardAlert("robots", robotsText === "N/A" || robotsHref === "#");

  const hasCanonicals = renderList(canonicalsList, data?.canonicalLinks, (link) => {
    const fragment = document.createDocumentFragment();
    const rel = document.createElement("strong");
    rel.textContent = link.rel;
    const separator = document.createTextNode(": ");
    const href = document.createElement("span");
    href.textContent = link.href || "N/A";
    fragment.append(rel, separator, href);
    return fragment;
  });
  setCardAlert("canonicals", !hasCanonicals);

  const hasHeadings = renderList(headingsList, data?.headings, (heading) => {
    const fragment = document.createDocumentFragment();
    const tag = document.createElement("strong");
    tag.textContent = heading.tag.toUpperCase();
    const separator = document.createTextNode(": ");
    const text = document.createElement("span");
    text.textContent = heading.text || "N/A";
    fragment.append(tag, separator, text);
    return fragment;
  });
  setCardAlert("headings", !hasHeadings);

  const usesGa4 = Boolean(data?.analytics?.usesGA4);
  gaStatusElement.textContent = usesGa4
    ? "Google Analytics 4 detected on this page."
    : "Google Analytics 4 was not detected.";
  if (gaCard) {
    gaCard.classList.remove("alert");
    if (usesGa4) {
      gaCard.classList.add("highlight");
    } else {
      gaCard.classList.remove("highlight");
    }
  }
};

const handleFetch = async () => {
  updateStatus("Collecting SEO data from the active tab...", { muted: false });

  try {
    const tab = await queryActiveTab();
    if (!tab?.id) {
      updateStatus("Unable to determine the active tab.", { muted: false });
      return;
    }

    const response = await requestSeoData(tab.id);
    if (!response?.success) {
      throw new Error(response?.error || "Unknown error while collecting SEO data.");
    }

    renderSeoData(response.data);
    updateStatus("SEO data fetched successfully.", { muted: true });
    hasData = true;
    activateTab("overview");
  } catch (error) {
    console.error(error);
    updateStatus(error.message || "Something went wrong while collecting SEO data.", {
      muted: false,
    });
  }
};

handleFetch().catch((error) => {
  console.error("Initial fetch failed", error);
});
