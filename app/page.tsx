import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/snapshot/compare?ids=256,220,250,268&period=7d');
}
