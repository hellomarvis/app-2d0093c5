# Design kit — landing-page recipes (Tailwind v4, token-driven)

Adapt these patterns; don't invent structure from scratch, and don't copy them
verbatim without fitting the product. Every color comes from the tokens
(`bg-primary`, `text-primary-foreground`, `bg-muted`, …) — never hardcode hex.
The font is already set; never import another.

**The craft utilities are pre-built in `src/styles/tailwind.css`** — most
recipes below are now one class instead of hand-rolled CSS: `wash` (layered
hero gradient + grain), `band` (tinted section), `eyebrow` (kicker label),
`shadow-card` / `shadow-float` / `lift` (depth + hover), `rise rise-1..3`
(staggered entrance), `font-display` (display serif — h1/h2 get it
automatically). The Landing skeleton already assembles them — keep its
classes, replace its content. Use the same utilities on AUTHED pages too:
one product, one voice.

**The bar:** a landing page a designer would stop scrolling for. Three+
sections minimum: hero → product-mapped content → how-it-works / closing CTA.
A bare data grid or a headline floating in whitespace is a failed landing page.
**See `reference-landing.html` in this folder** — a self-contained page showing
the expected level assembled (open it in a browser or read the markup). It uses
plain CSS custom properties; ADAPT its structure/depth/motion to this app's
Tailwind tokens — do not copy its palette.

---

## Recipe 1 — Gradient-wash hero with staggered reveal

Layered depth instead of a flat band: a soft radial gradient from the primary
color, oversized display type, dual CTAs, and a live stat when the product has
one. Structure:

```tsx
<section className="relative overflow-hidden">
  {/* gradient wash — token-derived, never a hardcoded hex */}
  <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_0%,--theme(--color-primary/14%),transparent)]" />
  <div className="relative mx-auto max-w-5xl px-6 pt-24 pb-20 text-center">
    <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm text-muted-foreground">
      {/* eyebrow: one-line category or social proof */}
    </span>
    <h1 className="mt-6 text-5xl font-bold tracking-tight sm:text-6xl">
      {/* headline: the outcome, not the category */}
    </h1>
    <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
      {/* one-line value proposition from brand.ts APP_TAGLINE or the brief */}
    </p>
    <div className="mt-8 flex justify-center gap-3">
      <Button size="lg" asChild><Link to="/signup">{/* primary CTA */}</Link></Button>
      <Button size="lg" variant="outline" asChild><Link to="…">{/* secondary */}</Link></Button>
    </div>
  </div>
</section>
```

Animation: add a CSS-only reveal (`@keyframes rise { from { opacity:0;
transform: translateY(12px) } }`) applied with increasing `animation-delay`
(0/100/200ms) to eyebrow → h1 → p → CTAs. Subtle beats flashy.

## Recipe 2 — Stat band / social proof strip

Directly under the hero. 3–4 figures that the product can truthfully show
(counts from the seeded data are fine: "120+ studios listed").

```tsx
<section className="border-y bg-muted/40">
  <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-6 py-10 sm:grid-cols-4">
    {/* per stat: */}
    <div className="text-center">
      <div className="text-3xl font-bold text-primary">120+</div>
      <div className="mt-1 text-sm text-muted-foreground">Studios listed</div>
    </div>
  </div>
</section>
```

## Recipe 3 — Product-mapped content section

Map to what the product IS: featured listings for a marketplace, a preview
grid for a gallery, a sample dashboard card for an analytics tool. Use real
seeded data via the API — an empty landing section reads as a broken product.
Cards: `rounded-xl border bg-card shadow-sm transition hover:-translate-y-0.5
hover:shadow-md` — the hover lift is the difference between static and alive.

## Recipe 4 — How it works (3 steps)

```tsx
<section className="mx-auto max-w-5xl px-6 py-20">
  <h2 className="text-center text-3xl font-bold">How it works</h2>
  <div className="mt-12 grid gap-8 sm:grid-cols-3">
    {/* per step: numbered circle in primary tint, title, one sentence */}
    <div className="text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">1</div>
      <h3 className="mt-4 font-semibold">{/* verb-first step title */}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{/* one sentence */}</p>
    </div>
  </div>
</section>
```

## Recipe 5 — Closing CTA band

Full-width, primary-colored, one sentence + one button. This is the section
that makes the page feel finished.

```tsx
<section className="bg-primary">
  <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-6 py-16 text-center sm:flex-row sm:justify-between sm:text-left">
    <h2 className="text-2xl font-bold text-primary-foreground">{/* the ask */}</h2>
    <Button size="lg" variant="secondary" asChild><Link to="/signup">{/* CTA */}</Link></Button>
  </div>
</section>
```

## Empty states (everywhere, not just the landing)

Use `EmptyState` from `components/common/states.tsx`: icon, one friendly
sentence, and a CTA that creates the missing thing. "No bookings yet — create
your first one" beats a blank table every time.

## Micro-interactions checklist

- Card hover: lift + shadow (Recipe 3).
- Buttons: `transition`; busy text (`Saving…`) + `disabled` while pending.
- Section entrances: the Recipe-1 rise animation on the hero only — don't
  animate everything.
- Focus states: leave the token-driven focus rings alone; they're accessible.
