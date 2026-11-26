// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SearchOffIcon from "@mui/icons-material/SearchOff";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Pagination from "@mui/material/Pagination";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import MailboxSplitView from "~/components/MailboxSplitView";
import { formatListDate, getSnippetText } from "~/lib/utils";
import { useUpdateEmail } from "~/queries/emails";
import { useSearchEmails, SEARCH_PAGE_SIZE } from "~/queries/search";
import { useUIStore } from "~/hooks/useUIStore";
import type { Email } from "~/types";
import { usePrefs } from "~/lib/prefs";
import { EmptyState, ViewHeader, ViewTitle } from "~/shell/View";

function highlightTerms(text: string, query: string): React.ReactNode {
	if (!query || !text) return text;
	const freeText = query
		.replace(/\b(?:from|to|subject|in|is|has|before|after):"[^"]*"/gi, "")
		.replace(/\b(?:from|to|subject|in|is|has|before|after):\S+/gi, "")
		.trim();
	if (!freeText) return text;
	try {
		const escaped = freeText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const regex = new RegExp(`(${escaped})`, "gi");
		const parts = text.split(regex);
		if (parts.length === 1) return text;
		// Use case-insensitive string comparison instead of regex.test() with g flag,
		// which has stateful lastIndex causing alternating true/false results.
		const lowerEscaped = escaped.toLowerCase();
		return parts.map((part, i) =>
			part.toLowerCase() === lowerEscaped ? (
				<Box
					key={i}
					component="mark"
					sx={{ bgcolor: "warning.main", color: "warning.contrastText", borderRadius: 0.5, px: 0.25 }}
				>
					{part}
				</Box>
			) : (
				part
			),
		);
	} catch {
		return text;
	}
}

