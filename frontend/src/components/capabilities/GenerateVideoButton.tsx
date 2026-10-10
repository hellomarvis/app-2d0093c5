// PLATFORM-OWNED — the video generation trigger. Provider-agnostic: it posts
// to the capability route, which submits to whichever video provider the owner
// has chosen. Switching providers changes nothing here.
//
// Staged verbatim, then IMPORTED AND WIRED by the agent at this app's real
// "make a video of this" moment. Deliberately GENERIC — it knows nothing about
// Listing/Recipe/Course or whatever this app calls its records; the CALLER
// composes `prompt` from real record data.
//
// ONE CLICK, ONE CLIP. The button disables itself while a job is in flight and
// after a success, because every clip bills the app owner and a double-click is
// a second charge. Nothing here retries automatically.
//
// It owns the POLLING too. Generation takes minutes and the backend returns 202
// immediately, so this component walks the job to completion and hands the
// finished clip to `onReady`.
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { apiClient, ApiError } from '@/lib/apiClient';

export interface VideoJob {
  id: string;
  status: 'pending' | 'ready' | 'failed';
  prompt: string;
  videoUrl: string | null;
  durationSecs: number;
  aspectRatio: string;
  errorMessage: string | null;
  createdAt: string;
}

export interface GenerateVideoButtonProps {
  /** The exact prompt — composed by the caller from THIS app's real record. Describe sound as well as picture. */
  prompt: string;
  /** Optional still to animate — a product photo, cover art, an uploaded frame. */
  imageUrl?: string;
  /** 4, 6 or 8 seconds. Defaults to 8. */
  durationSecs?: 4 | 6 | 8;
  /** '16:9' for landscape, '9:16' for vertical/social. Defaults to 16:9. */
  aspectRatio?: '16:9' | '9:16';
  label?: string;
  className?: string;
  disabled?: boolean;
  /** Fires once, when the clip is finished and playable. */
  onReady?: (job: VideoJob) => void;
  /** Called for failures this component does not render inline itself. */
  onError?: (message: string) => void;
}

const ROUTE = '/api/capabilities/video-gen';
/** Generation takes minutes; polling faster just burns requests. */
const POLL_MS = 10_000;
/** Give up watching after this long. The job is not cancelled — it is still in
 *  the user's history — we simply stop holding the UI hostage. */
const POLL_TIMEOUT_MS = 8 * 60 * 1000;

export function GenerateVideoButton({
  prompt,
  imageUrl,
  durationSecs = 8,
  aspectRatio = '16:9',
  label = 'Generate video',
  className,
  disabled,
  onReady,
  onError,
}: GenerateVideoButtonProps) {
  const [state, setState] = useState<'idle' | 'submitting' | 'generating' | 'done'>('idle');
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  /** Map a backend failure to copy a person can act on. */
  const describe = (err: unknown): string => {
    if (err instanceof ApiError) {
      if (err.status === 503) return ''; // not-configured, handled separately
      return err.message || 'Could not generate the video.';
    }
    return 'Could not generate the video.';
  };

  const poll = (jobId: string, deadline: number): void => {
    timer.current = setTimeout(async () => {
      if (!mounted.current) return;
      try {
        const job = await apiClient.get<VideoJob>(`${ROUTE}/jobs/${jobId}`);
        if (!mounted.current) return;
        if (job.status === 'ready') {
          setState('done');
          onReady?.(job);
          return;
        }
        if (job.status === 'failed') {
          setState('idle');
          const message = job.errorMessage || 'Video generation failed.';
          setInlineError(message);
          onError?.(message);
          return;
        }
        if (Date.now() > deadline) {
          setState('idle');
          setInlineError('This is taking longer than usual — check back in a few minutes.');
          return;
        }
        poll(jobId, deadline);
      } catch (err) {
        if (!mounted.current) return;
        // A transient blip should not kill a job the owner already paid for.
        if (Date.now() > deadline) {
          setState('idle');
          const message = describe(err) || 'Lost track of the video.';
          setInlineError(message);
          onError?.(message);
          return;
        }
        poll(jobId, deadline);
      }
    }, POLL_MS);
  };

  const start = async (): Promise<void> => {
    setInlineError(null);
    setNotConfigured(false);
    setState('submitting');
    try {
      const job = await apiClient.post<{ id: string; status: string }>(`${ROUTE}/generate`, {
        prompt,
        ...(imageUrl ? { imageUrl } : {}),
        durationSecs,
        aspectRatio,
      });
      setState('generating');
      poll(job.id, Date.now() + POLL_TIMEOUT_MS);
    } catch (err) {
      setState('idle');
      if (err instanceof ApiError && err.status === 503) {
        setNotConfigured(true);
        return;
      }
      const message = describe(err);
      setInlineError(message);
      onError?.(message);
    }
  };

  // The owner has not supplied a key: a calm inline notice, not an error state.
  if (notConfigured) {
    return <p className={`text-sm text-muted-foreground ${className ?? ''}`}>Video generation isn’t configured yet.</p>;
  }

  const busy = state === 'submitting' || state === 'generating';

  return (
    <div className={className}>
      <Button type="button" onClick={start} disabled={disabled || busy || state === 'done' || !prompt.trim()}>
        {state === 'submitting' && 'Starting…'}
        {state === 'generating' && 'Generating video…'}
        {state === 'done' && 'Video ready'}
        {state === 'idle' && label}
      </Button>
      {state === 'generating' && (
        <p className="mt-2 text-sm text-muted-foreground">This usually takes a couple of minutes. You can keep using the page.</p>
      )}
      {inlineError && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {inlineError}
        </p>
      )}
    </div>
  );
}

export default GenerateVideoButton;
