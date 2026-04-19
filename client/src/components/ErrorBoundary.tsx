import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Copy } from 'lucide-react';

interface Props {
  children: ReactNode;
  label?: string;
  isolate?: boolean;
}

interface State {
  hasError: boolean;
  error: unknown;
  errorInfo: ErrorInfo | null;
}

function describeError(error: unknown): { name: string; message: string; stack: string } {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message || '(no message)',
      stack: error.stack || '',
    };
  }
  if (error === null || error === undefined) {
    return { name: 'UnknownError', message: `Thrown value was ${String(error)}`, stack: '' };
  }
  if (typeof error === 'string') {
    return { name: 'StringError', message: error, stack: '' };
  }
  try {
    return { name: 'NonErrorThrown', message: JSON.stringify(error), stack: '' };
  } catch {
    return { name: 'NonErrorThrown', message: String(error), stack: '' };
  }
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    const info = describeError(error);
    console.error(
      `[ErrorBoundary${this.props.label ? `:${this.props.label}` : ''}]`,
      info.name,
      info.message,
      '\n',
      info.stack,
      '\nComponent stack:',
      errorInfo.componentStack
    );
    this.setState({ errorInfo });
  }

  private copyDiagnostic = () => {
    const info = describeError(this.state.error);
    const payload = [
      `Location: ${this.props.label || 'app-root'}`,
      `URL: ${typeof window !== 'undefined' ? window.location.href : ''}`,
      `${info.name}: ${info.message}`,
      '',
      'Stack:',
      info.stack,
      '',
      'Component stack:',
      this.state.errorInfo?.componentStack || '',
    ].join('\n');
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(payload).catch(() => {});
    }
  };

  render() {
    if (this.state.hasError) {
      const info = describeError(this.state.error);
      const isolated = this.props.isolate;
      return (
        <div
          className={
            isolated
              ? 'flex items-center justify-center p-4'
              : 'min-h-screen flex items-center justify-center p-4'
          }
        >
          <Card className="max-w-2xl w-full">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-destructive" />
                <CardTitle>Something went wrong{this.props.label ? ` in ${this.props.label}` : ''}</CardTitle>
              </div>
              <CardDescription>
                {info.name}: {info.message}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {info.stack && (
                <div>
                  <div className="text-xs font-medium mb-1 text-muted-foreground">Stack</div>
                  <pre className="p-3 bg-muted rounded-md text-[10px] leading-snug overflow-auto max-h-60 whitespace-pre-wrap break-words">
                    {info.stack}
                  </pre>
                </div>
              )}
              {this.state.errorInfo?.componentStack && (
                <div>
                  <div className="text-xs font-medium mb-1 text-muted-foreground">Component stack</div>
                  <pre className="p-3 bg-muted rounded-md text-[10px] leading-snug overflow-auto max-h-40 whitespace-pre-wrap break-words">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={this.copyDiagnostic}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy diagnostic
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    if (isolated) {
                      this.setState({ hasError: false, error: null, errorInfo: null });
                    } else {
                      window.location.reload();
                    }
                  }}
                >
                  {isolated ? 'Retry' : 'Refresh page'}
                </Button>
                {isolated && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (typeof window !== 'undefined') window.location.href = '/dashboard';
                    }}
                  >
                    Go to dashboard
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
