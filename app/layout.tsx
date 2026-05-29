import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DOTA 2 — Прогноз матча',
  description:
    'Анализ live-матчей Dota 2: статистика турниров, форма команд, винрейты героев и взвешенная модель прогноза.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Unbounded:wght@300;400;500;700;900&family=Onest:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-noise antialiased">{children}</body>
    </html>
  );
}
