'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Practice from '@/components/Practice';
import type { Mode } from '@/lib/engine';

function Inner() {
  const q = useSearchParams().get('mode');
  const mode: Mode = q === 'pro' || q === 'hulp' ? q : 'training';
  return <Practice mode={mode} />;
}

export default function Page() {
  return <Suspense><Inner /></Suspense>;
}
