
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";

export default function Home() {
  const [ipAddress, setIpAddress] = useState<string>("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Fetch local IP from server
    fetch('/api/ip')
      .then(res => res.json())
      .then(data => {
        if (data.ip) {
          setIpAddress(data.ip);
        }
      })
      .catch(err => console.error("Failed to fetch IP:", err));
  }, []);

  if (!mounted) return null;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  // Construct the network URL for players
  // If we have a fetched IP, prefer that over localhost
  const port = typeof window !== 'undefined' ? window.location.port : '3000';
  const playerUrl = ipAddress && ipAddress !== 'localhost' && ipAddress !== '127.0.0.1'
    ? `http://${ipAddress}:${port}/play`
    : `${origin}/play`;

  return (
    <div className="min-h-screen bg-neutral-900 text-white flex flex-col items-center justify-center p-8 font-sans">
      <h1 className="text-6xl font-black mb-12 bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
        СВОЯ ИГРА AI
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl w-full">
        {/* Host/Display Section */}
        <div className="bg-neutral-800 p-8 rounded-2xl border border-neutral-700 hover:border-blue-500 transition-all group">
          <h2 className="text-2xl font-bold mb-4 text-blue-400">Ведущий и Экран</h2>
          <div className="space-y-4">
            <Link
              href="/admin"
              className="block w-full text-center py-4 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold transition-colors"
            >
              Панель Ведущего
            </Link>
            <Link
              href="/display"
              target="_blank"
              className="block w-full text-center py-4 bg-neutral-700 hover:bg-neutral-600 rounded-xl font-bold transition-colors"
            >
              Открыть Экран (Проектор)
            </Link>
          </div>
        </div>

        {/* Player Connection Section */}
        <div className="bg-neutral-800 p-8 rounded-2xl border border-neutral-700 flex flex-col items-center text-center">
          <h2 className="text-2xl font-bold mb-4 text-green-400">Игроки</h2>
          <p className="text-neutral-400 mb-6 text-sm">
            Сканируйте QR-код, чтобы подключиться к игре
          </p>

          <div className="bg-white p-4 rounded-xl mb-4">
            <QRCodeSVG value={playerUrl} size={192} />
          </div>

          <p className="font-mono text-sm bg-neutral-900 px-3 py-1 rounded text-neutral-500">
            {playerUrl}
          </p>
        </div>
      </div>

      {/* Instruction for Localhost */}
      <div className="mt-12 max-w-lg text-center p-4 bg-neutral-800/50 rounded-lg text-neutral-400 text-sm">
        <p>Для подключения используйте телефон в той же Wi-Fi сети</p>
      </div>
    </div>
  );
}
