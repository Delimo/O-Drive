export const jsonResponse = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

export function apiError(
  code,
  message,
  status = 400,
  extra = {},
  headers = {},
) {
  return jsonResponse(
    { success: false, code, message, ...extra },
    status,
    headers,
  );
}
