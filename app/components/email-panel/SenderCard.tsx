import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import SearchIcon from "@mui/icons-material/Search";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Popover from "@mui/material/Popover";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { type ReactNode, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useUIStore } from "~/hooks/useUIStore";
import { addToast } from "~/lib/toast";
import { avatarColor } from "./people";

/**
 * The sender's name opens a contact card, as in Gmail: who it is, then write
 * to them, copy the address, or find every email from them.
 */
export function SenderCard({ address, name, children }: { address: string; name: string | null; children: ReactNode }) {
	const [anchor, setAnchor] = useState<HTMLElement | null>(null);
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const navigate = useNavigate();
	const startCompose = useUIStore((s) => s.startCompose);
	const close = () => setAnchor(null);
	const label = name || address;

	return (
		<>
			<ButtonBase
				onClick={(e) => {
					e.stopPropagation();
					setAnchor(e.currentTarget);
				}}
				aria-label={`Contact card for ${label}`}
				aria-haspopup="dialog"
				sx={{ borderRadius: 1, minWidth: 0, justifyContent: "flex-start", "&:hover": { textDecoration: "underline" } }}
			>
				{children}
			</ButtonBase>
			<Popover
				open={!!anchor}
				anchorEl={anchor}
				onClose={close}
				onClick={(e) => e.stopPropagation()}
				anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
				slotProps={{ paper: { sx: { width: 320, maxWidth: "calc(100vw - 32px)", borderRadius: 4, overflow: "hidden" } } }}
			>
				<Stack direction="row" spacing={2} sx={{ alignItems: "center", p: 2.5, bgcolor: "action.hover" }}>
					<Avatar sx={{ width: 56, height: 56, fontSize: 24, bgcolor: avatarColor(address), color: "#fff" }}>{label.charAt(0).toUpperCase()}</Avatar>
					<Box sx={{ minWidth: 0 }}>
						<Typography variant="subtitle1" noWrap sx={{ fontWeight: 500 }}>
							{label}
						</Typography>
						<Typography variant="body2" color="text.secondary" noWrap>
							{address}
						</Typography>
					</Box>
				</Stack>
				<Stack direction="row" spacing={1} sx={{ p: 1.5, flexWrap: "wrap", rowGap: 1 }}>
					<Button
						size="small"
						variant="contained"
						startIcon={<EditOutlinedIcon />}
						onClick={() => {
							close();
							startCompose({ mode: "new", originalEmail: null, prefill: { to: address } });
						}}
					>
						Send email
					</Button>
					<Button
						size="small"
						startIcon={<ContentCopyIcon />}
						onClick={async () => {
							close();
							try {
								await navigator.clipboard.writeText(address);
								addToast({ title: "Address copied", variant: "success" });
							} catch {
								addToast({ title: "Couldn't copy the address", variant: "error" });
							}
						}}
					>
						Copy
					</Button>
					<Button
						size="small"
						startIcon={<SearchIcon />}
						onClick={() => {
							close();
							if (mailboxId) navigate(`/mailbox/${encodeURIComponent(mailboxId)}/search?q=${encodeURIComponent(`from:${address}`)}`);
						}}
					>
						Emails
					</Button>
				</Stack>
			</Popover>
		</>
	);
}
