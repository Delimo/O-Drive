import { jsonResponse } from "../common/index.js";
import { handleDownloadOrPreview } from "../file-reads.js";
import { SHARE_ACCESS_TTL_SECONDS } from "./constants.js";
import {
  bundleRootDirectory,
  detectShareTarget,
  findBundleRootForPath,
  listShareDirectory,
} from "./directory.js";
import {
  exhaustedResponse,
  expiredResponse,
  getShare,
  releaseDownloadSlot,
  reserveDownloadSlot,
} from "./expiry.js";
import { mapShare } from "./mapping.js";
import {
  cookieAttributes,
  hasShareAccess,
  shareAccessCookieName,
  sharePasswordRequiredResponse,
  signShareAccess,
  verifySharePassword,
} from "./password.js";
import {
  childPath,
  cleanShareSubPath,
} from "./paths.js";
import {
  bundleZipResponse,
  folderZipResponse,
} from "./zip.js";

export async function handlePublicShare(env, request, path) {
  const match = path.match(
    /^\/api\/share\/([^/]+)\/(info|preview|download|unlock)$/,
  );
  if (!match) return null;
  const token = decodeURIComponent(match[1]);
  const action = match[2];
  if (action !== "unlock" && request.method !== "GET") return null;
  if (action === "unlock" && request.method !== "POST")
    return jsonResponse({ message: "Method Not Allowed" }, 405);
  const row = await getShare(env, token);
  if (!row)
    return jsonResponse(
      { success: false, message: "Share link not found" },
      404,
    );

  const item = mapShare(row);
  if (item.expired)
    return expiredResponse(env, token, "Share link expired", row);
  if (item.exhausted) return exhaustedResponse(env, token, row);
  if (action === "unlock") {
    if (!item.hasPassword) return jsonResponse({ success: true });
    const body = await request.json().catch(() => ({}));
    if (!(await verifySharePassword(String(body.password || ""), row))) {
      return jsonResponse(
        { success: false, message: "Invalid share password" },
        403,
      );
    }
    const exp = Math.floor(Date.now() / 1000) + SHARE_ACCESS_TTL_SECONDS;
    const signed = await signShareAccess(env, token, exp);
    return jsonResponse({ success: true }, 200, {
      "Set-Cookie": `${shareAccessCookieName(token)}=${signed}; ${cookieAttributes(request)}`,
    });
  }
  if (!(await hasShareAccess(env, request, token, row)))
    return sharePasswordRequiredResponse({ token, hasPassword: true });

  const accessIp =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    "";
  await env.D1.prepare(
    "UPDATE share_links SET last_accessed_at = ?, last_access_ip = ? WHERE token = ?",
  )
    .bind(Date.now(), accessIp, token)
    .run();
  const url = new URL(request.url);
  const subPath = cleanShareSubPath(url.searchParams.get("path") || "");
  const isFolderShare = item.targetType === "folder";
  const isBundleShare = item.targetType === "bundle";
  if (!isFolderShare && !isBundleShare && subPath)
    return jsonResponse({ success: false, message: "Invalid share path" }, 404);

  if (action === "info") {
    if (isBundleShare) {
      if (!subPath)
        return jsonResponse({ success: true, item, directory: bundleRootDirectory(item) });
      const sharedRoot = findBundleRootForPath(item.items, subPath);
      if (!sharedRoot || sharedRoot.targetType !== "folder")
        return jsonResponse({ success: false, message: "Share path not found" }, 404);
      const relativePath =
        subPath === sharedRoot.path ? "" : subPath.slice(sharedRoot.path.length + 1);
      const directory = await listShareDirectory(env, sharedRoot.path, relativePath);
      return jsonResponse({ success: true, item, directory });
    }
    if (!isFolderShare) return jsonResponse({ success: true, item });
    const directory = await listShareDirectory(env, item.path, subPath);
    return jsonResponse({ success: true, item, directory });
  }
  if (action === "preview" && !item.allowPreview)
    return jsonResponse({ success: false, message: "Preview disabled" }, 403);
  if (action === "download" && !item.allowDownload)
    return jsonResponse({ success: false, message: "Download disabled" }, 403);
  if (isBundleShare) {
    if (action === "download" && !subPath) {
      if (!(await reserveDownloadSlot(env, token)))
        return exhaustedResponse(env, token, row);
      const res = await bundleZipResponse(env, item);
      if (res.ok) {
        await env.D1.prepare(
          "UPDATE share_links SET last_access_ip = ? WHERE token = ?",
        )
          .bind(accessIp, token)
          .run();
      } else {
        await releaseDownloadSlot(env, token);
      }
      return res;
    }
    const sharedRoot = findBundleRootForPath(item.items, subPath);
    if (!sharedRoot)
      return jsonResponse({ success: false, message: "Share path not found" }, 404);
    const target = await detectShareTarget(env, subPath);
    if (!target)
      return jsonResponse({ success: false, message: "Share path not found" }, 404);
    if (action === "preview" && target.targetType !== "file")
      return jsonResponse({ success: false, message: "Folder preview disabled" }, 403);
    if (action === "download" && !(await reserveDownloadSlot(env, token)))
      return exhaustedResponse(env, token, row);
    const res =
      action === "download" && target.targetType === "folder"
        ? await folderZipResponse(
            env,
            sharedRoot.path,
            subPath === sharedRoot.path ? "" : subPath.slice(sharedRoot.path.length + 1),
            subPath.split("/").pop() || sharedRoot.name,
          )
        : await handleDownloadOrPreview(
            env,
            request,
            action === "download"
              ? `/api/download/${subPath}`
              : `/api/preview/${subPath}`,
            subPath,
          );
    if (action === "download") {
      if (res.ok) {
        await env.D1.prepare(
          "UPDATE share_links SET last_access_ip = ? WHERE token = ?",
        )
          .bind(accessIp, token)
          .run();
      } else {
        await releaseDownloadSlot(env, token);
      }
    }
    return res;
  }
  const targetPath = isFolderShare ? childPath(item.path, subPath) : item.path;
  const target = isFolderShare ? await detectShareTarget(env, targetPath) : null;
  if (isFolderShare && subPath && !target)
    return jsonResponse({ success: false, message: "Share path not found" }, 404);
  if (isFolderShare && action === "preview" && target?.targetType !== "file")
    return jsonResponse({ success: false, message: "Folder preview disabled" }, 403);
  if (action === "download" && !(await reserveDownloadSlot(env, token)))
    return exhaustedResponse(env, token, row);
  const res =
    isFolderShare && (!target || target.targetType === "folder")
      ? await folderZipResponse(env, item.path, subPath, targetPath.split("/").pop() || item.name)
      : await handleDownloadOrPreview(
          env,
          request,
          action === "download"
            ? `/api/download/${targetPath}`
            : `/api/preview/${targetPath}`,
          targetPath,
        );
  if (action === "download") {
    if (res.ok) {
      await env.D1.prepare(
        "UPDATE share_links SET last_access_ip = ? WHERE token = ?",
      )
        .bind(accessIp, token)
        .run();
    } else {
      await releaseDownloadSlot(env, token);
    }
  }
  return res;
}
