// The pages are client components and cannot carry metadata; the tab title
// lives here so this page — and the return page under it — is named the
// way every other page is.
export const metadata = { title: 'Verify your identity' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
