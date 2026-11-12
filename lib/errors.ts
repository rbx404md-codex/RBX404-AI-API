export class ApiError extends Error {
  status: number;
  code: string;
  type: string;
  param: string | null;
  headers: Record<string, string>;
  constructor(
    status: number,
    code: string,
    message: string,
    type = "invalid_request_error",
    param: string | null = null,
    headers: Record<string, string> = {},
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.type = type;
    this.param = param;
    this.headers = headers;
  }
}

export const errors = {
  missingAuth: () => new ApiError(401, "missing_api_key", "Missing API key. Send 'Authorization: Bearer <key>' or 'x-api-key'.", "authentication_error"),
  invalidAuth: () => new ApiError(401, "invalid_api_key", "Invalid API key.", "authentication_error"),
  unsupportedModel: (m: string) => new ApiError(400, "model_not_found", `Model '${m}' is not available.`, "invalid_request_error", "model"),
  invalid: (msg: string, param: string | null = null) => new ApiError(400, "invalid_request", msg, "invalid_request_error", param),
  tooLarge: () => new ApiError(413, "request_too_large", "Request body is too large.", "invalid_request_error"),
  rateLimited: (retryAfter: number) =>
    new ApiError(429, "rate_limit_exceeded", "Rate limit exceeded. Try again later.", "rate_limit_error", null, { "Retry-After": String(retryAfter) }),
  upstreamAuth: () => new ApiError(502, "upstream_auth_error", "Upstream provider authentication failed. Contact the API operator.", "api_error"),
  upstream: (msg = "Upstream provider error.") => new ApiError(502, "upstream_error", msg, "api_error"),
  timeout: () => new ApiError(504, "upstream_timeout", "Upstream request timed out.", "api_error"),
  network: () => new ApiError(502, "upstream_unreachable", "Could not reach the upstream provider.", "api_error"),
  internal: () => new ApiError(500, "internal_error", "Internal server error.", "server_error"),
};

export function toApiError(e: unknown): ApiError {
  return e instanceof ApiError ? e : errors.internal();
}
