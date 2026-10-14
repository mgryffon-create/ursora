import React, { Component } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider } from '@/contexts/AuthContext';
import { ExplanationProvider } from '@/contexts/ExplanationContext';
import Index from './pages/Index';
import NotFound from './pages/NotFound';

const queryClient = new QueryClient();

class RootErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('URSORA root render failed', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#0b0d10] p-6 text-zinc-100">
          <div className="mx-auto max-w-3xl rounded-md border border-red-500/40 bg-red-500/[0.06] p-4">
            <div className="font-mono text-xs uppercase tracking-wider text-red-300">URSORA render error</div>
            <div className="mt-2 break-words font-mono text-sm text-zinc-200">{this.state.error.message}</div>
            {this.state.error.stack && (
              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-[10px] leading-relaxed text-zinc-500">{this.state.error.stack}</pre>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-3 rounded-sm border border-zinc-700 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-300"
            >
              Reload URSORA
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const App = () => (
  <RootErrorBoundary>
  <ThemeProvider defaultTheme="dark">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          {/* Explanation level is presentation only — it never touches a score. */}
          <ExplanationProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </ExplanationProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
  </RootErrorBoundary>
);

export default App;
