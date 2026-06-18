import "./globals.css";
import ServiceWorker from "@/components/ServiceWorker.jsx";
import { GameProvider } from "@/components/GameContext.jsx";

export const metadata = {
  title: "World Cup Predictor",
  description: "Pick the scoreline that maximizes your expected Superbru points",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "WC Predictor",
  },
};

export const viewport = {
  themeColor: "#1f6b3b",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap"
          rel="stylesheet"
        />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>
        <GameProvider>{children}</GameProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
