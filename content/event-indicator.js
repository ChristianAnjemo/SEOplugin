(() => {
  const INDICATOR_ID = "seo-plugin-event-indicator";

  const attachInteraction = (indicator) => {
    if (indicator.dataset.bound === "true") {
      return;
    }
    indicator.dataset.bound = "true";
    indicator.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "openAnalyticsFromIndicator" });
    });
  };

  const ensureIndicator = () => {
    const applyStyles = (indicator) => {
      indicator.id = INDICATOR_ID;
      indicator.textContent = "Event detected";
      indicator.style.position = "fixed";
      indicator.style.bottom = "16px";
      indicator.style.right = "16px";
      indicator.style.padding = "10px 14px";
      indicator.style.minWidth = "120px";
      indicator.style.borderRadius = "12px";
      indicator.style.backgroundColor = "#00C853";
      indicator.style.color = "#ffffff";
      indicator.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      indicator.style.fontSize = "14px";
      indicator.style.fontWeight = "600";
      indicator.style.display = "flex";
      indicator.style.alignItems = "center";
      indicator.style.justifyContent = "center";
      indicator.style.boxShadow = "0 18px 38px -22px rgba(0, 200, 83, 0.8)";
      indicator.style.zIndex = "2147483647";
      indicator.style.pointerEvents = "auto";
      indicator.style.letterSpacing = "0.01em";
      indicator.style.opacity = "1";
      indicator.style.cursor = "pointer";
    };

    const host = document.body || document.documentElement;
    if (!host) {
      return { success: false, error: "Document has no mount point." };
    }

    let indicator = document.getElementById(INDICATOR_ID);
    if (indicator) {
      applyStyles(indicator);
      indicator.style.display = "flex";
      attachInteraction(indicator);
      return { success: true, created: false };
    }

    indicator = document.createElement("div");
    applyStyles(indicator);
    host.appendChild(indicator);
    attachInteraction(indicator);

    return { success: true, created: true };
  };

  const hideIndicator = () => {
    const indicator = document.getElementById(INDICATOR_ID);
    if (!indicator) {
      return { success: true, hidden: false };
    }

    indicator.style.display = "none";
    indicator.style.opacity = "0";
    return { success: true, hidden: true };
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.action !== "showEventIndicator") {
      if (message?.action === "hideEventIndicator") {
        sendResponse(hideIndicator());
      }
      return;
    }

    const result = ensureIndicator();
    sendResponse(result);
  });
})();
