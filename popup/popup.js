const tabButtons = {
  seo: document.querySelector('[data-tab="seo"]'),
  analytics: document.querySelector('[data-tab="analytics"]'),
  opengraph: document.querySelector('[data-tab="opengraph"]'),
  event: document.querySelector('[data-tab="event"]'),
  cms: document.querySelector('[data-tab="cms"]'),
};
const panelMap = {
  seo: document.querySelector('[data-panel="seo"]'),
  analytics: document.querySelector('[data-panel="analytics"]'),
  opengraph: document.querySelector('[data-panel="opengraph"]'),
  event: document.querySelector('[data-panel="event"]'),
  cms: document.querySelector('[data-panel="cms"]'),
};
const statusElement = document.getElementById("status");
const cards = {
  title: document.getElementById("titleCard"),
  description: document.getElementById("descriptionCard"),
  robots: document.getElementById("robotsCard"),
  ogTitle: document.getElementById("ogTitleCard"),
  ogDescription: document.getElementById("ogDescriptionCard"),
  canonicals: document.getElementById("canonicalsCard"),
  headings: document.getElementById("headingsCard"),
  analytics: document.getElementById("gaCard"),
  events: document.getElementById("eventsCard"),
  cms: document.getElementById("cmsCard"),
};
const fieldConfigs = [
  {
    cardKey: "title",
    element: document.getElementById("title"),
    dataKey: "title",
    counter: document.getElementById("titleCount"),
    limit: 56,
    limitLabel: "/56",
  },
  {
    cardKey: "description",
    element: document.getElementById("description"),
    dataKey: "metaDescription",
    counter: document.getElementById("descriptionCount"),
    limit: 156,
    limitLabel: "/156",
  },
  {
    cardKey: "ogTitle",
    element: document.getElementById("ogTitle"),
    dataKey: "ogTitle",
  },
  {
    cardKey: "ogDescription",
    element: document.getElementById("ogDescription"),
    dataKey: "ogDescription",
  },
];
const canonicalsList = document.getElementById("canonicals");
const headingsList = document.getElementById("headings");
const robotsLink = document.getElementById("robotsLink");
const gaStatusElement = document.getElementById("gaStatus");
const cmsStatusElement = document.getElementById("cmsStatus");
const googleAdsEventsList = document.getElementById("googleAdsEvents");
const metaEventsList = document.getElementById("metaEvents");

const ANALYTICS_MAPPINGS = [
  {
    label: "Google Analytics 4",
    key: "usesGA4",
  },
  {
    label: "Piwik Pro",
    key: "usesPiwik",
  },
  {
    label: "Matomo",
    key: "usesMatomo",
  },
  {
    label: "Facebook Pixel",
    key: "usesFacebookPixel",
  },
];

const CMS_MAPPINGS = [
  {
    label: "SiteVision",
    key: "usesSiteVision",
  },
  {
    label: "WordPress",
    key: "usesWordPress",
  },
  {
    label: "Optimizely",
    key: "usesOptimizely",
  },
];

const activateTab = (tabName) => {
  Object.entries(tabButtons).forEach(([name, button]) => {
    if (!button) {
      return;
    }
    const isActive = name === tabName;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    button.setAttribute("tabindex", isActive ? "0" : "-1");
  });

  Object.entries(panelMap).forEach(([name, panel]) => {
    if (!panel) {
      return;
    }
    const isActive = name === tabName;
    panel.hidden = !isActive;
    panel.setAttribute("aria-hidden", String(!isActive));
  });
};

Object.entries(tabButtons).forEach(([name, button]) => {
  if (!button) {
    return;
  }
  button.addEventListener("click", () => activateTab(name));
});

activateTab("seo");

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
  statusElement.hidden = false;
};

