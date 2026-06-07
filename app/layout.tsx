import type { Metadata } from 'next';
import { Inter, Outfit } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const outfit = Outfit({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-outfit',
});

export const metadata: Metadata = {
  title: 'BookStore - 智能图书推荐系统',
  description: '基于 Agentic RAG 的个性化智能图书推荐系统',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className={`${inter.variable} ${outfit.variable} scroll-smooth`}>
      <body className="antialiased min-h-screen text-slate-100 bg-[#070a13]">{children}</body>
    </html>
  );
}
