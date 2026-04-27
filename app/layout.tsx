import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BookStore - Intelligent Book Recommendation',
  description: 'Agentic RAG-powered personalized book recommendations',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
