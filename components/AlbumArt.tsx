import Image from "next/image";

/** Square album cover with a neutral placeholder when Spotify gave no image. */
export function AlbumArt({ url, size, className = "" }: { url: string | null; size: number; className?: string }) {
  if (!url) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`shrink-0 rounded bg-raised ${className}`}
        aria-hidden
      />
    );
  }
  return (
    <Image
      src={url}
      alt=""
      width={size}
      height={size}
      unoptimized
      className={`shrink-0 rounded object-cover ${className}`}
    />
  );
}
