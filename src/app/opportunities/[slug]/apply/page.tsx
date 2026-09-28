import ApplyScreen from './ApplyScreen';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Apply for competition' };

/**
 * The eight steps of applying to compete in one opportunity. The screen reads
 * everything with the viewer's cookie on the client, like the welcome
 * page: it is the viewer's own profile against this brief, and nothing
 * on it is for anybody else.
 */
export default async function ApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ApplyScreen slug={slug} />;
}
