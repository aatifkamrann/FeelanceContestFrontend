import Markdown from 'react-markdown';

/**
 * The terms of service rendered from their Markdown, one way, wherever they
 * appear: the public /terms page and the acceptance prompt. The same class
 * recipe the opportunity brief uses, so the two documents read as one product.
 */
export default function TermsText({ markdown }: { markdown: string }) {
  return (
    <div className="prose-sm max-w-none [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:mt-1 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
      <Markdown>{markdown}</Markdown>
    </div>
  );
}
