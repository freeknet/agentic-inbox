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
import AttachFileIcon from "@mui/icons-material/AttachFile";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import MarkEmailUnreadOutlinedIcon from "@mui/icons-material/MarkEmailUnreadOutlined";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import CheckIcon from "@mui/icons-material/Check";
import Avatar from "@mui/material/Avatar";
import { avatarColor } from "~/components/email-panel/people";

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
				<SearchFilterChips
					query={urlQuery}
					onChange={(q) => navigate(`/mailbox/${mailboxId}/search?q=${encodeURIComponent(q)}`)}
				/>
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
										<Box sx={{ width: 10, flexShrink: 0, display: { xs: "none", sm: "flex" }, justifyContent: "center" }}>
											{!email.read && <Box sx={{ height: 8, width: 8, borderRadius: "50%", bgcolor: "primary.main" }} />}
										</Box>
										{/* Phones: the sender's avatar, as in the inbox. */}
										<Avatar sx={{ display: { xs: "flex", sm: "none" }, width: 40, height: 40, flexShrink: 0, fontSize: 17, color: "#fff", bgcolor: avatarColor(email.sender) }}>
											{email.sender.charAt(0).toUpperCase()}
										</Avatar>
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
												{email.has_attachments && (
													<AttachFileIcon aria-label="Has attachments" sx={{ fontSize: 16, color: "text.secondary", flexShrink: 0, ml: "auto", transform: "rotate(45deg)" }} />
												)}
												<Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, ml: email.has_attachments ? 0.5 : "auto" }}>
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

/** Gmail's quick filters under the search: each chip adds or removes an operator in the query. */
function SearchFilterChips({ query, onChange }: { query: string; onChange: (q: string) => void }) {
	const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
	const filters: { label: string; token: string; match: RegExp; icon: React.ReactElement }[] = [
		{ label: "Has attachment", token: "has:attachment", match: /\bhas:attachment\b/i, icon: <AttachFileIcon /> },
		{ label: "Unread", token: "is:unread", match: /\bis:unread\b/i, icon: <MarkEmailUnreadOutlinedIcon /> },
		{ label: "Starred", token: "is:starred", match: /\bis:starred\b/i, icon: <StarBorderIcon /> },
		{ label: "Sent", token: "in:sent", match: /\bin:sent\b/i, icon: <SendOutlinedIcon /> },
		{ label: "Last 7 days", token: `after:${weekAgo}`, match: /\bafter:\S+/i, icon: <EventOutlinedIcon /> },
	];
	return (
		<Box
			role="toolbar"
			aria-label="Search filters"
			sx={{ display: "flex", gap: 1, px: { xs: 2, md: 2.5 }, pb: 1.5, overflowX: "auto", flexShrink: 0, scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}
		>
			{filters.map((f) => {
				const on = f.match.test(query);
				return (
					<Chip
						key={f.label}
						label={f.label}
						icon={on ? <CheckIcon /> : f.icon}
						color={on ? "primary" : "default"}
						variant={on ? "filled" : "outlined"}
						aria-pressed={on}
						onClick={() => onChange((on ? query.replace(f.match, " ") : `${query} ${f.token}`).replace(/\s+/g, " ").trim())}
						sx={{ flexShrink: 0 }}
					/>
				);
			})}
		</Box>
	);
}
