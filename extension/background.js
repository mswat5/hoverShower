// Background service worker
chrome.runtime.onInstalled.addListener(() => {
  console.log("SmartLink PRO installed");

  // Set default settings
  chrome.storage.sync.set({
    enabled: true,
    delay: 800,
    previewWidth: 400,
    previewHeight: 300,
  });

  // Initialize stats
  chrome.storage.local.set({
    previewCount: 0,
    installDate: Date.now(),
  });
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  // This will open the popup, but we can add additional logic here if needed
  console.log("Extension icon clicked");
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "incrementPreviewCount") {
    // Increment preview count
    chrome.storage.local.get(["previewCount"], (result) => {
      const count = (result.previewCount || 0) + 1;
      chrome.storage.local.set({ previewCount: count });
    });
  }

  if (request.action === "getSettings") {
    chrome.storage.sync.get(
      ["enabled", "delay", "previewWidth", "previewHeight"],
      (result) => {
        sendResponse(result);
      }
    );
    return true; // Keep message channel open for async response
  }
});

// Clean up old cache entries periodically
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "cleanup-cache") {
    cleanupCache();
  }
});

// Set up periodic cache cleanup
chrome.alarms.create("cleanup-cache", { periodInMinutes: 60 });

async function cleanupCache() {
  try {
    const items = await chrome.storage.local.get();
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    const keysToRemove = [];

    for (const [key, value] of Object.entries(items)) {
      if (key.startsWith("preview_") && value.timestamp) {
        if (now - value.timestamp > maxAge) {
          keysToRemove.push(key);
        }
      }
    }

    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
      console.log(`Cleaned up ${keysToRemove.length} old cache entries`);
    }
  } catch (error) {
    console.error("Error cleaning up cache:", error);
  }
}

// Handle tab updates - could be used for additional features
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    // Could inject content script here if needed
    // or perform other tab-specific setup
  }
});

// Context menu setup (optional feature)
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "smartlink-preview",
    title: "Preview this link",
    contexts: ["link"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "smartlink-preview" && info.linkUrl) {
    // Send message to content script to show preview for this link
    chrome.tabs.sendMessage(tab.id, {
      action: "showPreview",
      url: info.linkUrl,
    });
  }
});
