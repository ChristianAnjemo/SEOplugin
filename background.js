const tabEventStore = new Map();
const tabOriginMap = new Map();

const EVENT_URL_PATTERNS = [
  "*://*.googleads.g.doubleclick.net/*",
  "*://*.googleadservices.com/*",
  "*://*.googlesyndication.com/*",
  "*://*.google.com/ccm/collect*",
  "*://*.google.com/pagead/*",
  "*://*.facebook.com/tr*",
];

const normalizeString = (value) => (typeof value === "string" ? value.trim() : "");

const pageProbeScript = async (options = {}) => {
  const mode = options.mode === "cms" ? "cms" : "full";
  const getMetaContent = (selector) => {
    const node = document.querySelector(selector);
    if (!node) {
      return null;
    }

    return node.getAttribute("content") || node.textContent || null;
  };

  const collectHeadings = () =>
    Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((heading) => ({
      tag: heading.tagName.toLowerCase(),
      text: heading.textContent.trim(),
    }));

  const collectLinks = () =>
    Array.from(document.querySelectorAll("link[rel='canonical']")).map((link) => ({
      rel: link.getAttribute("rel"),
      href: link.getAttribute("href"),
    }));

  const collectHrefLang = () =>
    Array.from(document.querySelectorAll("link[rel='alternate'][hreflang]")).map((link) => ({
      hreflang: link.getAttribute("hreflang") || "",
      href: link.getAttribute("href") || "",
    }));

  const collectStructuredData = () =>
    Array.from(document.querySelectorAll('script[type*="ld+json" i]'))
      .map((script) => {
        const inlineContent = script.textContent?.trim();
        if (inlineContent) {
          return inlineContent;
        }

        const src = script.getAttribute("src");
        if (src) {
          return `{"_metacat_note": "External structured data referenced at ${src}"}`;
        }

        return "";
      })
      .filter(Boolean);

  const collectAnchorSummary = () => {
    const anchors = Array.from(document.querySelectorAll("a"));
    const location = document.location;
    let internal = 0;
    let external = 0;

    anchors.forEach((anchor) => {
      const rawHref = anchor.getAttribute("href") || "";
      const href = rawHref.trim();

      if (!href || href.startsWith("#")) {
        internal += 1;
        return;
      }

      if (href.startsWith("/") || href.startsWith("./") || href.startsWith("../")) {
        internal += 1;
        return;
      }

      try {
        const url = new URL(href, location.origin);
        if (url.origin === location.origin) {
          internal += 1;
        } else {
          external += 1;
        }
      } catch (error) {
        external += 1;
      }
    });

    return {
      total: anchors.length,
      internal,
      external,
    };
  };

        const scanAnalyticsSignals = ({ scope } = { scope: "all" }) => {
          const signals = {
            usesGA4: false,
            usesPiwik: false,
            usesMatomo: false,
            usesFacebookPixel: false,
            usesHotjar: false,
          };

          if (typeof window._mtm !== "undefined") {
            signals.usesMatomo = true;
          }

          if (typeof window.fbq === "function") {
            signals.usesFacebookPixel = true;
          }

          const headSource = document.head ? document.head.innerHTML.toLowerCase() : "";
          const scriptSelector = scope === "head" ? "head script" : "script";
          const scriptNodes = Array.from(document.querySelectorAll(scriptSelector));

          scriptNodes.some((script) => {
            const rawSrc = script.getAttribute("src") || "";
            const dataSrc = script.getAttribute("data-src") || "";
            const sourceParts = [script.src || "", rawSrc, dataSrc, script.textContent || ""];
            const source = sourceParts.join(" ").toLowerCase();

            if (!signals.usesGA4 && source.includes("googletagmanager")) {
              signals.usesGA4 = true;
            }

            if (!signals.usesPiwik && source.includes("piwik")) {
              signals.usesPiwik = true;
            }

            if (!signals.usesMatomo && (source.includes("matomo") || source.includes("window._mtm"))) {
              signals.usesMatomo = true;
            }

            if (
              !signals.usesFacebookPixel &&
              (source.includes("connect.facebook.net") || source.includes("fbq(") || source.includes("facebook.com/tr"))
            ) {
              signals.usesFacebookPixel = true;
            }

            if (
              !signals.usesHotjar &&
              (source.includes("hotjar.com") ||
                source.includes("hotjar-") ||
                source.includes("static.hotjar") ||
                source.includes("hotjar.js"))
            ) {
              signals.usesHotjar = true;
            }

            return (
              signals.usesGA4 &&
              signals.usesPiwik &&
              signals.usesMatomo &&
              signals.usesFacebookPixel &&
              signals.usesHotjar
            );
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

          if (
            !signals.usesHotjar &&
            (typeof window.hj === "function" ||
              typeof window._hjSettings !== "undefined" ||
              headSource.includes("hotjar.com"))
          ) {
            signals.usesHotjar = true;
          }

          return signals;
        };

        const mergeAnalyticsSignals = (base, next) => {
          if (!next) {
            return base;
          }

          return {
            usesGA4: base.usesGA4 || Boolean(next.usesGA4),
            usesPiwik: base.usesPiwik || Boolean(next.usesPiwik),
            usesMatomo: base.usesMatomo || Boolean(next.usesMatomo),
            usesFacebookPixel: base.usesFacebookPixel || Boolean(next.usesFacebookPixel),
            usesHotjar: base.usesHotjar || Boolean(next.usesHotjar),
          };
        };

  const waitFor = (ms) =>
    new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });

  const waitForDocumentComplete = () =>
    new Promise((resolve) => {
      if (document.readyState === "complete") {
        resolve();
        return;
      }

      let settled = false;
      let fallbackId = null;

      const finalize = () => {
        if (settled) {
          return;
        }
        settled = true;
        if (fallbackId !== null) {
          window.clearTimeout(fallbackId);
          fallbackId = null;
        }
        document.removeEventListener("readystatechange", handleReadyStateChange);
        window.removeEventListener("load", handleLoad);
        resolve();
      };

      const handleReadyStateChange = () => {
        if (document.readyState === "complete") {
          finalize();
        }
      };

      const handleLoad = () => {
        finalize();
      };

      document.addEventListener("readystatechange", handleReadyStateChange);
      window.addEventListener("load", handleLoad, { once: true });
      fallbackId = window.setTimeout(finalize, 800);
    });

  const collectAnalyticsSignals = async () => {
    let signals = scanAnalyticsSignals({ scope: "head" });

    const isMissingSignals = () =>
      !signals.usesGA4 ||
      !signals.usesPiwik ||
      !signals.usesMatomo ||
      !signals.usesFacebookPixel ||
      !signals.usesHotjar;

    if (isMissingSignals()) {
      signals = mergeAnalyticsSignals(signals, scanAnalyticsSignals({ scope: "all" }));
    }

    if (isMissingSignals() && document.readyState !== "complete") {
      await waitForDocumentComplete();
      signals = mergeAnalyticsSignals(signals, scanAnalyticsSignals({ scope: "all" }));
    }

    if (isMissingSignals()) {
      await waitFor(200);
      signals = mergeAnalyticsSignals(signals, scanAnalyticsSignals({ scope: "all" }));
    }

    return signals;
  };

  const collectSocialMeta = () => {
    const og = [];
    const twitter = [];
    const facebook = [];
    const linkedin = [];

    Array.from(document.querySelectorAll("meta")).forEach((meta) => {
      const property = meta.getAttribute("property") || meta.getAttribute("itemprop") || "";
      const name = meta.getAttribute("name") || "";
      const content = meta.getAttribute("content") || meta.getAttribute("value") || "";

      if (!content || (!property && !name)) {
        return;
      }

      const entry = {
        property: property || null,
        name: name || null,
        content,
      };

      if (property.startsWith("og:")) {
        og.push(entry);
      } else if (property.startsWith("fb:")) {
        facebook.push(entry);
      } else if (property.startsWith("linkedin:")) {
        linkedin.push(entry);
      } else if (name.startsWith("twitter:")) {
        twitter.push(entry);
      }
    });

    const ogImageEntry = og.find((entry) => entry.property === "og:image");

    return {
      og,
      twitter,
      facebook,
      linkedin,
      ogImage: ogImageEntry ? ogImageEntry.content : null,
    };
  };

  const detectCmsSignals = async () => {
    const cms = {
      usesSiteVision: false,
      usesWordPress: false,
      usesOptimizely: false,
      usesShopify: false,
      optimizelyLoginDetected: false,
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
    if (!cms.usesShopify && /shopify|cdn.shopify|shopifytheme/i.test(cookieString)) {
      cms.usesShopify = true;
    }

    const htmlSource = [
      document.documentElement ? document.documentElement.innerHTML : "",
      document.head ? document.head.innerHTML : "",
    ]
      .join(" ")
      .toLowerCase();

    if (!cms.usesSiteVision && htmlSource.includes("sitevision")) {
      cms.usesSiteVision = true;
    }

    if (!cms.usesSiteVision) {
      const generator = document
        .querySelector("meta[name='generator']")
        ?.getAttribute("content")
        ?.toLowerCase();
      if (generator && generator.includes("sitevision")) {
        cms.usesSiteVision = true;
      }
    }

    if (!cms.usesWordPress && (htmlSource.includes("wp-content") || htmlSource.includes("wordpress"))) {
      cms.usesWordPress = true;
    }

    if (
      !cms.usesOptimizely &&
      (htmlSource.includes("optimizely") || htmlSource.includes("episerver") || htmlSource.includes("epi-"))
    ) {
      cms.usesOptimizely = true;
    }

    if (
      !cms.usesShopify &&
      (htmlSource.includes("cdn.shopify") ||
        htmlSource.includes("shopify.com") ||
        htmlSource.includes("shopifytheme") ||
        htmlSource.includes("shopify-features"))
    ) {
      cms.usesShopify = true;
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

    if (!cms.usesSiteVision) {
      Array.from(document.querySelectorAll("script, link, meta")).some((node) => {
        const source =
          (
            node.src ||
            node.href ||
            node.getAttribute("content") ||
            node.getAttribute("data-sitevision") ||
            node.textContent ||
            ""
          ).toLowerCase();
        if (source.includes("sitevision")) {
          cms.usesSiteVision = true;
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

    if (!cms.usesShopify) {
      Array.from(document.querySelectorAll("script, link, meta")).some((node) => {
        const source = (
          node.src ||
            node.href ||
            node.getAttribute("content") ||
            node.textContent ||
            ""
        ).toLowerCase();
        if (source.includes("cdn.shopify") || source.includes("shopify.com") || source.includes("shopify-features")) {
          cms.usesShopify = true;
          return true;
        }
        return false;
      });
    }

    if (!cms.usesOptimizely && chrome?.runtime?.sendMessage) {
      try {
        const probeResult = await new Promise((resolve) => {
          try {
            chrome.runtime.sendMessage(
              {
                action: "checkOptimizelyLogins",
                origin: document.location.origin,
              },
              (response) => {
                if (chrome.runtime.lastError) {
                  resolve(null);
                  return;
                }
                resolve(response || null);
              }
            );
          } catch (error) {
            resolve(null);
          }
        });

        if (probeResult?.success && probeResult.result) {
          cms.usesOptimizely = true;
          cms.optimizelyLoginDetected = true;
        }
      } catch (error) {
        // Ignore probe failures.
      }
    }

    return cms;
  };

  if (mode === "cms") {
    const cmsSignals = await detectCmsSignals();
    return { mode, cms: cmsSignals };
  }

  const analyticsSignals = await collectAnalyticsSignals();
  const socialMeta = collectSocialMeta();

  const root = document.documentElement;
  const htmlLang = root ? root.getAttribute("lang") || null : null;

  return {
    mode,
    payload: {
      url: document.location.href,
      title: document.title || null,
      metaDescription: getMetaContent("meta[name='description']"),
      robots: getMetaContent("meta[name='robots']"),
      ogTitle: getMetaContent("meta[property='og:title']"),
      ogDescription: getMetaContent("meta[property='og:description']"),
      canonicalLinks: collectLinks(),
      hrefLangLinks: collectHrefLang(),
      anchors: collectAnchorSummary(),
      headings: collectHeadings(),
      structuredDataRaw: collectStructuredData(),
      analytics: analyticsSignals,
      socialMeta,
      pageLang: htmlLang,
    },
  };
};

const runPageCollector = (tabId, mode) =>
  new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId, allFrames: false },
        func: pageProbeScript,
        args: [{ mode }],
      },
      (results) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve(results?.[0]?.result || { mode });
      }
    );
  });