export default function SearchResultsRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const { selectedEmailId, isComposing, selectEmail, closePanel } = useUIStore();
	const updateEmail = useUpdateEmail();
	const urlQuery = searchParams.get("q") || "";
	const [page, setPage] = useState(1);
	const searchKey = useMemo(() => `${mailboxId ?? ""}::${urlQuery}`, [mailboxId, urlQuery]);
	const prevSearchKeyRef = useRef(searchKey);
	const searchChanged = prevSearchKeyRef.current !== searchKey;
	const currentPage = searchChanged ? 1 : page;

	useEffect(() => {
		if (!searchChanged) {
			return;
		}

		prevSearchKeyRef.current = searchKey;
		setPage(1);
		closePanel();
	}, [closePanel, searchChanged, searchKey]);

	const { data: searchData, isLoading } = useSearchEmails(mailboxId, urlQuery, currentPage);
	const results = searchData?.results ?? [];
	const totalCount = searchData?.totalCount ?? 0;
	const isPanelOpen = selectedEmailId !== null || isComposing;
	const markReadOnOpen = usePrefs((p) => p.markReadOnOpen);

	const handleRowClick = (email: Email) => {
		selectEmail(email.id);
		if (!email.read && mailboxId && markReadOnOpen) updateEmail.mutate({ mailboxId, id: email.id, data: { read: true } });
	};
	const folderDisplayName = (name: string | null | undefined): string => {
		if (!name) return "";
		const map: Record<string, string> = { inbox: "Inbox", sent: "Sent", draft: "Drafts", archive: "Archive", trash: "Trash" };
		return map[name.toLowerCase()] || name;
	};

	return (
		<MailboxSplitView selectedEmailId={selectedEmailId} isComposing={isComposing}>
			<>
				<ViewHeader
					title={
						<Box sx={{ display: "flex", alignItems: "center", minWidth: 0 }}>
							<IconButton onClick={() => navigate(`/mailbox/${mailboxId}/emails/inbox`)} aria-label="Back to inbox">
								<ArrowBackIcon />
							</IconButton>
							<ViewTitle>{urlQuery ? `Search results for "${urlQuery}"` : "Search"}</ViewTitle>
						</Box>
					}
				>
					{!isLoading && (
						<Typography variant="body2" color="text.secondary" sx={{ mr: 1, whiteSpace: "nowrap", display: { xs: "none", sm: "block" } }}>
							{totalCount} result{totalCount !== 1 ? "s" : ""}
						</Typography>
					)}
				</ViewHeader>
				<Box sx={{ flex: 1, overflowY: "auto" }}>
					{isLoading ? (
						<Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
							<CircularProgress />
						</Box>
					) : results.length === 0 ? (
						<Box sx={{ py: 10, px: 3, textAlign: "center" }}>
							<EmptyState
								icon={<SearchOffIcon />}
								title="No matching results"
								body={
									urlQuery
										? `Nothing matched "${urlQuery}". Try different keywords or check your spelling.`
										: "Enter a search term to find emails by subject, sender or content."
								}
							/>
							{urlQuery && (
								<Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, maxWidth: 360 }}>
									Tip: Use operators like <Box component="code" sx={{ bgcolor: "action.hover", px: 0.5, borderRadius: 1 }}>from:name</Box>,{" "}
									<Box component="code" sx={{ bgcolor: "action.hover", px: 0.5, borderRadius: 1 }}>is:unread</Box>,{" "}
									<Box component="code" sx={{ bgcolor: "action.hover", px: 0.5, borderRadius: 1 }}>has:attachment</Box>,{" "}
									<Box component="code" sx={{ bgcolor: "action.hover", px: 0.5, borderRadius: 1 }}>before:2025-01-01</Box>
								</Typography>
							)}
						</Box>
					) : (
						<Box>
							{results.map((email) => {
								const isSelected = selectedEmailId === email.id;
								const snippet = getSnippetText(email.snippet, 120);
								const folderName = (email as Email & { folder_name?: string }).folder_name;
								return (
									<Box
										key={email.id}
										role="button"
										tabIndex={0}
										onClick={() => handleRowClick(email)}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												handleRowClick(email);
											}
										}}
										sx={{
											display: "flex",
											alignItems: "center",
											gap: 1.5,
											width: "100%",
											textAlign: "left",
											cursor: "pointer",
											borderBottom: 1,
											borderColor: "divider",
											px: { xs: 2, md: isPanelOpen ? 2 : 2.5 },
											py: { xs: 1.25, md: isPanelOpen ? 1.25 : 1.5 },
											bgcolor: isSelected ? "action.selected" : "transparent",
											"&:hover": { bgcolor: isSelected ? "action.selected" : "action.hover" },
										}}
									>
										<Box sx={{ width: 10, flexShrink: 0, display: "flex", justifyContent: "center" }}>
											{!email.read && <Box sx={{ height: 8, width: 8, borderRadius: "50%", bgcolor: "primary.main" }} />}
										</Box>
										<Box sx={{ minWidth: 0, flex: 1 }}>
											<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
												<Typography
													variant="body2"
													noWrap
													sx={{ fontWeight: !email.read ? 700 : 400, color: !email.read ? "text.primary" : "text.secondary" }}
												>
													{highlightTerms(email.sender.split("@")[0], urlQuery)}
												</Typography>
												{folderName && (
													<Chip
														size="small"
														variant="outlined"
														label={folderDisplayName(folderName)}
														sx={{ height: 18, fontSize: 11 }}
													/>
												)}
												<Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, ml: "auto" }}>
													{formatListDate(email.date)}
												</Typography>
											</Box>
											<Typography
												variant="body2"
												noWrap
												sx={{ mt: 0.25, fontWeight: !email.read ? 500 : 400, color: !email.read ? "text.primary" : "text.secondary" }}
											>
												{highlightTerms(email.subject, urlQuery)}
											</Typography>
											{snippet && (
												<Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", mt: 0.25 }}>
													{highlightTerms(snippet, urlQuery)}
												</Typography>
											)}
										</Box>
									</Box>
								);
							})}
						</Box>
					)}
				</Box>
				{totalCount > SEARCH_PAGE_SIZE && (
					<Box sx={{ display: "flex", justifyContent: "center", py: 1.5, borderTop: 1, borderColor: "divider", flexShrink: 0 }}>
						<Pagination
							size="small"
							page={currentPage}
							count={Math.max(1, Math.ceil(totalCount / SEARCH_PAGE_SIZE))}
							onChange={(_, p) => setPage(p)}
						/>
					</Box>
				)}
			</>
		</MailboxSplitView>
	);
}
