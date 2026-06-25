/**
 * WebDAV PROPFIND handler.
 * Lists directory contents or returns file/folder properties in XML multistatus format.
 */
import { isReservedKey } from "../../api/lib/common/index.js";
import { listIndexedDirectory, getFileIndexEntry } from "../../api/lib/file-index/index.js";
import { storageList, storageHead, resolveExistingObjectLocation } from "../../api/lib/storage.js";
import { parsePropfindBody, buildProps, buildMultistatus, ALL_PROPS, escapeXml } from "./xml.js";

/**
 * Handle a PROPFIND request.
 * @param {object} env - Cloudflare env bindings
 * @param {Request} request - The incoming request
 * @param {string} r2Key - The resolved R2 key (empty string for root)
 * @returns {Response} XML multistatus response
 */
export async function handlePropfind(env, request, r2Key) {
  const depth = request.headers.get("Depth") || "infinity";
  const body = await request.text().catch(() => "");
  const { allprop, props } = parsePropfindBody(body);
  const requestedProps = allprop ? ALL_PROPS : props;

  // Check if the resource exists and determine its type
  const isRoot = !r2Key;
  let isDirectory = isRoot;
  let fileEntry = null;

  if (!isRoot) {
    // Check if it's a file in the index
    fileEntry = await getFileIndexEntry(env, r2Key);
    if (fileEntry) {
      isDirectory = fileEntry.kind === "folder";
    } else {
      // Check if it's a directory by looking for children
      const listed = await storageList(env, "r2", { prefix: r2Key + "/", limit: 1 });
      const hasChildren =
        (listed.objects || []).length > 0 ||
        (listed.delimitedPrefixes || []).length > 0;
      if (hasChildren) {
        isDirectory = true;
      } else {
        // Check if the object exists directly
        const location = await resolveExistingObjectLocation(env, r2Key);
        const head = location ? await storageHead(env, location.storageId, location.objectKey) : null;
        if (!head) {
          return new Response("Not Found", { status: 404 });
        }
        // It's a file
        isDirectory = false;
        fileEntry = {
          name: r2Key.split("/").pop(),
          size: head.size,
          updated_at: head.uploaded ? head.uploaded.getTime() : Date.now(),
          uploaded_at: head.uploaded ? head.uploaded.getTime() : Date.now(),
          contentType: head.httpMetadata?.contentType || "",
        };
      }
    }
  }

  const items = [];
  const davPrefix = "/dav";

  // Add the resource itself
  if (isRoot) {
    items.push({
      href: davPrefix + "/",
      props: buildProps(
        {
          name: "",
          size: 0,
          updated_at: Date.now(),
          uploaded_at: Date.now(),
          contentType: "",
          isCollection: true,
        },
        requestedProps,
      ),
    });
  } else {
    const name = r2Key.split("/").pop() || r2Key;
    items.push({
      href: davPrefix + "/" + encodeUriPath(r2Key),
      props: buildProps(
        {
          name,
          size: fileEntry?.size || 0,
          updated_at: fileEntry?.updated_at || Date.now(),
          uploaded_at: fileEntry?.uploaded_at || Date.now(),
          contentType: fileEntry?.contentType || "",
          isCollection: isDirectory,
        },
        requestedProps,
      ),
    });
  }

  // For directories with Depth >= 1, add children
  if (isDirectory && depth !== "0") {
    const children = await listDirectory(env, r2Key);
    for (const child of children) {
      items.push({
        href: davPrefix + "/" + encodeUriPath(child.fullKey),
        props: buildProps(
          {
            name: child.name,
            size: child.size || 0,
            updated_at: child.updated_at || Date.now(),
            uploaded_at: child.uploaded_at || Date.now(),
            contentType: child.contentType || "",
            isCollection: child.isCollection,
          },
          requestedProps,
        ),
      });
    }
  }

  const xml = buildMultistatus(items);
  return new Response(xml, {
    status: 207,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "DAV": "1",
    },
  });
}

/**
 * List directory contents by merging D1 index and R2 listing.
 * Filters out reserved keys and .folder sentinels.
 */
async function listDirectory(env, r2Key) {
  const prefix = r2Key ? r2Key + "/" : "";
  const [indexed, listed] = await Promise.all([
    listIndexedDirectory(env, r2Key),
    storageList(env, "r2", { prefix, delimiter: "/" }),
  ]);

  const folderMap = new Map();
  const fileMap = new Map();

  // Add indexed folders
  for (const folder of indexed.folders || []) {
    if (folder.fullKey && folder.name && folder.name !== ".folder" && !isReservedKey(folder.fullKey)) {
      folderMap.set(folder.fullKey, {
        name: folder.name,
        fullKey: folder.fullKey,
        isCollection: true,
        size: 0,
        updated_at: Date.now(),
        uploaded_at: Date.now(),
        contentType: "",
      });
    }
  }

  // Add R2 delimited prefixes (folders)
  for (const p of listed.delimitedPrefixes || []) {
    const fullKey = p.slice(0, -1);
    const name = fullKey.split("/").slice(-1)[0];
    if (name && name !== ".folder" && !isReservedKey(fullKey) && !folderMap.has(fullKey)) {
      folderMap.set(fullKey, {
        name,
        fullKey,
        isCollection: true,
        size: 0,
        updated_at: Date.now(),
        uploaded_at: Date.now(),
        contentType: "",
      });
    }
  }

  // Add indexed files
  for (const file of indexed.files || []) {
    if (file.fullKey && file.name && file.name !== ".folder" && !isReservedKey(file.fullKey)) {
      fileMap.set(file.fullKey, {
        name: file.name,
        fullKey: file.fullKey,
        isCollection: false,
        size: file.size || 0,
        updated_at: file.updated_at || file.time * 1000 || Date.now(),
        uploaded_at: file.uploaded_at || file.time * 1000 || Date.now(),
        contentType: file.contentType || file.content_type || "",
      });
    }
  }

  // Add R2 objects (files)
  for (const obj of listed.objects || []) {
    const name = obj.key.split("/").pop();
    if (name && name !== ".folder" && !isReservedKey(obj.key) && !fileMap.has(obj.key)) {
      fileMap.set(obj.key, {
        name,
        fullKey: obj.key,
        isCollection: false,
        size: obj.size || 0,
        updated_at: obj.uploaded ? obj.uploaded.getTime() : Date.now(),
        uploaded_at: obj.uploaded ? obj.uploaded.getTime() : Date.now(),
        contentType: obj.httpMetadata?.contentType || "",
      });
    }
  }

  return [...folderMap.values(), ...fileMap.values()];
}

/**
 * Encode a path for use in DAV href, encoding each segment separately.
 */
function encodeUriPath(path) {
  return path
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}
