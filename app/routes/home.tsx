// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import AddIcon from "@mui/icons-material/Add";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import MailOutlinedIcon from "@mui/icons-material/MailOutlined";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Container from "@mui/material/Container";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router";
import api from "~/services/api";
import { useCreateMailbox, useDeleteMailbox, useMailboxes } from "~/queries/mailboxes";
import { queryKeys } from "~/queries/keys";
import { useToast } from "~/lib/toast";
import { useDrive } from "~/queries/drive";
import { AppHeader } from "~/shell/AppHeader";
import { AccountMenu } from "~/shell/AccountMenu";

export function meta() {
	return [{ title: "Agentic Inbox" }];
}

export default function HomeRoute() {
	const toast = useToast();
	const navigate = useNavigate();
	const { data: mailboxes = [], refetch: refetchMailboxes, isFetched: mailboxesFetched } = useMailboxes();
	const createMailbox = useCreateMailbox();
	const deleteMailbox = useDeleteMailbox();

	const { data: configData } = useQuery({
		queryKey: queryKeys.config,
		queryFn: () => api.getConfig(),
		staleTime: Infinity, // config rarely changes
	});

	const domains = configData?.domains ?? [];
	const emailAddresses = configData?.emailAddresses ?? [];

	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [newPrefix, setNewPrefix] = useState("");
	const [selectedDomain, setSelectedDomain] = useState("");
	const [newName, setNewName] = useState("");
	const [isCreating, setIsCreating] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [mailboxToDelete, setMailboxToDelete] = useState<{
		id: string;
		email: string;
	} | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);

	// Set default domain when config loads
	useEffect(() => {
		if (domains.length > 0 && !selectedDomain) {
			setSelectedDomain(domains[0]);
		}
	}, [domains, selectedDomain]);

	// Auto-create mailboxes from config (run once when both data sources are ready)
	const autoCreateDone = useRef(false);
	useEffect(() => {
		if (autoCreateDone.current) return;
		if (emailAddresses.length === 0 || !mailboxesFetched) return;
		const existingEmails = new Set(mailboxes.map((m) => m.email.toLowerCase()));
		const toCreate = emailAddresses.filter((addr) => !existingEmails.has(addr.toLowerCase()));
		if (toCreate.length === 0) {
			autoCreateDone.current = true;
			return;
		}
		autoCreateDone.current = true;
		let cancelled = false;
		Promise.all(
			toCreate.map((addr) => {
				const localPart = addr.split("@")[0] || addr;
				return api.createMailbox(addr, localPart).catch(() => {});
			}),
		).then(() => {
			if (!cancelled) refetchMailboxes();
		});
		return () => {
			cancelled = true;
		};
	}, [emailAddresses, mailboxes, refetchMailboxes]);

	const handleCreate = async (e: FormEvent) => {
		e.preventDefault();
		setCreateError(null);
		if (!newPrefix || !selectedDomain) {
			setCreateError("Please fill in all fields");
			return;
		}
		const email = `${newPrefix}@${selectedDomain}`;
		const name = newName || newPrefix;
		setIsCreating(true);
		try {
			await createMailbox.mutateAsync({ email, name });
			toast.add({ title: "Mailbox created successfully!" });
			setIsCreateOpen(false);
			setNewPrefix("");
			setNewName("");
		} catch (err: unknown) {
			const message = (err instanceof Error ? err.message : null) || "Failed to create mailbox";
			setCreateError(message);
		} finally {
			setIsCreating(false);
		}
	};

	const handleDelete = async () => {
		if (!mailboxToDelete) return;
		setIsDeleting(true);
		try {
			await deleteMailbox.mutateAsync(mailboxToDelete.id);
			toast.add({ title: "Mailbox deleted" });
			setIsDeleteOpen(false);
			setMailboxToDelete(null);
		} catch {
			toast.add({ title: "Failed to delete mailbox", variant: "error" });
		} finally {
			setIsDeleting(false);
		}
	};

	const isConfigured = emailAddresses.length > 0;
	const accounts = isConfigured
		? emailAddresses.map((addr) => ({
				id: addr,
				email: addr,
				name: addr.split("@")[0] || addr,
			}))
		: mailboxes;

	const isLoading = !configData;

	return (
		<Box sx={{ display: "flex", flexDirection: "column", minHeight: "100dvh", bgcolor: "background.default" }}>
			<HomeHeader />
			<Box sx={{ flex: 1, mx: { md: 2 }, mb: { md: 2 }, bgcolor: "background.paper", borderRadius: { md: 4 } }}>
			<Container maxWidth="sm" sx={{ py: { xs: 3, md: 5 } }}>
				<Box sx={{ mb: 4 }}>
					<Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
						<Typography component="h1" sx={{ fontSize: 22 }}>
							Mailboxes
						</Typography>
						{!isConfigured && (
							<Button variant="contained" startIcon={<AddIcon />} onClick={() => setIsCreateOpen(true)}>
								New Mailbox
							</Button>
						)}
					</Box>
					{domains.length > 0 && (
						<Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
							{domains.join(", ")}
						</Typography>
					)}
				</Box>

				{isLoading ? (
					<Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
						<CircularProgress />
					</Box>
				) : accounts.length > 0 ? (
					<Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
						<List disablePadding>
							{accounts.map((account, idx) => (
								<ListItemButton
									key={account.id}
									onClick={() => navigate(`/mailbox/${account.id}`)}
									sx={{
										gap: 2,
										px: 2.5,
										py: 1.5,
										borderTop: idx > 0 ? 1 : 0,
										borderColor: "divider",
									}}
								>
									<Avatar sx={{ width: 40, height: 40, bgcolor: "action.selected", color: "text.primary", fontWeight: 700 }}>
										{account.name.charAt(0).toUpperCase()}
									</Avatar>
									<ListItemText
										primary={account.name}
										secondary={account.email}
										slotProps={{ primary: { variant: "body2", sx: { fontWeight: 500 } }, secondary: { variant: "body2" } }}
										sx={{ minWidth: 0 }}
									/>
									{!isConfigured && (
										<IconButton
											aria-label={`Delete mailbox ${account.email}`}
											onClick={(e) => {
												e.preventDefault();
												e.stopPropagation();
												setMailboxToDelete({ id: account.id, email: account.email });
												setIsDeleteOpen(true);
											}}
										>
											<DeleteOutlinedIcon />
										</IconButton>
									)}
								</ListItemButton>
							))}
						</List>
					</Paper>
				) : (
					<Paper variant="outlined" sx={{ borderRadius: 3, py: 8, px: 3 }}>
						<Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
							<MailOutlinedIcon sx={{ fontSize: 48, color: "text.disabled", mb: 2 }} />
							<Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
								No mailboxes yet
							</Typography>
							<Typography variant="body2" color="text.secondary" sx={{ maxWidth: 360, mb: 2.5 }}>
								{isConfigured
									? "Your email routing is configured but no mailboxes have been created yet. They will appear here automatically."
									: "Create a mailbox to start sending and receiving emails with your domain."}
							</Typography>
							{!isConfigured && (
								<Button variant="contained" startIcon={<AddIcon />} onClick={() => setIsCreateOpen(true)}>
									Create Mailbox
								</Button>
							)}
						</Box>
					</Paper>
				)}
			</Container>

			{/* Create Dialog */}
			<Dialog open={isCreateOpen} onClose={() => setIsCreateOpen(false)} fullWidth maxWidth="xs">
				<form onSubmit={handleCreate}>
					<DialogTitle>Create New Mailbox</DialogTitle>
					<DialogContent>
						<Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
							{createError && (
								<Typography variant="body2" color="error">
									{createError}
								</Typography>
							)}
							<Box>
								<Typography variant="body2" sx={{ fontWeight: 500, mb: 0.75 }}>
									Email Address
								</Typography>
								<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
									<TextField
										size="small"
										placeholder="info"
										value={newPrefix}
										onChange={(e) => setNewPrefix(e.target.value)}
										required
										sx={{ flex: 1 }}
										slotProps={{ htmlInput: { "aria-label": "Address prefix" } }}
									/>
									<Typography variant="body2" color="text.secondary">
										@
									</Typography>
									{domains.length > 1 ? (
										<TextField
											select
											size="small"
											value={selectedDomain}
											onChange={(e) => setSelectedDomain(e.target.value)}
											sx={{ flex: 1 }}
											slotProps={{ select: { displayEmpty: true }, htmlInput: { "aria-label": "Domain" } }}
										>
											{domains.map((d) => (
												<MenuItem key={d} value={d}>
													{d}
												</MenuItem>
											))}
										</TextField>
									) : (
										<Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
											{selectedDomain || "no domain"}
										</Typography>
									)}
								</Box>
							</Box>
							<TextField
								fullWidth
								size="small"
								label="Display Name (optional)"
								placeholder="Info"
								value={newName}
								onChange={(e) => setNewName(e.target.value)}
							/>
						</Box>
					</DialogContent>
					<DialogActions>
						<Button onClick={() => setIsCreateOpen(false)}>Cancel</Button>
						<Button
							type="submit"
							variant="contained"
							disabled={!selectedDomain || isCreating}
							startIcon={isCreating ? <CircularProgress size={14} color="inherit" /> : undefined}
						>
							Create
						</Button>
					</DialogActions>
				</form>
			</Dialog>

			{/* Delete Dialog */}
			<Dialog
				open={isDeleteOpen}
				onClose={() => {
					setIsDeleteOpen(false);
					setMailboxToDelete(null);
				}}
				fullWidth
				maxWidth="xs"
			>
				<DialogTitle>Delete Mailbox</DialogTitle>
				<DialogContent>
					<DialogContentText>
						Are you sure you want to delete <strong>{mailboxToDelete?.email}</strong>? This action cannot be
						undone.
					</DialogContentText>
				</DialogContent>
				<DialogActions>
					<Button
						onClick={() => {
							setIsDeleteOpen(false);
							setMailboxToDelete(null);
						}}
					>
						Cancel
					</Button>
					<Button
						variant="contained"
						color="error"
						disabled={isDeleting}
						startIcon={isDeleting ? <CircularProgress size={14} color="inherit" /> : undefined}
						onClick={handleDelete}
					>
						Delete
					</Button>
				</DialogActions>
			</Dialog>
			</Box>
		</Box>
	);
}

/** The shared Mail header on the mailbox picker (no search or settings here). */
function HomeHeader() {
	const drive = useDrive();
	return <AppHeader app="mail" homeHref="/" appUrls={{ drive: drive?.url }} account={<AccountMenu />} />;
}
