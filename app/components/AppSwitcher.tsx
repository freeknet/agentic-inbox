import { EnvelopeSimpleIcon, HardDrivesIcon } from "@phosphor-icons/react";
import { useDrive } from "~/queries/drive";

/**
 * Mail | Drive switcher, mirrored in agentic-drive's header. Both apps sit
 * behind the same Cloudflare Access team, so following the link needs no
 * second sign-in. Hidden when Drive isn't connected.
 */
export function AppSwitcher() {
	const drive = useDrive();
	if (!drive) return null;
	const base = "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors";
	return (
		<nav aria-label="Apps" className="flex shrink-0 items-center rounded-lg border border-kumo-line p-0.5">
			<span aria-current="page" className={`${base} bg-kumo-tint font-medium text-kumo-default`}>
				<EnvelopeSimpleIcon size={16} weight="duotone" />
				<span className="hidden sm:inline">Mail</span>
			</span>
			<a href={drive.url} className={`${base} text-kumo-subtle no-underline hover:text-kumo-default`}>
				<HardDrivesIcon size={16} weight="duotone" />
				<span className="hidden sm:inline">Drive</span>
			</a>
		</nav>
	);
}
