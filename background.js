const tabEventStore = new Map();
const tabOriginMap = new Map();

const EVENT_URL_PATTERNS = [
  "*://*.googleads.g.doubleclick.net/*",
  "*://*.googleadservices.com/*",
  "*://*.google.com/ccm/collect*",
  "*://*.facebook.com/tr*",
];

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

const EVENT_INDICATOR_ID = "seo-plugin-event-indicator";

const injectEventIndicator = (tabId) =>
  chrome.scripting
    .executeScript({
      target: { tabId, allFrames: false },
      func: (indicatorId) => {
        const ensureBody = () => {
          if (document.body) {
            return document.body;
          }
          const body = document.createElement("body");
          document.documentElement.appendChild(body);
          return body;
        };

        const applyStyles = (indicator) => {
          indicator.id = indicatorId;
          indicator.textContent = "Event detected";
          indicator.style.position = "fixed";
          indicator.style.bottom = "16px";
          indicator.style.right = "16px";
          indicator.style.padding = "10px 14px";
          indicator.style.minWidth = "120px";
          indicator.style.borderRadius = "12px";
          indicator.style.backgroundColor = "#00C853";
          indicator.style.color = "#ffffff";
          indicator.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif";
          indicator.style.fontSize = "14px";
          indicator.style.fontWeight = "600";
          indicator.style.display = "flex";
          indicator.style.alignItems = "center";
          indicator.style.justifyContent = "center";
          indicator.style.boxShadow = "0 18px 38px -22px rgba(0, 200, 83, 0.8)";
          indicator.style.zIndex = "2147483647";
          indicator.style.pointerEvents = "none";
          indicator.style.letterSpacing = "0.01em";
        };

        const host = ensureBody();
        const existing = host.querySelector(`#${indicatorId}`);
        if (existing) {
          applyStyles(existing);
          existing.style.display = "flex";
          existing.style.opacity = "1";
          return { success: true, created: false };
        }

        const indicator = document.createElement("div");
        applyStyles(indicator);

        host.appendChild(indicator);
        return { success: true, created: true };
      },
      args: [EVENT_INDICATOR_ID],
    })
    .then((results) => results?.[0]?.result || { success: true, created: false });

const notifyIndicatorContentScript = (tabId) =>
  new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      { action: "showEventIndicator" },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { success: false, error: "No response from content script." });
      }
    );
  });

const showEventIndicator = async (tabId) => {
  const contentResponse = await notifyIndicatorContentScript(tabId);
  if (contentResponse?.success) {
    return contentResponse;
  }

  return injectEventIndicator(tabId);
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

const resetTabEvents = (tabId) => {
  tabEventStore.delete(tabId);
};

const normalizeString = (value) => (typeof value === "string" ? value.trim() : "");

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

  if (
    host.includes("googleads.g.doubleclick.net") ||
    host.includes("googleadservices.com") ||
    (host.endsWith("google.com") && path.startsWith("/ccm/collect"))
  ) {
    const rawEventName =
      params.get("ev") ||
      params.get("event") ||
      params.get("action") ||
      params.get("cmd") ||
      params.get("etype") ||
      params.get("en") ||
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
      normalizeString(params.get("tid")) ||
      normalizeString(parsedUrl.pathname.split("/").filter(Boolean).pop());

    const isConversionPath =
      path.includes("/pagead/conversion/") ||
      path.includes("/pagead/1p-conversion/") ||
      path.includes("/ccm/collect") && eventName.includes("conversion");

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
      showEventIndicator(effectiveTabId).catch(() => {});
      notifyAnalyticsIndicator(effectiveTabId, "googleAds");
    } else if (isExplicitConversion || eventName || label) {
      const entryLabel = isConversionPath
        ? label || normalizeString(params.get("value")) || "Conversion"
        : label || rawEventName || "Conversion";
      state.googleAds.conversions.add(entryLabel);
      showEventIndicator(effectiveTabId).catch(() => {});
      notifyAnalyticsIndicator(effectiveTabId, "googleAds");
    }

    return;
  }

  if (host.includes("facebook.com") && path.startsWith("/tr")) {
    const rawEventName = normalizeString(params.get("ev") || params.get("event"));
    const eventName = rawEventName.toLowerCase();

    if (!eventName || eventName === "pageview" || eventName === "page_view") {
      state.meta.pageViews.add("Pageview");
      showEventIndicator(effectiveTabId).catch(() => {});
      notifyAnalyticsIndicator(effectiveTabId, "meta");
      return;
    }

    const conversionName =
      normalizeString(params.get("cd[conversionname]")) ||
      normalizeString(params.get("cd[content_name]")) ||
      rawEventName;

    state.meta.conversions.add(conversionName || "Conversion");
    showEventIndicator(effectiveTabId).catch(() => {});
    notifyAnalyticsIndicator(effectiveTabId, "meta");
  }
};

