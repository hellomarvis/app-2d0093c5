import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { APP_GLYPH, APP_NAME, APP_TAGLINE } from '@/brand';
import type { FunctionComponent } from '@/common/types';

// The public front door. Kept deliberately minimal per the product brief —
// a door, not a marketing site: headline, what the product is, and a way in.
export const Landing = (): FunctionComponent => {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-16 sm:px-6">
      <img
        src="/generated/hero-bg.png"
        alt="Collaboration workspace backdrop"
        loading="eager"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, color-mix(in oklab, var(--background) 72%, transparent), var(--background) 92%)' }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-col items-center text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-primary text-2xl font-black text-primary-foreground shadow-[0_0_0_8px_color-mix(in_oklab,var(--primary)_14%,transparent)]">
          {APP_GLYPH}
        </span>
        <h1 className="mt-6 font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl">{APP_NAME}</h1>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">
          Everything you talk about, in one place. {APP_TAGLINE}
        </p>
        <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Button asChild size="lg" className="min-h-12 w-full sm:w-auto">
            <Link to="/signup">Create account</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="min-h-12 w-full sm:w-auto">
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    </div>
  );
};
