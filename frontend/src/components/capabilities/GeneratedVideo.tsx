// PLATFORM-OWNED — the generated-video playback surface. Provider-agnostic.
//
// Staged verbatim, then placed by the agent wherever this app displays the
// record the clip belongs to. Renders one generated video and nothing else —
// no card chrome, no heading — so it drops into an existing layout.
//
// AUDIO IS NOT OPTIONAL HERE. Some providers render a synchronized audio track,
// so `controls` is always on and the video is NEVER muted by default. It also
// never autoplays.
import { useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import type { VideoJob } from './GenerateVideoButton';

export interface GeneratedVideoProps {
  /** Either a finished job (from GenerateVideoButton's `onReady`) or a `jobId` to resolve — the second form is what a page rendering a stored record wants. */
  job?: VideoJob;
  jobId?: string;
  className?: string;
  /** Poster frame shown before playback — usually the source image. */
  posterUrl?: string;
}

const ROUTE = '/api/capabilities/video-gen';
/** Matches GenerateVideoButton: a pending job is still worth watching. */
const POLL_MS = 10_000;

export function GeneratedVideo({ job, jobId, className, posterUrl }: GeneratedVideoProps) {
  const [resolved, setResolved] = useState<VideoJob | null>(job ?? null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    setResolved(job ?? null);
  }, [job]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    const id = jobId ?? resolved?.id;
    if (!id) return;
    if (resolved && resolved.status !== 'pending') return;

    let cancelled = false;
    const tick = async (): Promise<void> => {
      try {
        const next = await apiClient.get<VideoJob>(`${ROUTE}/jobs/${id}`);
        if (cancelled || !mounted.current) return;
        setResolved(next);
        if (next.status === 'pending') timer.current = setTimeout(tick, POLL_MS);
      } catch {
        if (cancelled || !mounted.current) return;
        setError('Could not load this video.');
      }
    };
    void tick();

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
    // Keyed on the id alone — re-running on every `resolved` change would
    // restart the poll loop on each tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, resolved?.id]);

  if (error) {
    return (
      <p className={`text-sm text-destructive ${className ?? ''}`} role="alert">
        {error}
      </p>
    );
  }
  if (!resolved) return null;

  if (resolved.status === 'pending') {
    return (
      <div className={`flex aspect-video w-full items-center justify-center rounded-md bg-muted ${className ?? ''}`} role="status" aria-live="polite">
        <p className="text-sm text-muted-foreground">Generating video…</p>
      </div>
    );
  }

  if (resolved.status === 'failed' || !resolved.videoUrl) {
    return <p className={`text-sm text-muted-foreground ${className ?? ''}`}>{resolved.errorMessage || 'This video could not be generated.'}</p>;
  }

  return (
    <figure className={className}>
      <video
        src={resolved.videoUrl}
        poster={posterUrl}
        controls
        playsInline
        preload="metadata"
        className={`w-full rounded-md ${resolved.aspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-video'}`}
      >
        <a href={resolved.videoUrl}>Download the video</a>
      </video>
      {resolved.errorMessage && <figcaption className="mt-1 text-xs text-muted-foreground">{resolved.errorMessage}</figcaption>}
    </figure>
  );
}

export default GeneratedVideo;
