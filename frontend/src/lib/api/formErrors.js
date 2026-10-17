import { ApiError } from './client';

function retryText(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return '';
  const minutes = Math.ceil(value / 60);
  return value < 90 ? ` Try again in ${Math.ceil(value)} seconds.` : ` Try again in about ${minutes} minutes.`;
}

/**
 * Maps a failed API call onto a React Hook Form (W11). 422 VALIDATION_ERROR details for body fields become
 * field errors; everything else becomes a form-level message. Returns { message, requestId } for the form alert
 * (message null when every problem was attached to a field).
 * @param {unknown} error
 * @param {(name: string, error: { type: string, message: string }) => void} setError
 * @param {{ fields?: string[], messages?: Record<string, string> }} options
 *   `fields` = form field names that may receive server errors; `messages` = friendly text per error code.
 */
export function applyApiErrors(error, setError, { fields = [], messages = {} } = {}) {
  if (!(error instanceof ApiError)) return { message: 'Something went wrong. Please try again.', requestId: undefined };
  if (error.code === 'VALIDATION_ERROR' && Array.isArray(error.details)) {
    const unplaced = [];
    for (const detail of error.details) {
      if (detail?.location === 'body' && fields.includes(detail.path)) setError(detail.path, { type: 'server', message: detail.message });
      else unplaced.push(detail?.message);
    }
    return { message: unplaced.length ? 'Please check the highlighted details and try again.' : null, requestId: error.requestId };
  }
  let message = messages[error.code] ?? error.message;
  if (error.status === 429) message += retryText(error.retryAfter);
  return { message, requestId: error.status >= 500 || error.status === 0 ? error.requestId : undefined };
}
