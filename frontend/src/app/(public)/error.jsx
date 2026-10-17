'use client';

import Container from '@/components/layout/Container';
import ErrorState from '@/components/feedback/ErrorState';

// Public pages keep the site header and footer when something fails; only the page area shows the error.
// The digest is a support reference; the error message itself (possibly server detail) is never shown.
export default function PublicError({ error, reset }) {
  return (
    <Container className="py-16">
      <ErrorState
        headingLevel={2}
        title="This page could not be loaded"
        description="The service may be busy. Please try again in a moment."
        requestId={error?.digest}
        onRetry={() => reset()}
      />
    </Container>
  );
}
