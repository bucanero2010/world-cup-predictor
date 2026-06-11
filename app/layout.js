import "./globals.css";

export const metadata = {
  title: "World Cup Predictor",
  description: "Pick the scoreline that maximizes your expected Superbru points",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
