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
        {/* Inter = pengganti lintas-OS untuk font iOS (SF Pro) & Samsung One.
            Perangkat Samsung/Apple tetap memakai font aslinya lebih dulu — lihat FONT di
            src/components/desktop/tokens.ts. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
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
  font-family: "Samsung One", "SamsungOne", "Samsung One UI", -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", Inter, "Segoe UI Variable Text", "Segoe UI", system-ui, Roboto, "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  overflow: hidden;
  font-feature-settings: "liga" 1, "calt" 1;
}
h1, h2, h3, h4, h5, h6, p { font-family: inherit; }
#root { display: flex; font-family: inherit; }
::-webkit-scrollbar { width: 9px; height: 9px; }
::-webkit-scrollbar-thumb { background: rgba(80, 52, 44, 0.22); border-radius: 9px; }
::-webkit-scrollbar-thumb:hover { background: rgba(80, 52, 44, 0.34); }
::-webkit-scrollbar-track { background: transparent; }
input, textarea, select, button { font-family: inherit; }
::selection { background: #FECDCA; color: #7A1D14; }
* { -webkit-tap-highlight-color: transparent; }
`;
