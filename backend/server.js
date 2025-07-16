const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");
const DOMPurify = require("isomorphic-dompurify");

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Sanitize HTML content
function sanitizeHTML(html, baseUrl) {
  const $ = cheerio.load(html);

  // Remove dangerous elements
  $(
    "script, object, embed, applet, form, input, button, select, textarea"
  ).remove();

  // Remove event handlers
  $("*").each((i, elem) => {
    const attrs = elem.attribs;
    if (attrs) {
      Object.keys(attrs).forEach((attr) => {
        if (
          attr.startsWith("on") ||
          (attr === "href" && attrs[attr].startsWith("javascript:"))
        ) {
          $(elem).removeAttr(attr);
        }
      });
    }
  });

  // Convert relative URLs to absolute
  if (baseUrl) {
    $("img, link, a").each((i, elem) => {
      const $elem = $(elem);
      ["src", "href"].forEach((attr) => {
        const val = $elem.attr(attr);
        if (val && !val.startsWith("http") && !val.startsWith("//")) {
          const absoluteUrl = new URL(val, baseUrl).href;
          $elem.attr(attr, absoluteUrl);
        }
      });
    });
  }

  // Add base styles for better rendering
  const baseStyles = `
    <style>
      body { 
        font-family: system-ui, -apple-system, sans-serif; 
        line-height: 1.4; 
        margin: 0; 
        padding: 16px; 
        background: white;
        color: #333;
        font-size: 14px;
      }
      img { max-width: 100%; height: auto; }
      a { color: #0066cc; text-decoration: none; }
      a:hover { text-decoration: underline; }
      * { box-sizing: border-box; }
    </style>
  `;

  $("head").prepend(baseStyles);

  return $.html();
}

// Fetch and sanitize webpage
app.post("/api/preview", async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    // Validate URL
    const urlObj = new URL(url);
    if (!["http:", "https:"].includes(urlObj.protocol)) {
      return res.status(400).json({ error: "Invalid protocol" });
    }

    // Fetch the webpage
    const response = await axios.get(url, {
      timeout: 10000,
      maxContentLength: 5 * 1024 * 1024, // 5MB limit
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    // Check content type
    const contentType = response.headers["content-type"] || "";
    if (!contentType.includes("text/html")) {
      return res.status(400).json({ error: "Not an HTML page" });
    }

    // Sanitize HTML
    const sanitizedHTML = sanitizeHTML(response.data, url);

    // Additional DOMPurify sanitization
    const cleanHTML = DOMPurify.sanitize(sanitizedHTML);

    res.json({
      success: true,
      html: cleanHTML,
      title: extractTitle(response.data),
      url: url,
    });
  } catch (error) {
    console.error("Preview error:", error.message);

    let errorMessage = "Failed to load preview";
    if (error.code === "ENOTFOUND") {
      errorMessage = "Website not found";
    } else if (error.code === "ECONNABORTED") {
      errorMessage = "Request timeout";
    } else if (error.response?.status === 403) {
      errorMessage = "Access forbidden";
    } else if (error.response?.status === 404) {
      errorMessage = "Page not found";
    }

    res.status(500).json({ error: errorMessage });
  }
});

// Extract title from HTML
function extractTitle(html) {
  const $ = cheerio.load(html);
  return $("title").text() || $("h1").first().text() || "Untitled Page";
}

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`hoverShower  backend running on port ${PORT}`);
});

module.exports = app;
