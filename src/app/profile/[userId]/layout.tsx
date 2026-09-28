import { brandedTitle } from '@/lib/metadata';

// Somebody else's profile, so the tab cannot say "Your profile" — which is
// what this page would otherwise inherit from the editor's layout above it.
// The member's own name would need their profile, and that is members-only:
// a visitor would be naming somebody the page will not show them.
//
// Named in full, because that same parent title is a plain string: it
// replaces the root layout's title template for everything under it, so
// there is no template here to add the portal's name.
export const generateMetadata = () => brandedTitle('Member profile');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
