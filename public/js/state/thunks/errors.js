export function assertApiOk(
  response,
  data,
  fallback,
  humanError,
  { isValid = () => true, allowCompleted = false, allowSuccessFalse = false } = {},
) {
  const acceptedPartial = allowCompleted && data?.completed;
  const acceptedBusinessFailure = allowSuccessFalse || data?.success !== false;
  if (acceptedPartial || (response.ok && acceptedBusinessFailure && isValid(data)))
    return;

  const message =
    typeof humanError === "function"
      ? humanError(response, data, fallback)
      : data?.message || fallback;
  throw new Error(message);
}
