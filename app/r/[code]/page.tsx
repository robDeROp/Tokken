'use client';
import { use } from 'react';
import Room from '@/components/Room';

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  return <Room code={code.toUpperCase()} />;
}
