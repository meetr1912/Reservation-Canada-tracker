import React from 'react';
import { XCircle, RotateCcw } from 'lucide-react';

import { Card, CardContent } from './ui/card';

// Keeps one broken section (e.g. a malformed calendar month) from blanking the
// whole app. Strings are passed in so the caller can localize them.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Section crashed:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    const { title = 'Something went wrong', body = 'This section failed to render.', actionLabel = 'Reload' } = this.props;
    return (
      <Card className="border-0 shadow-sm" data-testid="error-boundary">
        <CardContent className="p-8 text-center">
          <XCircle className="mx-auto mb-3 h-10 w-10 text-red-400" />
          <p className="font-semibold text-gray-900">{title}</p>
          <p className="mt-1 text-sm text-gray-500">{body}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            <RotateCcw className="h-4 w-4" /> {actionLabel}
          </button>
        </CardContent>
      </Card>
    );
  }
}

export default ErrorBoundary;
