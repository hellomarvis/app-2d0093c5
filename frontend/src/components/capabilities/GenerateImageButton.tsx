// PLATFORM-OWNED — the "generate an image" trigger. Provider-agnostic: it posts
// to the capability route, which calls whichever image provider the owner has
// chosen. Switching providers changes nothing here.
//
// Staged verbatim, then IMPORTED AND WIRED by the agent at this app's real
// image moment. Deliberately GENERIC — it knows nothing about Recipe/Listing/
// Post or whatever this app calls its records; the caller composes `prompt`
// from real record data.
//
// One click generates one image. It disables itself while in flight because
// generation bills the app owner, and it renders NOTHING but a calm inline
// notice when the owner has not supplied a key — so it is safe to mount
// unconditionally.
//
// The returned `url` is the app's OWN permanent URL: persist it on the record.
// Do not call /api/capabilities/image-gen/generate yourself.
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { apiClient, ApiError } from '@/lib/apiClient';

export type GeneratedImageSize =
  | 'square_hd'
  | 'square'
  | 'portrait_4_3'
  | 'portrait_16_9'
  | 'landscape_4_3'
  | 'landscape_16_9';

export interface GeneratedImageResult {
  url: string;
  width: number;
  height: number;
  contentType: string;
  seed: number | null;
  model: string;
  /** false → the URL is the provider's own copy (or a data URL) and may stop working. */
  stored: boolean;
}

export interface GenerateImageButtonProps {
  /** The exact prompt — the caller composes it from this app's real record. */
  prompt: string;
  /**
   * Pictures the OUTPUT MUST CONTAIN — the user's uploaded photo, the garment,
   * the room, the product. Public URLs (what this app's upload route returns),
   * at most 4.
   *
   * Set it whenever this feature is "do something with the image I gave you".
   * `prompt` then instructs the model about them instead of describing them.
   * Leaving it unset does not produce a worse version of the same picture — it
   * produces a different subject entirely, and the app cannot tell.
   *
   * While any entry is empty the button stays disabled: generating before the
   * user's upload has landed would bill for a picture of the wrong thing.
   */
  imageUrls?: string[];
  /** Aspect preset. Omit for landscape_4_3. */
  imageSize?: GeneratedImageSize;
  label?: string;
  className?: string;
  disabled?: boolean;
  /** Show the generated image under the button. Turn off when the caller renders it. */
  showPreview?: boolean;
  /** Called once the image is ready — PERSIST `result.url` on the record here. */
  onReady?: (result: GeneratedImageResult) => void;
  /** Called for failures this component does not render inline itself. */
  onError?: (message: string) => void;
}

export function GenerateImageButton({
  prompt,
  imageUrls,
  imageSize,
  label = 'Generate image',
  className,
  disabled,
  showPreview = true,
  onReady,
  onError,
}: GenerateImageButtonProps) {
  const [loading, setLoading] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [image, setImage] = useState<GeneratedImageResult | null>(null);

  // A declared-but-not-yet-uploaded reference (undefined/'' while the upload
  // is in flight) must not reach the server: it would be dropped and the owner
  // would pay for a generation of the wrong subject.
  const referencesPending = imageUrls !== undefined && imageUrls.some((u) => !u?.trim());

  const generate = async (): Promise<void> => {
    if (!prompt.trim() || loading || referencesPending) return;
    setLoading(true);
    setInlineError(null);
    try {
      const result = await apiClient.post<GeneratedImageResult>('/api/capabilities/image-gen/generate', {
        prompt,
        imageUrls,
        imageSize,
      });
      setImage(result);
      onReady?.(result);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message // the server's own wording, including "not configured yet"
          : 'Could not generate the image. Try again.';
      setInlineError(message);
      onError?.(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={className}>
      <Button type="button" onClick={generate} disabled={disabled || loading || referencesPending || !prompt.trim()}>
        {loading ? 'Generating…' : label}
      </Button>
      {showPreview && image && (
        <img
          src={image.url}
          alt={prompt}
          className="mt-2 w-full rounded-md border"
          loading="lazy"
        />
      )}
      {inlineError && <p className="mt-1 text-sm text-muted-foreground">{inlineError}</p>}
    </div>
  );
}

export default GenerateImageButton;
