import Autocomplete from "@mui/material/Autocomplete";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { avatarColor } from "~/components/email-panel/people";
import { splitEmailList } from "~/lib/utils";
import api from "~/services/api";

const LOOKS_LIKE_EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/** Addresses you've written to or heard from, cached for a few minutes. */
export function useContacts(mailboxId: string | undefined) {
	return useQuery({
		queryKey: ["contacts", mailboxId],
		queryFn: () => api.getContacts(mailboxId!),
		enabled: !!mailboxId,
		staleTime: 5 * 60_000,
	});
}

/**
 * To / Cc / Bcc as Gmail does it: each address becomes a chip, and typing
 * suggests people you've corresponded with. Comma, semicolon, space, Enter or
 * leaving the field turns what you typed into a chip; Backspace on an empty
 * field removes the last one. The value is still a comma-separated string.
 */
export function RecipientField({
	mailboxId,
	value,
	onChange,
	placeholder,
	autoFocus,
	label,
}: {
	mailboxId?: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	autoFocus?: boolean;
	label: string;
}) {
	const { data: contacts = [] } = useContacts(mailboxId);
	const [input, setInput] = useState("");
	const chips = splitEmailList(value);
	const set = (list: string[]) => {
		const seen = new Set<string>();
		onChange(list.map((s) => s.trim()).filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase())).join(", "));
	};
	const commit = (text: string) => {
		const parts = text.split(/[,;\s]+/).filter(Boolean);
		if (parts.length) set([...chips, ...parts]);
		setInput("");
	};

	// What the dropdown shows for the current text (also what Enter picks).
	const suggest = (q: string) => {
		const t = q.trim().toLowerCase();
		if (!t) return [];
		const chosen = new Set(chips.map((c) => c.toLowerCase()));
		return contacts.map((c) => c.address).filter((a) => a.includes(t) && !chosen.has(a)).slice(0, 8);
	};

	return (
		<Autocomplete
			multiple
			freeSolo
			fullWidth
			size="small"
			autoHighlight
			filterSelectedOptions
			options={contacts.map((c) => c.address)}
			value={chips}
			inputValue={input}
			onInputChange={(_, v, reason) => {
				if (reason === "reset") return setInput("");
				// Typing a separator ends an address.
				if (/[,;]$/.test(v) || (/\s$/.test(v) && LOOKS_LIKE_EMAIL.test(v.trim()))) commit(v);
				else setInput(v);
			}}
			onChange={(_, list) => set(list as string[])}
			filterOptions={(_, state) => suggest(state.inputValue)}
			renderValue={(list, getItemProps) =>
				list.map((address, index) => {
					const { key, ...props } = getItemProps({ index });
					const valid = LOOKS_LIKE_EMAIL.test(address.replace(/^.*<([^>]+)>.*$/, "$1"));
					return (
						<Chip
							key={key}
							{...props}
							size="small"
							label={address}
							color={valid ? "default" : "error"}
							variant={valid ? "filled" : "outlined"}
							avatar={<Avatar sx={{ bgcolor: `${avatarColor(address)} !important`, color: "#fff !important" }}>{address.charAt(0).toUpperCase()}</Avatar>}
						/>
					);
				})
			}
			renderOption={(props, address) => {
				const { key, ...rest } = props as typeof props & { key: string };
				const c = contacts.find((x) => x.address === address);
				return (
					<Box component="li" key={key} {...rest} sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
						<Avatar sx={{ width: 28, height: 28, fontSize: 13, bgcolor: avatarColor(address), color: "#fff" }}>{address.charAt(0).toUpperCase()}</Avatar>
						<Box sx={{ minWidth: 0 }}>
							<Typography variant="body2" noWrap>
								{address}
							</Typography>
							{c && (
								<Typography variant="caption" color="text.secondary">
									{c.count} message{c.count === 1 ? "" : "s"}
								</Typography>
							)}
						</Box>
					</Box>
				);
			}}
			renderInput={(params) => (
				<TextField
					{...params}
					placeholder={chips.length ? undefined : placeholder}
					autoFocus={autoFocus}
					onBlur={() => input.trim() && commit(input)}
					// Enter on a partial name takes the top suggestion rather than the
					// half-typed text (MUI's free-text mode would keep "ben").
					onKeyDownCapture={(e) => {
						if (e.key !== "Enter" || !input.trim() || LOOKS_LIKE_EMAIL.test(input.trim())) return;
						// The option highlighted with the arrow keys wins; otherwise the first.
						const active = (e.target as HTMLElement).getAttribute("aria-activedescendant");
						const highlighted = active ? document.getElementById(active)?.querySelector(".MuiTypography-body2")?.textContent : null;
						const top = highlighted || suggest(input)[0];
						if (!top) return;
						e.preventDefault();
						e.stopPropagation();
						set([...chips, top]);
						setInput("");
					}}
					slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps.htmlInput, "aria-label": label, autoComplete: "off", inputMode: "email" } }}
				/>
			)}
		/>
	);
}
