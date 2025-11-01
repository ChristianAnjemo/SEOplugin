const tabButtons = {
  seo: document.querySelector('[data-tab="seo"]'),
  analytics: document.querySelector('[data-tab="analytics"]'),
  opengraph: document.querySelector('[data-tab="opengraph"]'),
  cms: document.querySelector('[data-tab="cms"]'),
};
const panelMap = {
  seo: document.querySelector('[data-panel="seo"]'),
  analytics: document.querySelector('[data-panel="analytics"]'),
  opengraph: document.querySelector('[data-panel="opengraph"]'),
  cms: document.querySelector('[data-panel="cms"]'),
};
const statusElement = document.getElementById("status");
const analyticsIndicator = document.getElementById("analyticsIndicator");
const themeToggleButton = document.getElementById("themeToggle");
const themeToggleIcon = themeToggleButton ? themeToggleButton.querySelector(".theme-icon") : null;
let currentTabId = null;
const cards = {
  title: document.getElementById("titleCard"),
  description: document.getElementById("descriptionCard"),
  robots: document.getElementById("robotsCard"),
  ogTitle: document.getElementById("ogTitleCard"),
  ogDescription: document.getElementById("ogDescriptionCard"),
  canonicals: document.getElementById("canonicalsCard"),
  hrefLang: document.getElementById("hrefLangCard"),
  links: document.getElementById("linksCard"),
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
    hideWhenEmpty: true,
  },
  {
    cardKey: "ogDescription",
    element: document.getElementById("ogDescription"),
    dataKey: "ogDescription",
    hideWhenEmpty: true,
  },
];
const canonicalsList = document.getElementById("canonicals");
const hrefLangList = document.getElementById("hrefLangList");
const headingsList = document.getElementById("headings");
const headingsSummary = document.getElementById("headingsSummary");
const headingsDetail = document.getElementById("headingsDetail");
const headingsToggle = document.getElementById("headingsToggle");
const structuredDataContainer = document.getElementById("structuredDataContainer");
const robotsLink = document.getElementById("robotsLink");
const linksTotal = document.getElementById("linksTotal");
const linksInternal = document.getElementById("linksInternal");
const linksExternal = document.getElementById("linksExternal");
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
    label: "Sitevision",
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

  if (tabName === "analytics" && analyticsIndicator) {
    analyticsIndicator.classList.remove("visible");
  }
};

Object.entries(tabButtons).forEach(([name, button]) => {
  if (!button) {
    return;
  }
  button.addEventListener("click", () => activateTab(name));
});

activateTab("seo");

const THEME_STORAGE_KEY = "metacat-theme";
const heroIcon = document.querySelector(".hero-icon");

const applyTheme = (theme) => {
  const isDark = theme === "dark";
  document.body.classList.toggle("dark-theme", isDark);
  if (heroIcon) {
    heroIcon.src = isDark
      ? "../assets/icons/spacecat128.png"
      : "../assets/icons/spacecat_sunglasses_128.png";
  }
  if (themeToggleButton) {
    themeToggleButton.setAttribute("aria-pressed", String(isDark));
  }
  if (themeToggleIcon) {
    themeToggleIcon.textContent = isDark ? "☀️" : "🌙";
  }
};

const getSystemThemePreference = () => {
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
};

const loadStoredTheme = () =>
  new Promise((resolve) => {
    const fallbackLocal = () => {
      try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === "dark" || stored === "light") {
          resolve(stored);
          return;
        }
      } catch (error) {
        // ignore localStorage errors
      }
      resolve(null);
    };

    if (!chrome.storage || !chrome.storage.local) {
      fallbackLocal();
      return;
    }

    try {
      chrome.storage.local.get([THEME_STORAGE_KEY], (result) => {
        if (chrome.runtime.lastError) {
          fallbackLocal();
          return;
        }
        const stored = result?.[THEME_STORAGE_KEY];
        if (stored === "dark" || stored === "light") {
          resolve(stored);
          return;
        }
        fallbackLocal();
      });
    } catch (error) {
      fallbackLocal();
    }
  });

let currentTheme = "light";

const persistTheme = (theme) => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    // ignore local storage errors
  }

  if (!chrome.storage || !chrome.storage.local) {
    return;
  }
  try {
    chrome.storage.local.set({ [THEME_STORAGE_KEY]: theme }, () => {});
  } catch (error) {
    // ignore storage write errors
  }
};

