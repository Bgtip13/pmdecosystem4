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
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const CSS = `
html, body, #root { height: 100%; margin: 0; }
body { background: #E9EDF3; overflow: hidden; }
#root { display: flex; }
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-thumb { background: rgba(16,24,40,0.18); border-radius: 8px; }
::-webkit-scrollbar-track { background: transparent; }
input, textarea, select, button { font-family: inherit; }
* { -webkit-tap-highlight-color: transparent; }
`;
