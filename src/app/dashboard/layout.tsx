// The page is a client component and cannot carry metadata; the tab title
// lives here so this page is named the way every other page is.
export const metadata = { title: 'Dashboard' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