const applyCardState = (cardKey, { isAlert = false, counter, link } = {}) => {
  const card = cards[cardKey];
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

  if (counter) {
    counter.classList.toggle("alert", isAlert);
  }

  if (link) {
    link.classList.toggle("alert", isAlert);
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

const renderEventSummary = (listElement, eventData) => {
  if (!listElement) {
    return false;
  }

  listElement.replaceChildren();
  const pageViews = Array.isArray(eventData?.pageViews) ? eventData.pageViews : [];
  const conversions = Array.isArray(eventData?.conversions) ? eventData.conversions : [];
  const hasEntries = pageViews.length > 0 || conversions.length > 0;

  if (!hasEntries) {
    const li = document.createElement("li");
    li.textContent = "No events detected.";
    listElement.appendChild(li);
    return false;
  }

  pageViews.forEach(() => {
    const li = document.createElement("li");
    li.textContent = "Pageview";
    listElement.appendChild(li);
  });

  conversions.forEach((name) => {
    const li = document.createElement("li");
    li.textContent = name ? `Conversion: ${name}` : "Conversion";
    listElement.appendChild(li);
  });

  return true;
};

const renderSeoData = (data) => {
  fieldConfigs.forEach(({ cardKey, element, dataKey, counter, limit, limitLabel }) => {
    const sourceValue = data?.[dataKey];
    const normalizedValue = typeof sourceValue === "string" ? sourceValue.trim() : sourceValue;
    const hasText = typeof normalizedValue === "string" && normalizedValue.length > 0;
    element.textContent = hasText ? normalizedValue : "N/A";

    let isAlert = !hasText;
    let isSuccess = false;
    const length = typeof normalizedValue === "string" ? normalizedValue.length : 0;
    if (counter) {
      counter.textContent = limitLabel ? `${length}${limitLabel}` : String(length);
      if (cardKey === "title") {
        if (length < 30) {
          isAlert = true;
        } else if (length <= 56) {
          isSuccess = true;
        } else {
          isAlert = true;
        }
      } else if (!length || (limit && length > limit)) {
        isAlert = true;
      } else if (cardKey === "description" && length > 30) {
        isSuccess = true;
      }
    }

    const shouldAlertCard = cardKey !== "title" && cardKey !== "description";
    applyCardState(cardKey, { isAlert: shouldAlertCard ? isAlert : false, counter: shouldAlertCard ? counter : undefined });

    if (counter) {
      counter.classList.toggle("alert", isAlert);
      counter.classList.toggle("success", isSuccess && !isAlert);
    }
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
  applyCardState("robots", {
    isAlert: robotsText === "N/A" || robotsHref === "#",
    link: robotsLink,
  });

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
  applyCardState("canonicals", { isAlert: !hasCanonicals });

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
  applyCardState("headings", { isAlert: !hasHeadings });

  const analyticsSignals = data?.analytics || {};
  const detectedAnalytics = ANALYTICS_MAPPINGS.filter(({ key }) => Boolean(analyticsSignals[key]));
  if (gaStatusElement) {
    if (detectedAnalytics.length) {
      const fragment = document.createDocumentFragment();
      detectedAnalytics.forEach(({ label }) => {
        const badge = document.createElement("span");
        badge.className = "badge-item";
        badge.textContent = label;
        fragment.appendChild(badge);
      });
      gaStatusElement.classList.add("badge-list");
      gaStatusElement.replaceChildren(fragment);
    } else {
      gaStatusElement.classList.remove("badge-list");
      gaStatusElement.textContent = "No known analytics platform detected.";
    }
  }

  applyCardState("analytics", { isAlert: detectedAnalytics.length === 0 });

  const cmsSignals = data?.cms || {};
  const detectedCms = CMS_MAPPINGS.filter(({ key }) => Boolean(cmsSignals[key]));
  if (cmsStatusElement) {
    if (detectedCms.length) {
      const fragment = document.createDocumentFragment();
      detectedCms.forEach(({ label }) => {
        const badge = document.createElement("span");
        badge.className = "badge-item";
        badge.textContent = label;
        fragment.appendChild(badge);
      });
      cmsStatusElement.classList.add("badge-list");
      cmsStatusElement.replaceChildren(fragment);
    } else {
      cmsStatusElement.classList.remove("badge-list");
      cmsStatusElement.textContent = "No CMS patterns detected.";
    }
  }

  applyCardState("cms", { isAlert: detectedCms.length === 0 });

  const eventSignals = data?.events || {};
  const hasGoogleAdsEvents = renderEventSummary(googleAdsEventsList, eventSignals.googleAds);
  const hasMetaEvents = renderEventSummary(metaEventsList, eventSignals.meta);
  const hasAnyEvent = hasGoogleAdsEvents || hasMetaEvents;
  applyCardState("events", { isAlert: !hasAnyEvent });
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
    statusElement.textContent = "";
    statusElement.hidden = true;
    activateTab("seo");
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
