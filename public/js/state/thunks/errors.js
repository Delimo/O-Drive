export function assertApiOk(
  response,
  data,
  fallback,
  humanError,
  { isValid = () => true, allowCompleted = false } = {},
) {
  const acceptedPartial = allowCompleted && data?.completed;
  if (acceptedPartial || (response.ok && data?.success !== false && isValid(data)))
    return;

  const message =
    typeof humanError === "function"
      ? humanError(response, data, fallback)
      : data?.message || fallback;
  throw new Error(message);
}
