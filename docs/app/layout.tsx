import type { Metadata } from 'next';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { Manrope } from 'next/font/google';
import { Header } from '@/components/header';
import { siteConfig } from '@/lib/layout.shared';
import './global.css';
import { Analytics } from '@vercel/analytics/next';

const manrope = Manrope({
  subsets: ['latin'],
  weight: ["400", "500", "600", "700"],
  variable: '--font-manrope',
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: siteConfig.title,
    template: `%s | ${siteConfig.title}`,
  },
  description: siteConfig.description,
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: `${siteConfig.title}`,
    description: siteConfig.description,
    url: "https://docs.afferlab.com",
    siteName: siteConfig.title,
    images: [
      {
        url: "/OG_image.png", // 你已经有这个 ✅
        width: 1200,
        height: 630,
        alt: `${siteConfig.title} Documentation`,
      },
    ],
    locale: "en_US",
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.title}`,
    description: siteConfig.description,
    images: ["/OG_image.png"],
  },
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={manrope.variable} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col pt-[var(--afferlab-header-height)] font-sans">
        <RootProvider>
          <Header />
          {children}
          <Analytics />
        </RootProvider>
      </body>
    </html>
  );
}
