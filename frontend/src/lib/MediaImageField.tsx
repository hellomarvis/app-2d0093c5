import * as React from "react";
import { ImageIcon, Upload, X, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { listMedia, uploadMedia, mediaUrl, type MediaAsset } from "@/lib/mediaClient";

export interface MediaImageFieldProps {
  value: string | undefined;
  onChange: (value: string) => void;
  /** Optional field label rendered above the control. */
  label?: string;
  /** Extra classes on the outer wrapper. */
  className?: string;
}

export function MediaImageField({ value, onChange, label, className }: MediaImageFieldProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const [showUrl, setShowUrl] = React.useState(false);
  const [assets, setAssets] = React.useState<MediaAsset[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAssets(await listMedia());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const openLibrary = () => {
    const next = !open;
    setOpen(next);
    if (next && assets.length === 0) void refresh();
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const asset = await uploadMedia(file);
      onChange(mediaUrl(asset.s3Key));
      setAssets((prev) => [asset, ...prev]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label ? <Label>{label}</Label> : null}

      {/* Preview */}
      {value ? (
        <div className="group relative w-full overflow-hidden rounded-md border">
          <img src={value} alt="" className="h-40 w-full object-cover" />
          <button
            type="button"
            aria-label="Remove image"
            onClick={() => onChange("")}
            className="absolute right-2 top-2 rounded-full bg-background/80 p-1 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div className="flex h-40 w-full items-center justify-center rounded-md border border-dashed text-muted-foreground">
          <ImageIcon className="size-6" />
        </div>
      )}

      {/* Primary action: upload. Secondary: choose from library. */}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => fileInput.current?.click()}
          disabled={loading}
        >
          <Upload className="size-4" />
          {loading ? "Uploading…" : value ? "Replace image" : "Upload image"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={openLibrary}>
          <ImageIcon className="size-4" />
          {open ? "Hide library" : "Choose from library"}
        </Button>
        <input ref={fileInput} type="file" accept="image/*" onChange={onUpload} className="hidden" />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {/* Media library grid */}
      {open ? (
        <div className="grid max-h-56 grid-cols-3 gap-1.5 overflow-y-auto rounded-md border p-1.5">
          {loading && assets.length === 0 ? (
            <div className="col-span-full text-sm text-muted-foreground">Loading…</div>
          ) : assets.length === 0 ? (
            <div className="col-span-full text-sm text-muted-foreground">No images yet — upload one.</div>
          ) : (
            assets.map((a) => {
              const url = mediaUrl(a.s3Key);
              const selected = url === value;
              return (
                <button
                  key={a.id}
                  type="button"
                  title={a.originalName}
                  onClick={() => onChange(url)}
                  className={cn(
                    "aspect-square overflow-hidden rounded-md border bg-muted transition",
                    selected ? "ring-2 ring-primary ring-offset-1" : "hover:opacity-90",
                  )}
                >
                  <img src={url} alt={a.originalName} className="h-full w-full object-cover" />
                </button>
              );
            })
          )}
        </div>
      ) : null}

      {/* Tucked-away fallback: paste a URL (rarely needed — uploading is primary). */}
      {showUrl ? (
        <Input
          type="text"
          value={value ?? ""}
          placeholder="https://…"
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowUrl(true)}
          className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Link2 className="size-3" /> or paste an image URL
        </button>
      )}
    </div>
  );
}
