'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { createClient } from '@/src/lib/supabase/clients';

type Banner = {
  id: string;
  title: string;
  image_url: string;
  target_url?: string;
};

const DEFAULT_BANNERS: Banner[] = [
  {
    id: 'demo-1',
    title: 'You&Me — Communication sécurisée & haute définition',
    image_url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=800&auto=format&fit=crop',
    target_url: '#',
  },
  {
    id: 'demo-2',
    title: 'Abonnement Premium — Profitez d’une expérience 100% Sans Pub',
    image_url: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?q=80&w=800&auto=format&fit=crop',
    target_url: '#',
  },
];

export function BannerCarousel() {
  const [banners, setBanners] = useState<Banner[]>(DEFAULT_BANNERS);
  const [currentIndex, setCurrentIndex] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    const fetchBanners = async () => {
      try {
        const { data, error } = await supabase
          .from('banners')
          .select('*')
          .eq('active', true);

        if (!error && data && data.length > 0) {
          setBanners(data);
        }
      } catch {
        // En cas d'erreur réseau, conserve les bannières par défaut
      }
    };
    fetchBanners();
  }, [supabase]);

  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [banners]);

  const current = banners[currentIndex];

  return (
    <div className="w-full max-w-md mx-auto overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl relative">
      <a
        href={current.target_url || '#'}
        target="_blank"
        rel="noopener noreferrer"
        className="block relative h-36 w-full group"
      >
        <Image
          src={current.image_url}
          alt={current.title}
          fill
          loading={currentIndex === 0 ? 'eager' : 'lazy'}
          unoptimized
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent p-3 flex items-end justify-between">
          <span className="text-[11px] font-semibold text-white bg-slate-900/90 backdrop-blur px-2.5 py-1 rounded-full border border-slate-700 truncate max-w-[240px]">
            📢 {current.title}
          </span>
          <div className="flex gap-1">
            {banners.map((_, idx) => (
              <span
                key={idx}
                className={`h-1.5 rounded-full transition-all ${
                  idx === currentIndex ? 'w-5 bg-indigo-500' : 'w-1.5 bg-slate-600'
                }`}
              />
            ))}
          </div>
        </div>
      </a>
    </div>
  );
}