import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { useEffect, useRef } from "react";
import { useMatches, useNavigate, useSearchParams } from "react-router";
import { useUIStore } from "~/hooks/useUIStore";
import { type ComposePrefill, parseMailto, prefillFromShare } from "~/lib/mailto";
import { useMailboxes } from "~/queries/mailboxes";
import { takeShare } from "~/shell/pwa";

/**
 * Entry points for the installed app, which don't know the mailbox id:
 * - /inbox: the start page; opens the first mailbox's inbox.
 * - /compose: a new message there, filled from ?mailto= (the app is the
 *   mailto: handler), ?share= (shared from another app) or ?to=&subject=&body=.
 * With no mailbox yet, both go to the mailbox picker.
 */
export default function Launch() {
	const compose = useMatches().some((m) => m.id === "launch-compose");
	const [params] = useSearchParams();
	const navigate = useNavigate();
	const startCompose = useUIStore((s) => s.startCompose);
	const { data: mailboxes, isError } = useMailboxes();
	const done = useRef(false);

	useEffect(() => {
		if (done.current || (!mailboxes && !isError)) return;
		done.current = true;
		const first = mailboxes?.[0];
		if (!first) {
			navigate("/", { replace: true });
			return;
		}
		const inbox = `/mailbox/${encodeURIComponent(first.id)}/emails/inbox`;
		if (!compose) {
			navigate(inbox, { replace: true });
			return;
		}
		(async () => {
			let prefill: ComposePrefill = {};
			const mailto = params.get("mailto");
			const share = params.get("share");
			if (mailto) prefill = parseMailto(mailto);
			else if (share) prefill = prefillFromShare((await takeShare(share).catch(() => null)) ?? {});
			else
				prefill = {
					to: params.get("to") || undefined,
					subject: params.get("subject") || undefined,
					text: params.get("body") || undefined,
				};
			startCompose({ mode: "new", originalEmail: null, prefill });
			navigate(inbox, { replace: true });
		})();
	}, [mailboxes, isError, compose, params, navigate, startCompose]);

	return (
		<Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", bgcolor: "background.default" }}>
			<CircularProgress />
		</Box>
	);
}
