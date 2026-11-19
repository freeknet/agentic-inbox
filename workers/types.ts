// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export interface Env extends Cloudflare.Env {
	POLICY_AUD: string;
	TEAM_DOMAIN: string;
	/** Resend sending-only API key (secret). */
	RESEND_API_KEY?: string;
	/** Resend webhook signing secret, `whsec_…` (secret). */
	RESEND_WEBHOOK_SECRET?: string;
}