const initTheme = async () => {
  try {
    const stored = await loadStoredTheme();
    currentTheme = stored || getSystemThemePreference();
    applyTheme(currentTheme);
  } catch (error) {
    currentTheme = getSystemThemePreference();
    applyTheme(currentTheme);
  }

  if (themeToggleButton) {
    themeToggleButton.addEventListener("click", () => {
      currentTheme = currentTheme === "dark" ? "light" : "dark";
      applyTheme(currentTheme);
      persistTheme(currentTheme);
    });
  }
};

initTheme().catch(() => {
  currentTheme = getSystemThemePreference();
  applyTheme(currentTheme);
});

if (headingsToggle) {
  headingsToggle.addEventListener("click", () => {
    const isExpanded = headingsToggle.getAttribute("aria-expanded") === "true";
    const newState = !isExpanded;
    headingsToggle.setAttribute("aria-expanded", String(newState));
    if (headingsDetail) {
      headingsDetail.hidden = !newState;
    }
  });
}

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

const hideEventIndicatorOnPage = (tabId) =>
  new Promise((resolve) => {
    if (typeof tabId !== "number") {
      resolve({ success: false, error: "Invalid tab id." });
      return;
    }

    chrome.tabs.sendMessage(
      tabId,
      { action: "hideEventIndicator" },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { success: true, hidden: false });
      }
    );
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
    li.classList.add("event-entry", "event-pageview");
    li.textContent = "Pageview";
    listElement.appendChild(li);
  });

  conversions.forEach((name) => {
    const li = document.createElement("li");
    li.classList.add("event-entry", "event-conversion");
    li.textContent = name ? `Conversion: ${name}` : "Conversion";
    listElement.appendChild(li);
  });

  return true;
};

