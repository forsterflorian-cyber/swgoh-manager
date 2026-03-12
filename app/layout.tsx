import { SessionProvider } from '@/components/layout/SessionProvider';
import './globals.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body className="bg-gray-950 text-white">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
