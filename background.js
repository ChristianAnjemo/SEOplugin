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
          Array.from(document.querySelectorAll("link[rel='canonical'], link[rel='alternate']"))
            .map((link) => ({
              rel: link.getAttribute("rel"),
              href: link.getAttribute("href"),
            }));

        const detectGA4 = () =>
          Array.from(document.querySelectorAll("head script")).some((script) => {
            const source = script.src || script.textContent || "";
            return source.toLowerCase().includes("googletagmanager");
          });

        return {
          url: document.location.href,
          title: document.title || null,
          metaDescription: getMetaContent("meta[name='description']"),
          robots: getMetaContent("meta[name='robots']"),
          ogTitle: getMetaContent("meta[property='og:title']"),
          ogDescription: getMetaContent("meta[property='og:description']"),
          canonicalLinks: collectLinks(),
          headings: collectHeadings(),
          analytics: {
            usesGA4: detectGA4(),
          },
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

      const [result] = results || [];
      sendResponse({
        success: true,
        data: result?.result || null,
      });
    }
  );

  // Indicate that we'll respond asynchronously.
  return true;
});
