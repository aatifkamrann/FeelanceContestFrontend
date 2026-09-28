import { brandedTitle } from '@/lib/metadata';

// Its own title, rather than "Notifications" inherited from the settings
// page above it: this one is opened from an email, by somebody who wants
// out of one kind of message and should see that in the tab.
//
// Named in full, because that parent title is a plain string: it replaces
// the root layout's title template for everything under it, so there is no
// template here to add the portal's name.
export const generateMetadata = () => brandedTitle('Unsubscribe');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