// Known Optimizely/Episerver login paths to probe.
const OPTIMIZELY_LOGIN_PATHS = [
  "/util/login.aspx",
  "/util/Login.aspx",
  "/episerver/",
  "/episerver/cms",
  "/episerver/cms/Login",
  "/episerver/cms/100.aspx",
];

// Try a single URL with the provided HTTP method and treat CORS failures as a miss.
const tryFetchOnce = async (url, method) => {
  try {
    const response = await fetch(url, {
      method,
      credentials: "omit",
      cache: "no-store",
      mode: "cors",
    });
    return response.status === 200 || response.status === 403;
  } catch (error) {
    return false;
  }
};

// Probe all known login paths for the supplied origin and report if any respond.
const checkOptimizelyLogins = async (origin) => {
  // Bail out if we were not given a valid origin to probe against.
  if (!origin) {
    return false;
  }

  // Test each known login endpoint until one responds with an allowed status.
  for (const path of OPTIMIZELY_LOGIN_PATHS) {
    const target = new URL(path, origin).toString();
    if ((await tryFetchOnce(target, "HEAD")) || (await tryFetchOnce(target, "GET"))) {
      return true;
    }
  }

  return false;
};


const createEmptyEventState = () => ({
  googleAds: {
    pageViews: new Set(),
    conversions: new Set(),
  },
  ga4: {
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
      ga4: { pageViews: [], conversions: [] },
      meta: { pageViews: [], conversions: [] },
    };
  }

  return {
    googleAds: {
      pageViews: toArray(state.googleAds.pageViews),
      conversions: toArray(state.googleAds.conversions),
    },
    ga4: {
      pageViews: toArray(state.ga4.pageViews),
      conversions: toArray(state.ga4.conversions),
    },
    meta: {
      pageViews: toArray(state.meta.pageViews),
      conversions: toArray(state.meta.conversions),
    },
  };
};

