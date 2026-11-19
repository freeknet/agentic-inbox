import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import api from "~/services/api";
import type { Attachment } from "~/types";
import { replaceCidReferences } from "~/lib/utils";

/** Larger inline parts stay as broken images rather than bloating the frame. */
const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024;

const bareCid = (cid: string) => (cid.startsWith("<") && cid.endsWith(">") ? cid.slice(1, -1) : cid);

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}

/**
 * Replace `cid:` references with `data:` URIs. The email frame is sandboxed
 * (opaque origin) with `img-src data:`, so it can't load the attachment API
 * itself; the parent page fetches the parts with the user's session instead.
 */
export function useInlineImages(
	body: string,
	mailboxId: string | undefined,
	emailId: string,
	attachments: Attachment[] | undefined,
): string {
	const targets = useMemo(() => {
		const lower = body.toLowerCase();
		return (attachments ?? []).filter(
			(a) =>
				a.content_id &&
				a.mimetype?.startsWith("image/") &&
				a.size <= MAX_INLINE_IMAGE_BYTES &&
				lower.includes(`cid:${bareCid(a.content_id).toLowerCase()}`),
		);
	}, [body, attachments]);

	const { data } = useQuery({
		queryKey: ["inline-images", mailboxId, emailId, targets.map((t) => t.id).join(",")],
		enabled: !!mailboxId && targets.length > 0,
		staleTime: Number.POSITIVE_INFINITY,
		queryFn: async () => {
			const entries = await Promise.all(
				targets.map(async (a) => {
					try {
						const blob = await api.getAttachment(mailboxId!, emailId, a.id);
						const typed = blob.type ? blob : new Blob([blob], { type: a.mimetype });
						return [bareCid(a.content_id!), await blobToDataUrl(typed)] as const;
					} catch {
						return null;
					}
				}),
			);
			return new Map(entries.filter((e): e is readonly [string, string] => e !== null));
		},
	});

	return useMemo(() => (data?.size ? replaceCidReferences(body, data) : body), [body, data]);
}
