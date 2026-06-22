const MAX_BODY_SIZE = 512 * 1024;
const MAX_UPLOAD_BODY_SIZE = 100 * 1024 * 1024;

export function getMaxBodySize(isUpload = false) {
  return isUpload ? MAX_UPLOAD_BODY_SIZE : MAX_BODY_SIZE;
}

export function assertBodySize(request, isUpload = false) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  const limit = getMaxBodySize(isUpload);
  if (contentLength > limit) {
    const err = new Error(
      `Request body too large (${contentLength} > ${limit})`,
    );
    err.status = 413;
    throw err;
  }
}

export function parseCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}
