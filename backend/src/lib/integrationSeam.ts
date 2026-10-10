import { Response } from 'express';

/**
 * Integration seam — the honest boundary where a provider-backed capability
 * stops until the owner connects that provider.
 *
 * The first build ships every feature's surface (pages, forms, records, states)
 * but NO provider code. At the exact point where a provider would answer or
 * act (generate text, fetch weather, charge a card, post to X), the app's own
 * handler calls this seam instead of inventing a result. Later, when the owner
 * supplies keys, the platform installs that provider's kit and rewires the
 * seam to the kit's helper — nothing else in the app changes.
 *
 * Mark every seam so it can be found mechanically — the marker goes on the
 * line above the function, with the provider id and a kebab-case capability:
 *
 *   // @integration-seam <provider-id> <capability>
 *   async function polishEntry(body: string): Promise<string> {
 *     throw new IntegrationNotConfiguredError('<Provider display name>');
 *   }
 *
 * The frontend treats a 503 `integration_not_configured` response as a calm
 * "not connected yet" state where the result would have rendered.
 */

export const INTEGRATION_NOT_CONFIGURED = 'integration_not_configured' as const;

export interface IntegrationNotConfiguredBody {
  error: typeof INTEGRATION_NOT_CONFIGURED;
  integration: string;
  message: string;
}

/** Thrown by an app-level capability function whose provider is not connected. */
export class IntegrationNotConfiguredError extends Error {
  readonly status = 503;

  constructor(
    public readonly integration: string,
    message = `${integration} is not connected yet.`,
  ) {
    super(message);
    this.name = 'IntegrationNotConfiguredError';
  }

  toBody(): IntegrationNotConfiguredBody {
    return { error: INTEGRATION_NOT_CONFIGURED, integration: this.integration, message: this.message };
  }
}

/** Write the standard 503 seam response directly from a route handler. */
export function notConfigured(res: Response, integration: string): void {
  res.status(503).json(new IntegrationNotConfiguredError(integration).toBody());
}

/**
 * Translate a thrown seam error into the standard 503 response.
 * Returns true when handled, so a catch block can fall through to other
 * handlers (e.g. handlePrismaError) otherwise.
 */
export function handleSeamError(err: unknown, res: Response): boolean {
  if (!(err instanceof IntegrationNotConfiguredError)) return false;
  res.status(err.status).json(err.toBody());
  return true;
}
