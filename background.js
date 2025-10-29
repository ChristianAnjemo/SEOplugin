const tabEventStore = new Map();

const EVENT_URL_PATTERNS = [
  "*://*.googleads.g.doubleclick.net/*",
  "*://*.googleadservices.com/*",
  "*://*.facebook.com/tr*",
];

const createEmptyEventState = () => ({
  googleAds: {
    pageViews: new Set(),
    conversions: new Set(),
  },
  meta: {
    pageViews: new Set(),
    conversions: new Set(),
  },
});

const getEventState = (tabId) => {
  if (!tabEventStore.has(tabId)) {
    tabEventStore.set(tabId, createEmptyEventState());
  }

  return tabEventStore.get(tabId);
};

const serializeEventState = (tabId) => {
  const state = tabEventStore.get(tabId);
  const toArray = (value) => (value instanceof Set ? Array.from(value) : []);

  if (!state) {
    return {
      googleAds: { pageViews: [], conversions: [] },
      meta: { pageViews: [], conversions: [] },
    };
  }

  return {
    googleAds: {
      pageViews: toArray(state.googleAds.pageViews),
      conversions: toArray(state.googleAds.conversions),
    },
    meta: {
      pageViews: toArray(state.meta.pageViews),
      conversions: toArray(state.meta.conversions),
    },
  };
};

const resetTabEvents = (tabId) => {
  tabEventStore.delete(tabId);
};

const normalizeString = (value) => (typeof value === "string" ? value.trim() : "");