const notifyAnalyticsIndicator = (tabId, source) => {
  try {
    chrome.runtime.sendMessage(
      {
        action: "conversionDetected",
        tabId,
        source,
      },
      () => {
        if (chrome.runtime.lastError) {
          // Popup might not be open; ignore the error.
        }
      }
    );
  } catch (error) {
    // Ignore messaging errors; popup may not be active.
  }
};

const BADGE_ACTIVE_TEXT = "1";
const BADGE_COLOR = "#00C853";
let badgeColorApplied = false;

const setBadgeTextSafe = (text, tabId) => {
  if (!chrome.action || typeof chrome.action.setBadgeText !== "function") {
    return;
  }

  try {
    const result = chrome.action.setBadgeText({ text, tabId });
    if (result && typeof result.catch === "function") {
      result.catch(() => {});
    }
  } catch (error) {
    // Ignore badge errors; badge is a best-effort signal.
  }
};

const ensureBadgeColor = () => {
  if (badgeColorApplied || !chrome.action || typeof chrome.action.setBadgeBackgroundColor !== "function") {
    return;
  }

  try {
    const result = chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
    if (result && typeof result.then === "function") {
      result
        .then(() => {
          badgeColorApplied = true;
        })
        .catch(() => {});
      return;
    }
    badgeColorApplied = true;
  } catch (error) {
    // Ignore errors to avoid spamming logs.
  }
};

