import Alert from '@/components/feedback/Alert';

/**
 * Form-level result of a failed submit: the message, plus the request reference for server errors (W11).
 * @param {{ message?: string|null, requestId?: string }} props
 */
export default function FormMessage({ message, requestId }) {
  if (!message) return null;
  return (
    <Alert tone="danger">
      {message}
      {requestId ? <span className="mt-1 block text-xs text-muted">Reference: {requestId}</span> : null}
    </Alert>
  );
}