const handleNetworkEvent = (details) => {
  const { tabId, url } = details;
  if (tabId < 0 || !url) {
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (error) {
    return;
  }

  const host = parsedUrl.hostname.toLowerCase();
  const path = parsedUrl.pathname.toLowerCase();
  const params = parsedUrl.searchParams;

  const state = getEventState(tabId);

  if (host.includes("googleads.g.doubleclick.net") || host.includes("googleadservices.com")) {
    const rawEventName =
      params.get("ev") ||
      params.get("event") ||
      params.get("action") ||
      params.get("cmd") ||
      params.get("etype") ||
      "";
    const eventName = normalizeString(rawEventName).toLowerCase();
    const label =
      normalizeString(params.get("conversion_label")) ||
      normalizeString(params.get("label")) ||
      normalizeString(params.get("conversion_action")) ||
      normalizeString(params.get("conversion_id")) ||
      normalizeString(params.get("utm_campaign")) ||
      normalizeString(params.get("dl")) ||
      normalizeString(params.get("gclid")) ||
      normalizeString(parsedUrl.pathname.split("/").filter(Boolean).pop());

    const isConversionPath = path.includes("/pagead/conversion/") || path.includes("/pagead/1p-conversion/");

    const isExplicitConversion =
      isConversionPath ||
      path.includes("/conversion/") ||
      params.has("conversion_label") ||
      params.has("conversion_id") ||
      params.get("is_conversion") === "1" ||
      params.get("data")?.includes("conversion") ||
      eventName === "conversion";

    const isPageView =
      !isExplicitConversion &&
      (eventName === "pageview" ||
        eventName === "page_view" ||
        path.includes("viewthroughconversion") ||
        params.get("ptype") === "pageview" ||
        params.get("npa") === "0");

    if (isPageView) {
      state.googleAds.pageViews.add("Pageview");
    } else if (isExplicitConversion || eventName || label) {
      const entryLabel = isConversionPath
        ? label || normalizeString(params.get("value")) || "Conversion"
        : label || rawEventName || "Conversion";
      state.googleAds.conversions.add(entryLabel);
    }

    return;
  }

  if (host.includes("facebook.com") && path.startsWith("/tr")) {
    const rawEventName = normalizeString(params.get("ev") || params.get("event"));
    const eventName = rawEventName.toLowerCase();

    if (!eventName || eventName === "pageview" || eventName === "page_view") {
      state.meta.pageViews.add("Pageview");
      return;
    }

    const conversionName =
      normalizeString(params.get("cd[conversionname]")) ||
      normalizeString(params.get("cd[content_name]")) ||
      rawEventName;

    state.meta.conversions.add(conversionName || "Conversion");
  }
};

chrome.webRequest.onBeforeRequest.addListener(handleNetworkEvent, { urls: EVENT_URL_PATTERNS });

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    resetTabEvents(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  resetTabEvents(tabId);
});

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setOptions) {
    chrome.sidePanel.setOptions({ path: "panel.html", enabled: true }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.action !== "collectSEOData" || typeof request.tabId !== "number") {
    return;
  }

  chrome.scripting.executeScript(
    {
      target: { tabId: request.tabId, allFrames: false },
      func: () => {
        const getMetaContent = (selector) => {
          const node = document.querySelector(selector);
          if (!node) {
            return null;
          }

          return node.getAttribute("content") || node.textContent || null;
        };

        const collectHeadings = () =>
          Array.from(document.querySelectorAll("h1, h2")).map((heading) => ({
            tag: heading.tagName.toLowerCase(),
            text: heading.textContent.trim(),
          }));

        const collectLinks = () =>
          Array.from(document.querySelectorAll("link[rel='canonical']")).map((link) => ({
            rel: link.getAttribute("rel"),
            href: link.getAttribute("href"),
          }));

        const collectAnalyticsSignals = () => {
          const signals = {
            usesGA4: false,
            usesPiwik: false,
            usesMatomo: false,
            usesFacebookPixel: false,
          };

          if (typeof window._mtm !== "undefined") {
            signals.usesMatomo = true;
          }

          if (typeof window.fbq === "function") {
            signals.usesFacebookPixel = true;
          }

          const head = document.head;
          const headSource = head ? head.innerHTML.toLowerCase() : "";

          Array.from(document.querySelectorAll("head script")).forEach((script) => {
            const source = (script.src || script.textContent || "").toLowerCase();

            if (!signals.usesGA4 && source.includes("googletagmanager")) {
              signals.usesGA4 = true;
            }

            if (!signals.usesPiwik && source.includes("piwik")) {
              signals.usesPiwik = true;
            }

            if (!signals.usesMatomo && (source.includes("matomo") || source.includes("window._mtm"))) {
              signals.usesMatomo = true;
            }

            if (!signals.usesFacebookPixel && source.includes("connect.facebook.net")) {
              signals.usesFacebookPixel = true;
            }
          });

          if (!signals.usesPiwik && headSource.includes("piwik")) {
            signals.usesPiwik = true;
          }

          if (!signals.usesMatomo && (headSource.includes("matomo") || headSource.includes("window._mtm"))) {
            signals.usesMatomo = true;
          }

          if (!signals.usesFacebookPixel && headSource.includes("connect.facebook.net")) {
            signals.usesFacebookPixel = true;
          }

          return signals;
        };

        const detectCmsSignals = () => {
          const cms = {
            usesSiteVision: false,
            usesWordPress: false,
            usesOptimizely: false,
          };

          const cookieString = document.cookie || "";
          if (!cms.usesSiteVision && /(^|;\s*)sitevisionltm=/i.test(cookieString)) {
            cms.usesSiteVision = true;
          }
          if (!cms.usesWordPress && /wordpress|wp-content/i.test(cookieString)) {
            cms.usesWordPress = true;
          }
          if (!cms.usesOptimizely && /optimizely|optly|epi-/i.test(cookieString)) {
            cms.usesOptimizely = true;
          }

          const htmlSource = [
            document.documentElement ? document.documentElement.innerHTML : "",
            document.head ? document.head.innerHTML : "",
          ]
            .join(" ")
            .toLowerCase();

          if (!cms.usesWordPress && (htmlSource.includes("wp-content") || htmlSource.includes("wordpress"))) {
            cms.usesWordPress = true;
          }

          if (
            !cms.usesOptimizely &&
            (htmlSource.includes("optimizely") || htmlSource.includes("episerver") || htmlSource.includes("epi-"))
          ) {
            cms.usesOptimizely = true;
          }

          if (!cms.usesWordPress) {
            Array.from(document.querySelectorAll("script")).some((node) => {
              const source = (node.src || node.textContent || "").toLowerCase();
              if (source.includes("wp-content") || source.includes("wordpress")) {
                cms.usesWordPress = true;
                return true;
              }
              return false;
            });
          }

          if (!cms.usesOptimizely) {
            Array.from(document.querySelectorAll("script")).some((node) => {
              const source = (node.src || node.textContent || "").toLowerCase();
              if (source.includes("optimizely") || source.includes("episerver") || source.includes("epi-")) {
                cms.usesOptimizely = true;
                return true;
              }
              return false;
            });
          }

          return cms;
        };

        return {
          url: document.location.href,
          title: document.title || null,
          metaDescription: getMetaContent("meta[name='description']"),
          robots: getMetaContent("meta[name='robots']"),
          ogTitle: getMetaContent("meta[property='og:title']"),
          ogDescription: getMetaContent("meta[property='og:description']"),
          canonicalLinks: collectLinks(),
          headings: collectHeadings(),
          analytics: collectAnalyticsSignals(),
          cms: detectCmsSignals(),
        };
      },
    },
    (results) => {
      if (chrome.runtime.lastError) {
        sendResponse({
          success: false,
          error: chrome.runtime.lastError.message,
        });
        return;
      }

      const [scriptResult] = results || [];
      const payload = scriptResult?.result || {};
      const events = serializeEventState(request.tabId);

      sendResponse({
        success: true,
        data: {
          ...payload,
          events,
        },
      });
    }
  );

  return true;
});