chrome.webRequest.onBeforeRequest.addListener(handleNetworkEvent, { urls: EVENT_URL_PATTERNS });

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    resetTabEvents(tabId);
    tabOriginMap.delete(tabId);
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

  if (request.action === "injectCornerIndicator") {
    const tabId =
      typeof request.tabId === "number" ? request.tabId : typeof sender?.tab?.id === "number" ? sender.tab.id : null;

    if (typeof tabId !== "number") {
      if (typeof sendResponse === "function") {
        sendResponse({ success: false, error: "Missing tabId for indicator injection." });
      }
      return;
    }

    showEventIndicator(tabId)
      .then((result) => {
        if (typeof sendResponse === "function") {
          sendResponse({ success: true, result });
        }
      })
      .catch((error) => {
        console.error("Indicator injection failed", error);
        if (typeof sendResponse === "function") {
          sendResponse({ success: false, error: error?.message || "Indicator injection failed." });
        }
      });

    return true;
  }

  if (request.action === "openAnalyticsFromIndicator") {
    chrome.action
      .openPopup()
      .then(() => {
        chrome.runtime.sendMessage({ action: "focusAnalyticsTab" }).catch(() => {});
      })
      .catch(() => {});

    if (typeof sendResponse === "function") {
      sendResponse({ success: true });
    }

    return false;
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

  chrome.scripting.executeScript(
    {
      target: { tabId: request.tabId, allFrames: false },
      func: async () => {
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
          Array.from(document.querySelectorAll('script[type*="ld+json" i]')).map((script) => {
            const inlineContent = script.textContent?.trim();
            if (inlineContent) {
              return inlineContent;
            }

            const src = script.getAttribute("src");
            if (src) {
              return `{"_metacat_note": "External structured data referenced at ${src}"}`;
            }

            return "";
          }).filter(Boolean);

        const collectAnchorSummary = () => {
          const anchors = Array.from(document.querySelectorAll("a"));
          const location = document.location;
          let internal = 0;
          let external = 0;

          anchors.forEach((anchor) => {
            const rawHref = anchor.getAttribute("href") || "";
            const href = rawHref.trim();

            if (!href) {
              internal += 1;
              return;
            }

            if (href.startsWith("#")) {
              internal += 1;
              return;
            }

            if (href.startsWith("/")) {
              internal += 1;
              return;
            }

            if (href.startsWith("./") || href.startsWith("../")) {
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

        const collectSocialMeta = () => {
          const og = [];
          const twitter = [];
          const facebook = [];
          const linkedin = [];

          Array.from(document.querySelectorAll("meta")).forEach((meta) => {
            const property = meta.getAttribute("property") || meta.getAttribute("itemprop") || "";
            const name = meta.getAttribute("name") || "";
            const content = meta.getAttribute("content") || meta.getAttribute("value") || "";

            if (!content) {
              return;
            }

            if (!property && !name) {
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
            } else if (name.startsWith("twitter:")) {
              twitter.push(entry);
            } else if (property.startsWith("article:")) {
              linkedin.push(entry);
            } else if (name.startsWith("linkedin:")) {
              linkedin.push(entry);
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
            Array.from(document.querySelectorAll("script, link, meta" )).some((node) => {
              const source = (
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

          if (!cms.usesOptimizely) {
            const loginPaths = [
              "/util/login.aspx",
              "/util/Login.aspx",
              "/episerver/",
              "/episerver/cms",
              "/episerver/cms/Login",
              "/episerver/cms/100.aspx",
            ];

            const checkUrl = async (path) => {
              const target = new URL(path, document.location.origin).toString();
              const attempt = async (method) => {
                try {
                  const response = await fetch(target, {
                    method,
                    credentials: "omit",
                    cache: "no-store",
                    mode: "cors",
                  });
                  if (response.status === 200 || response.status === 403) {
                    return true;
                  }
                  return false;
                } catch (error) {
                  return false;
                }
              };

              let result = await attempt("HEAD");
              if (!result) {
                result = await attempt("GET");
              }
              return result;
            };

            const outcomes = await Promise.all(loginPaths.map((path) => checkUrl(path)));
            if (outcomes.some(Boolean)) {
              cms.usesOptimizely = true;
              cms.optimizelyLoginDetected = true;
            }
          }

          return cms;
        };

        const analyticsSignals = collectAnalyticsSignals();
        const socialMeta = collectSocialMeta();
        const cmsSignals = await detectCmsSignals();

        const root = document.documentElement;
        const htmlLang = root ? root.getAttribute("lang") || null : null;

        return {
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
          cms: cmsSignals,
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

      if (payload?.url) {
        try {
          const origin = new URL(payload.url).origin;
          tabOriginMap.set(request.tabId, origin);
        } catch (error) {
          // ignore
        }
      }

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
