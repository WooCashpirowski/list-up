export function GiphyAttribution() {
  return <div className="flex justify-center" aria-label="Powered by GIPHY">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/giphy-powered-light.png" alt="Powered by GIPHY"
      className="h-5 w-auto dark:hidden" />
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/giphy-powered-dark.png" alt="Powered by GIPHY"
      className="hidden h-5 w-auto dark:block" />
  </div>
}
