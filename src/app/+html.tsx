import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

// Shell HTML versi web — tidak dipakai di Android/iOS.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="id">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#D92D20" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
        />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const CSS = `
html, body, #root { height: 100%; margin: 0; }
body {
  background: #F6F2F0;
  color: #1B1513;
  font-family: "Plus Jakarta Sans", "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  overflow: hidden;
}
#root { display: flex; font-family: inherit; }
::-webkit-scrollbar { width: 9px; height: 9px; }
::-webkit-scrollbar-thumb { background: rgba(80, 52, 44, 0.22); border-radius: 9px; }
::-webkit-scrollbar-thumb:hover { background: rgba(80, 52, 44, 0.34); }
::-webkit-scrollbar-track { background: transparent; }
input, textarea, select, button { font-family: inherit; }
::selection { background: #FECDCA; color: #7A1D14; }
* { -webkit-tap-highlight-color: transparent; }
`;