const renderSeoData = (data) => {
  console.debug("SEO plugin payload", data);
  fieldConfigs.forEach(({ cardKey, element, dataKey, counter, limit, limitLabel, hideWhenEmpty = false }) => {
    const sourceValue = data?.[dataKey];
    const normalizedValue = typeof sourceValue === "string" ? sourceValue.trim() : sourceValue;
    const hasText = typeof normalizedValue === "string" && normalizedValue.length > 0;

    const cardRef = cards[cardKey];
    if (cardRef && hideWhenEmpty) {
      const shouldHide = !hasText;
      cardRef.hidden = shouldHide;
      cardRef.setAttribute("aria-hidden", String(shouldHide));
      if (shouldHide) {
        cardRef.classList.remove("alert", "highlight");
        element.textContent = "";
        return;
      }
      cardRef.hidden = false;
      cardRef.setAttribute("aria-hidden", "false");
    }

    if (cardRef && !hideWhenEmpty) {
      cardRef.hidden = false;
      cardRef.setAttribute("aria-hidden", "false");
    }

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
  const hasRobots = robotsText !== "N/A" && robotsHref !== "#";
  robotsLink.classList.toggle("robots-found", hasRobots);
  applyCardState("robots", {
    isAlert: false,
    link: robotsLink,
  });

  const canonicalArray = Array.isArray(data?.canonicalLinks) ? data.canonicalLinks : [];
  let hasCanonicals = false;
  if (canonicalArray.length > 0) {
    hasCanonicals = renderList(canonicalsList, canonicalArray, (link) => {
      const fragment = document.createDocumentFragment();
      const rel = document.createElement("strong");
      rel.textContent = link.rel;
      const separator = document.createTextNode(": ");
      const href = document.createElement("span");
      href.textContent = link.href || "N/A";
      fragment.append(rel, separator, href);
      return fragment;
    });
    Array.from(canonicalsList.children).forEach((li, index) => {
      const current = canonicalArray[index];
      const hasHref = Boolean(current?.href);
      li.classList.toggle("canonical-found", hasHref);
    });
  } else {
    canonicalsList.replaceChildren();
    const li = document.createElement("li");
    li.textContent = "No canonical URLs detected.";
    canonicalsList.appendChild(li);
  }
  applyCardState("canonicals", { isAlert: false });

  if (hrefLangList) {
    const hrefLangArray = Array.isArray(data?.hrefLangLinks) ? data.hrefLangLinks : [];
    hrefLangList.replaceChildren();

    const pageLangValue = typeof data?.pageLang === "string" ? data.pageLang.trim() : "";
    const pageLangDisplay = pageLangValue || "";
    const pageLangItem = document.createElement("li");
    pageLangItem.className = "href-lang-item href-lang-page";
    pageLangItem.textContent = pageLangDisplay ? `Page lang: ${pageLangDisplay}` : "Page lang: not set.";
    hrefLangList.appendChild(pageLangItem);

    if (hrefLangArray.length > 0) {
      hrefLangArray.forEach((item) => {
        const li = document.createElement("li");
        li.className = "href-lang-item";
        const lang = document.createElement("strong");
        lang.textContent = (item.hreflang || "-").toLowerCase();
        const separator = document.createTextNode(": ");
        const href = document.createElement("span");
        href.textContent = item.href || "N/A";
        li.append(lang, separator, href);
        hrefLangList.appendChild(li);
      });
    } else {
      const li = document.createElement("li");
      li.className = "href-lang-item href-lang-empty";
      li.textContent = "No hreflang tags detected.";
      hrefLangList.appendChild(li);
    }
  }

  applyCardState("hrefLang", { isAlert: false });

  if (structuredDataContainer) {
    structuredDataContainer.replaceChildren();
    const structuredBlocks = Array.isArray(data?.structuredDataRaw) ? data.structuredDataRaw : [];

    if (!structuredBlocks.length) {
      const emptyMessage = document.createElement("p");
      emptyMessage.textContent = "No structured data detected.";
      structuredDataContainer.appendChild(emptyMessage);
    } else {
      structuredBlocks.forEach((block, index) => {
        const details = document.createElement("details");
        const summary = document.createElement("summary");
        const pre = document.createElement("pre");

        let displayType = "Unknown";
        let summaryDescription = "";
        let summaryUrl = "";
        let target = block;
        try {
          const parsed = JSON.parse(block);
          const type = parsed["@type"] || parsed["@graph"]?.[0]?.["@type"];
          if (Array.isArray(type)) {
            displayType = type.join(", ");
          } else if (typeof type === "string") {
            displayType = type;
          }

          const descriptionSource =
            parsed.headline ||
            parsed.name ||
            parsed["@graph"]?.find((entry) => entry?.headline || entry?.name)?.headline ||
            parsed["@graph"]?.find((entry) => entry?.headline || entry?.name)?.name ||
            parsed.description;

          if (typeof descriptionSource === "string" && descriptionSource.trim()) {
            summaryDescription = descriptionSource.trim();
          }

          const urlSource =
            parsed.url ||
            parsed.mainEntityOfPage ||
            parsed["@graph"]?.find((entry) => entry?.url)?.url;

          if (typeof urlSource === "string" && urlSource.trim()) {
            summaryUrl = urlSource.trim();
          }

          target = JSON.stringify(parsed, null, 2);
        } catch (error) {
          try {
            const parsedFallback = JSON.parse(block.replace(/^"|"$/g, ""));
            const typeFallback = parsedFallback["@type"] || parsedFallback["@graph"]?.[0]?.["@type"];
            if (Array.isArray(typeFallback)) {
              displayType = typeFallback.join(", ");
            } else if (typeof typeFallback === "string") {
              displayType = typeFallback;
            }

            const descriptionFallback =
              parsedFallback.headline ||
              parsedFallback.name ||
              parsedFallback["@graph"]?.find((entry) => entry?.headline || entry?.name)?.headline ||
              parsedFallback["@graph"]?.find((entry) => entry?.headline || entry?.name)?.name ||
              parsedFallback.description;
            if (typeof descriptionFallback === "string" && descriptionFallback.trim()) {
              summaryDescription = descriptionFallback.trim();
            }

            const urlFallback =
              parsedFallback.url ||
              parsedFallback.mainEntityOfPage ||
              parsedFallback["@graph"]?.find((entry) => entry?.url)?.url;
            if (typeof urlFallback === "string" && urlFallback.trim()) {
              summaryUrl = urlFallback.trim();
            }

            target = JSON.stringify(parsedFallback, null, 2);
          } catch (innerError) {
            target = block;
          }
        }

        summary.textContent = summaryDescription
          ? `Block ${index + 1} – ${displayType} (${summaryDescription})`
          : `Block ${index + 1} – ${displayType}`;
        details.appendChild(summary);

        if (summaryDescription || summaryUrl) {
          const quickSummary = document.createElement("ul");
          quickSummary.className = "structured-summary";
          if (summaryDescription) {
            const li = document.createElement("li");
            li.textContent = `Description: ${summaryDescription}`;
            quickSummary.appendChild(li);
          }
          if (summaryUrl) {
            const li = document.createElement("li");
            li.textContent = `URL: ${summaryUrl}`;
            quickSummary.appendChild(li);
          }
          details.appendChild(quickSummary);
        }

        pre.textContent = target;
        details.appendChild(pre);
        structuredDataContainer.appendChild(details);
      });
    }
  }

  const anchorSummary = data?.anchors || { total: 0, internal: 0, external: 0 };
  const linksCardAlert = anchorSummary.total === 0;
  applyCardState("links", { isAlert: linksCardAlert, counter: linksTotal });

  if (linksTotal) {
    linksTotal.textContent = String(anchorSummary.total);
    if (!linksCardAlert) {
      linksTotal.classList.toggle("alert", anchorSummary.total > 300);
    } else {
      linksTotal.classList.add("alert");
    }
  }
  if (linksInternal) {
    linksInternal.textContent = `Internal: ${anchorSummary.internal}`;
    linksInternal.classList.toggle("alert", anchorSummary.internal > 150);
  }
  if (linksExternal) {
    linksExternal.textContent = `External: ${anchorSummary.external}`;
    linksExternal.classList.toggle("alert", anchorSummary.external > 100);
  }

  const headingsArray = Array.isArray(data?.headings) ? data.headings : [];
  if (headingsList) {
    renderList(headingsList, headingsArray, (heading) => {
      const fragment = document.createDocumentFragment();
      const tag = document.createElement("strong");
      tag.textContent = heading.tag.toUpperCase();
      const separator = document.createTextNode(": ");
      const text = document.createElement("span");
      text.textContent = heading.text || "N/A";
      fragment.append(tag, separator, text);
      return fragment;
    });
  }

  if (headingsSummary) {
    headingsSummary.replaceChildren();
    if (headingsArray.length === 0) {
      const span = document.createElement("span");
      span.textContent = "No headings detected.";
      headingsSummary.appendChild(span);
    } else {
      const counts = headingsArray.reduce((acc, { tag }) => {
        const key = (tag || "h").toLowerCase();
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      Object.keys(counts)
        .sort()
        .forEach((key) => {
          const span = document.createElement("span");
          span.textContent = `${key.toUpperCase()}: ${counts[key]}`;
          headingsSummary.appendChild(span);
        });
    }
  }

  applyCardState("headings", { isAlert: headingsArray.length === 0 });

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

  applyCardState("cms", { isAlert: false });

  const eventSignals = data?.events || {};
  const hasGoogleAdsEvents = renderEventSummary(googleAdsEventsList, eventSignals.googleAds);
  const hasMetaEvents = renderEventSummary(metaEventsList, eventSignals.meta);
  const hasAnyEvent = hasGoogleAdsEvents || hasMetaEvents;
  applyCardState("events", { isAlert: false });

  const googleSection = document.querySelector("#eventsCard .event-groups > div:nth-child(1)");
  const metaSection = document.querySelector("#eventsCard .event-groups > div:nth-child(2)");
  if (googleSection) {
    googleSection.style.display = hasGoogleAdsEvents ? "" : "none";
  }
  if (metaSection) {
    metaSection.style.display = hasMetaEvents ? "" : "none";
  }

  const eventsCard = document.getElementById("eventsCard");
  if (eventsCard) {
    const header = eventsCard.querySelector(".card-header");
    let helper = eventsCard.querySelector(".events-helper");
    if (!helper) {
      helper = document.createElement("p");
      helper.className = "events-helper";
      helper.textContent = "Events from Meta and Google Ads will show up here.";
      if (header?.nextSibling) {
        eventsCard.insertBefore(helper, header.nextSibling);
      } else {
        eventsCard.appendChild(helper);
      }
    }
    helper.hidden = hasAnyEvent;
  }

  const googleConversionCount = Array.isArray(eventSignals?.googleAds?.conversions)
    ? eventSignals.googleAds.conversions.length
    : 0;
  const metaConversionCount = Array.isArray(eventSignals?.meta?.conversions)
    ? eventSignals.meta.conversions.length
    : 0;
  if (analyticsIndicator) {
    analyticsIndicator.classList.toggle("visible", googleConversionCount + metaConversionCount > 0);
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

    currentTabId = tab.id;

    const response = await requestSeoData(tab.id);
    if (!response?.success) {
      throw new Error(response?.error || "Unknown error while collecting SEO data.");
    }

    renderSeoData(response.data);
    await hideEventIndicatorOnPage(tab.id);
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

chrome.runtime.onMessage.addListener((message) => {
  if (!message || typeof message.action !== "string") {
    return;
  }

  if (message.action === "conversionDetected") {
    if (typeof message.tabId === "number" && message.tabId !== currentTabId) {
      return;
    }

    if (analyticsIndicator) {
      analyticsIndicator.classList.add("visible");
    }
    return;
  }

  if (message.action === "focusAnalyticsTab") {
    activateTab("analytics");
  }
});