const activateBadge = (tabId) => {
  ensureBadgeColor();
  setBadgeTextSafe(BADGE_ACTIVE_TEXT, tabId);
};

const clearBadge = (tabId) => {
  setBadgeTextSafe("", tabId);
};

const flagDetectedEvent = (tabId, source) => {
  notifyAnalyticsIndicator(tabId, source);
};

const resetTabEvents = (tabId) => {
  tabEventStore.delete(tabId);
};

const handleNetworkEvent = (details) => {
  const { tabId, url } = details;
  let effectiveTabId = tabId;
  if (effectiveTabId < 0) {
    const possibleSources = [details.initiator, details.documentUrl].filter(Boolean);
    for (const source of possibleSources) {
      try {
        const origin = new URL(source).origin;
        for (const [knownTabId, storedOrigin] of tabOriginMap.entries()) {
          if (storedOrigin === origin) {
            effectiveTabId = knownTabId;
            break;
          }
        }
        if (effectiveTabId >= 0) {
          break;
        }
      } catch (error) {
        // ignore parsing errors
      }
    }
  }

  if (effectiveTabId < 0 || !url) {
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

  const state = getEventState(effectiveTabId);

  const isConsentMode = host.endsWith("google.com") && path.startsWith("/ccm/collect");
  const isGooglePageAdHost = host.endsWith("google.com") && path.startsWith("/pagead/");
  const isGoogleSyndicationHost = host.includes("googlesyndication.com") && path.includes("/pagead/");
  const isGoogleAdsHost =
    host.includes("googleads.g.doubleclick.net") ||
    host.includes("googleadservices.com") ||
    isGoogleSyndicationHost ||
    isGooglePageAdHost;
  const isGaHost = host.includes("google-analytics.com");

  if (isGoogleAdsHost || isGaHost || isConsentMode) {
    const rawEventName =
      params.get("ev") ||
      params.get("event") ||
      params.get("action") ||
      params.get("cmd") ||
      params.get("etype") ||
      params.get("en") ||
      "";
    const normalizedRawEventName = normalizeString(rawEventName);
    const eventName = normalizedRawEventName.toLowerCase();
    const tid = normalizeString(params.get("tid")) || "";

    const label =
      normalizeString(params.get("conversion_label")) ||
      normalizeString(params.get("label")) ||
      normalizeString(params.get("conversion_action")) ||
      normalizeString(params.get("conversion_id")) ||
      normalizeString(params.get("utm_campaign")) ||
      normalizeString(params.get("dl")) ||
      normalizeString(params.get("gclid")) ||
      normalizeString(parsedUrl.pathname.split("/").filter(Boolean).pop());

    const isGa4Host = isGaHost && path.includes("/g/collect");
    const tidUpper = tid.toUpperCase();
    const isGa4Tid = tidUpper.startsWith("G-") || tidUpper.startsWith("GT-");
    const isGoogleAdsTid = tidUpper.startsWith("AW-") || tidUpper.startsWith("DC-");

    const { targetChannel, indicatorSource, isGa4Hit } = (() => {
      if (isGa4Tid) {
        return { targetChannel: state.ga4, indicatorSource: "ga4", isGa4Hit: true };
      }
      if (isGoogleAdsTid) {
        return { targetChannel: state.googleAds, indicatorSource: "googleAds", isGa4Hit: false };
      }
      if (isGa4Host) {
        return { targetChannel: state.ga4, indicatorSource: "ga4", isGa4Hit: true };
      }
      if (isConsentMode && !isGoogleAdsTid) {
        return { targetChannel: state.ga4, indicatorSource: "ga4", isGa4Hit: true };
      }
      return { targetChannel: state.googleAds, indicatorSource: "googleAds", isGa4Hit: false };
    })();

    const isConversionPath =
      (!isGa4Hit && (path.includes("/pagead/conversion/") || path.includes("/pagead/1p-conversion/"))) ||
      (isGa4Hit && eventName.includes("conversion"));

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

    if (!isGa4Hit && isPageView) {
      const pageLabel = normalizedRawEventName || "Pageview";
      targetChannel.pageViews.add(pageLabel);
      flagDetectedEvent(effectiveTabId, indicatorSource);
    } else if (!isGa4Hit && (isExplicitConversion || normalizedRawEventName || label)) {
      const entryLabel = isConversionPath
        ? label || normalizeString(params.get("value")) || "Conversion"
        : label || normalizedRawEventName || "Conversion";
      targetChannel.conversions.add(entryLabel);
      activateBadge(effectiveTabId);
      flagDetectedEvent(effectiveTabId, indicatorSource);
    }

    return;
  }

  if (host.includes("facebook.com") && path.startsWith("/tr")) {
    const rawEventName = normalizeString(params.get("ev") || params.get("event"));
    const eventName = rawEventName.toLowerCase();

    const conversionName =
      normalizeString(params.get("cd[conversionname]")) ||
      normalizeString(params.get("cd[content_name]")) ||
      rawEventName;

    state.meta.conversions.add(conversionName || "Conversion");
    activateBadge(effectiveTabId);
    flagDetectedEvent(effectiveTabId, "meta");
  }
};

chrome.webRequest.onBeforeRequest.addListener(handleNetworkEvent, { urls: EVENT_URL_PATTERNS });

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    resetTabEvents(tabId);
    tabOriginMap.delete(tabId);
    clearBadge(tabId);
  }

  if (changeInfo.url) {
    try {
      const origin = new URL(changeInfo.url).origin;
      tabOriginMap.set(tabId, origin);
    } catch (error) {
      tabOriginMap.delete(tabId);
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  resetTabEvents(tabId);
  tabOriginMap.delete(tabId);
});

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setOptions) {
    chrome.sidePanel.setOptions({ path: "panel.html", enabled: true }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || typeof request.action !== "string") {
    return;
  }

  if (request.action === "checkOptimizelyLogins") {
    const origin = typeof request.origin === "string" ? request.origin : null;
    checkOptimizelyLogins(origin)
      .then((result) => {
        if (typeof sendResponse === "function") {
          sendResponse({ success: true, result });
        }
      })
      .catch((error) => {
        if (typeof sendResponse === "function") {
          sendResponse({ success: false, error: error?.message || "Optimizely probe failed." });
        }
      });

    return true;
  }

  if (request.action === "collectCMSData") {
    if (typeof request.tabId !== "number") {
      if (typeof sendResponse === "function") {
        sendResponse({ success: false, error: "Invalid tabId." });
      }
      return;
    }

    runPageCollector(request.tabId, "cms")
      .then((result) => {
        sendResponse({ success: true, cms: result?.cms || {} });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error?.message || "CMS detection failed." });
      });

    return true;
  }

  if (request.action !== "collectSEOData") {
    return;
  }

  if (typeof request.tabId !== "number") {
    if (typeof sendResponse === "function") {
      sendResponse({ success: false, error: "Invalid tabId." });
    }
    return;
  }

  clearBadge(request.tabId);

  runPageCollector(request.tabId, "full")
    .then((result) => {
      const payload = result?.payload || {};
      const events = serializeEventState(request.tabId);

      if (payload?.url) {
        try {
          const origin = new URL(payload.url).origin;
          tabOriginMap.set(request.tabId, origin);
        } catch (error) {
          tabOriginMap.delete(request.tabId);
        }
      }

      delete payload.mode;

      sendResponse({
        success: true,
        data: {
          ...payload,
          events,
        },
      });
    })
    .catch((error) => {
      sendResponse({ success: false, error: error?.message || "SEO data collection failed." });
    });
  return true;
});
