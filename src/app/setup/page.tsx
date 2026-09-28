import { redirect } from 'next/navigation';
import { getSetupStatus } from '@/lib/api';
import SetupWizard from './SetupWizard';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Setup' };

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const status = await getSetupStatus();
  if (status?.completed) redirect('/');
  const { token } = await searchParams;
  return <SetupWizard initialToken={token ?? ''} apiDown={status === null} />;
}
