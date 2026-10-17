// Error type and envelope helpers shared by the BFF. Every BFF response uses the backend envelope (P4) so the
// browser handles one format: { success: false, error: { code, message, details?, requestId } }.

export class BffError extends Error {
  constructor({ status, code, message, details, requestId }) {
    super(message);
    this.name = 'BffError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  /** Builds an error from a backend error envelope (or a non-JSON failure). */
  static fromBackend(status, envelope, requestId) {
    const error = envelope?.error;
    if (error?.code) {
      return new BffError({ status, code: error.code, message: error.message, details: error.details, requestId: error.requestId ?? requestId });
    }
    return new BffError({ status: status >= 500 ? 502 : status, code: 'UPSTREAM_ERROR', message: 'The service returned an unexpected response.', requestId });
  }
}

export function errorBody({ code, message, details, requestId }) {
  return { success: false, error: { code, message, ...(details === undefined ? {} : { details }), requestId } };
}

export function jsonError(status, code, message, requestId, details) {
  return Response.json(errorBody({ code, message, details, requestId }), { status });
}

/** Converts anything thrown inside a BFF handler into an envelope response; unexpected errors are logged. */
export function errorResponse(error, requestId) {
  if (error instanceof BffError) {
    const headers = error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : undefined;
    return Response.json(errorBody({ ...error, message: error.message, requestId: error.requestId ?? requestId }), { status: error.status, headers });
  }
  console.error(JSON.stringify({ level: 'error', msg: 'bff.unhandled', requestId, error: error?.name, message: error?.message }));
  return jsonError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.', requestId);
}
