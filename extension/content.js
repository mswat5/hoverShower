// Content script - injected into every page
class SmartLinkPreview {
  constructor() {
    this.preview = null;
    this.currentHoveredLink = null;
    this.previewTimeout = null;
    this.hideTimeout = null;
    this.cache = new Map();
    this.isEnabled = true;

    this.init();
  }

  init() {
    // Check if extension is enabled
    chrome.storage.sync.get(["enabled"], (result) => {
      this.isEnabled = result.enabled !== false;
      if (this.isEnabled) {
        this.setupEventListeners();
      }
    });
  }

  setupEventListeners() {
    // Use delegation for better performance
    document.addEventListener("mouseover", this.handleMouseOver.bind(this));
    document.addEventListener("mouseout", this.handleMouseOut.bind(this));
    document.addEventListener("click", this.handleClick.bind(this));

    // Listen for extension state changes
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "toggle") {
        this.isEnabled = request.enabled;
        if (!this.isEnabled) {
          this.hidePreview();
        }
      }
    });
  }

  handleMouseOver(e) {
    if (!this.isEnabled) return;

    const link = e.target.closest("a[href]");
    if (!link || !this.isValidLink(link)) return;

    this.currentHoveredLink = link;

    // Clear any existing timeouts
    clearTimeout(this.previewTimeout);
    clearTimeout(this.hideTimeout);

    // Show preview after delay
    this.previewTimeout = setTimeout(() => {
      if (this.currentHoveredLink === link) {
        this.showPreview(link, e);
      }
    }, 800); // 800ms delay
  }

  handleMouseOut(e) {
    const link = e.target.closest("a[href]");
    if (!link) return;

    clearTimeout(this.previewTimeout);

    // Hide preview after delay
    this.hideTimeout = setTimeout(() => {
      this.hidePreview();
    }, 200);
  }

  handleClick(e) {
    // Hide preview on click
    this.hidePreview();
  }

  isValidLink(link) {
    const href = link.getAttribute("href");
    if (!href) return false;

    // Skip internal links, javascript, mailto, tel, etc.
    if (
      href.startsWith("#") ||
      href.startsWith("javascript:") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      href.startsWith("sms:")
    ) {
      return false;
    }

    // Skip same domain links for now (could be configurable)
    try {
      const url = new URL(href, window.location.href);
      return url.hostname !== window.location.hostname;
    } catch {
      return false;
    }
  }

  async showPreview(link, event) {
    const href = link.getAttribute("href");
    const fullUrl = new URL(href, window.location.href).href;

    // Check cache first
    if (this.cache.has(fullUrl)) {
      this.displayPreview(this.cache.get(fullUrl), event);
      return;
    }

    // Show loading state
    this.displayPreview({ loading: true, url: fullUrl }, event);

    try {
      const response = await fetch("http://localhost:3001/api/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: fullUrl }),
      });

      const data = await response.json();

      if (data.success) {
        // Cache the result
        this.cache.set(fullUrl, data);

        // Display if still hovering the same link
        if (this.currentHoveredLink === link) {
          this.displayPreview(data, event);
        }
      } else {
        this.displayPreview({ error: data.error, url: fullUrl }, event);
      }
    } catch (error) {
      console.error("Preview fetch error:", error);
      this.displayPreview(
        { error: "Failed to load preview", url: fullUrl },
        event
      );
    }
  }

  displayPreview(data, event) {
    // Remove existing preview
    this.hidePreview();

    // Create preview container
    this.preview = document.createElement("div");
    this.preview.className = "smartlink-preview";
    this.preview.innerHTML = this.getPreviewHTML(data);

    // Position preview
    this.positionPreview(event);

    // Add to DOM
    document.body.appendChild(this.preview);

    // Add event listeners to keep preview visible when hovering over it
    this.preview.addEventListener("mouseenter", () => {
      clearTimeout(this.hideTimeout);
    });

    this.preview.addEventListener("mouseleave", () => {
      this.hideTimeout = setTimeout(() => {
        this.hidePreview();
      }, 200);
    });

    // Animate in
    requestAnimationFrame(() => {
      this.preview.style.opacity = "1";
      this.preview.style.transform = "translateY(0)";
    });
  }

  getPreviewHTML(data) {
    if (data.loading) {
      return `
        <div class="smartlink-header">
          <div class="smartlink-loading">Loading preview...</div>
        </div>
      `;
    }

    if (data.error) {
      return `
        <div class="smartlink-header">
          <div class="smartlink-error">⚠️ ${data.error}</div>
          <div class="smartlink-url">${data.url}</div>
        </div>
      `;
    }

    return `
      <div class="smartlink-header">
        <div class="smartlink-title">${data.title || "Untitled"}</div>
        <div class="smartlink-url">${data.url}</div>
      </div>
      <div class="smartlink-content">
        <iframe src="data:text/html;charset=utf-8,${encodeURIComponent(
          data.html
        )}" 
                frameborder="0" 
                sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox">
        </iframe>
      </div>
    `;
  }

  positionPreview(event) {
    const preview = this.preview;
    const previewWidth = 400;
    const previewHeight = 300;
    const offset = 10;

    let x = event.pageX + offset;
    let y = event.pageY + offset;

    // Adjust if preview would go off screen
    if (x + previewWidth > window.innerWidth + window.pageXOffset) {
      x = event.pageX - previewWidth - offset;
    }

    if (y + previewHeight > window.innerHeight + window.pageYOffset) {
      y = event.pageY - previewHeight - offset;
    }

    preview.style.left = x + "px";
    preview.style.top = y + "px";
  }

  hidePreview() {
    if (this.preview) {
      this.preview.remove();
      this.preview = null;
    }
    this.currentHoveredLink = null;
    clearTimeout(this.previewTimeout);
    clearTimeout(this.hideTimeout);
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    new SmartLinkPreview();
  });
} else {
  new SmartLinkPreview();
}
