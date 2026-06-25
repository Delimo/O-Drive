/**
 * XML utilities for WebDAV responses.
 * Handles XML escaping, date formatting, PROPFIND parsing, and multistatus generation.
 */

/** Escape XML special characters. */
export function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Format a Unix timestamp (ms) as RFC 1123 HTTP date. */
export function httpDate(timestamp) {
  return new Date(timestamp).toUTCString();
}

/** Format a Unix timestamp (ms) as ISO 8601 date. */
export function isoDate(timestamp) {
  return new Date(timestamp).toISOString();
}

/**
 * Parse a PROPFIND request body to determine which properties are requested.
 * Returns { allprop: boolean, props: string[] }.
 */
export function parsePropfindBody(body) {
  if (!body) return { allprop: true, props: [] };
  if (/<allprop/i.test(body)) return { allprop: true, props: [] };

  const props = [];
  const regex = /<D:(\w+)[\s\/>]/gi;
  let match;
  while ((match = regex.exec(body)) !== null) {
    const name = match[1].toLowerCase();
    if (name !== "prop" && name !== "propfind") {
      props.push(name);
    }
  }
  return { allprop: false, props };
}

/** All supported PROPFIND property names. */
export const ALL_PROPS = [
  "displayname",
  "getcontentlength",
  "getlastmodified",
  "resourcetype",
  "getcontenttype",
  "creationdate",
];

/**
 * Build property XML elements for a resource.
 * @param {object} info - { name, size, updated_at, uploaded_at, contentType, isCollection }
 * @param {string[]} requestedProps - Property names to include, or ALL_PROPS for allprop
 * @returns {string[]} Array of XML property strings
 */
export function buildProps(info, requestedProps) {
  const props = requestedProps;
  const result = [];

  for (const prop of props) {
    switch (prop) {
      case "displayname":
        result.push(`<D:displayname>${escapeXml(info.name)}</D:displayname>`);
        break;
      case "getcontentlength":
        if (!info.isCollection) {
          result.push(`<D:getcontentlength>${info.size || 0}</D:getcontentlength>`);
        }
        break;
      case "getlastmodified":
        if (info.updated_at) {
          result.push(`<D:getlastmodified>${httpDate(info.updated_at)}</D:getlastmodified>`);
        }
        break;
      case "resourcetype":
        if (info.isCollection) {
          result.push("<D:resourcetype><D:collection/></D:resourcetype>");
        } else {
          result.push("<D:resourcetype/>");
        }
        break;
      case "getcontenttype":
        if (!info.isCollection && info.contentType) {
          result.push(`<D:getcontenttype>${escapeXml(info.contentType)}</D:getcontenttype>`);
        }
        break;
      case "creationdate":
        if (info.uploaded_at) {
          result.push(`<D:creationdate>${isoDate(info.uploaded_at)}</D:creationdate>`);
        }
        break;
    }
  }

  return result;
}

/**
 * Build a PROPFIND multistatus XML response.
 * @param {Array<{ href: string, props: string[] }>} items
 * @returns {string} XML string
 */
export function buildMultistatus(items) {
  const responses = items
    .map(
      (item) => `
  <D:response>
    <D:href>${escapeXml(item.href)}</D:href>
    <D:propstat>
      <D:prop>
${item.props.map((p) => `        ${p}`).join("\n")}
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">${responses}
</D:multistatus>`;
}
