import "./globals.css";
import { SessionProvider } from "next-auth/react";
import Providers from "./providers";

export const metadata = {
  title: "NovaChrono",
  description: "Indoor Football League Management",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <SessionProvider>
          <Providers>{children}</Providers>
        </SessionProvider>
      </body>
    </html>
  );
}
