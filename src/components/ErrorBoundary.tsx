import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught React error in Zelda game:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6 text-center text-white">
          <div className="max-w-md rounded-2xl border border-emerald-500/30 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-xl">
            <div className="mb-4 text-5xl">🗡️</div>
            <h1 className="mb-2 text-2xl font-bold text-emerald-400">
              Spiel-Wiederherstellung
            </h1>
            <p className="mb-6 text-sm text-slate-300">
              Ein unerwarteter Browser-Fehler ist aufgetreten. Das Spiel kann sofort neu geladen werden.
            </p>
            <button
              onClick={this.handleReset}
              className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-3 text-sm font-bold text-white shadow-lg transition-transform active:scale-95 hover:brightness-110"
            >
              🔄 Spiel Neu Starten
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
