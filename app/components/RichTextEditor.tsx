// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import FormatQuoteIcon from "@mui/icons-material/FormatQuote";
import FormatUnderlinedIcon from "@mui/icons-material/FormatUnderlined";
import HorizontalRuleIcon from "@mui/icons-material/HorizontalRule";
import LinkIcon from "@mui/icons-material/Link";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import RedoIcon from "@mui/icons-material/Redo";
import StrikethroughSIcon from "@mui/icons-material/StrikethroughS";
import UndoIcon from "@mui/icons-material/Undo";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TiptapImage from "@tiptap/extension-image";
import LinkExtension from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect } from "react";

interface RichTextEditorProps {
	value: string;
	onChange: (value: string) => void;
}

export default function RichTextEditor({ value, onChange }: RichTextEditorProps) {
	const editor = useEditor({
		extensions: [
			StarterKit,
			Underline,
			TextAlign.configure({ types: ["heading", "paragraph"] }),
			LinkExtension.configure({ openOnClick: false }),
			TiptapImage,
			TextStyle,
			Color,
			Highlight.configure({ multicolor: true }),
		],
		content: value,
		editorProps: {
			attributes: { class: "rte-content" },
		},
		onUpdate: ({ editor }) => {
			onChange(editor.getHTML());
		},
	});

	useEffect(() => {
		if (editor && !editor.isDestroyed && value !== editor.getHTML()) {
			editor.commands.setContent(value);
			// Place cursor at the start of the document (above quoted text)
			const rafId = requestAnimationFrame(() => {
				if (!editor.isDestroyed) {
					editor.commands.focus("start");
				}
			});
			return () => cancelAnimationFrame(rafId);
		}
	}, [value, editor]);

	const setLink = useCallback(() => {
		if (!editor) return;
		const previousUrl = editor.getAttributes("link").href;
		const url = window.prompt("URL", previousUrl);
		if (url === null) return;
		if (url === "") {
			editor.chain().focus().extendMarkRange("link").unsetLink().run();
			return;
		}
		editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
	}, [editor]);

	if (!editor) return null;

	const tools: Array<{
		title: string;
		icon: React.ReactNode;
		active?: boolean;
		disabled?: boolean;
		onClick: () => void;
	}> = [
		{
			title: "Bold",
			icon: <FormatBoldIcon fontSize="small" />,
			active: editor.isActive("bold"),
			onClick: () => editor.chain().focus().toggleBold().run(),
		},
		{
			title: "Italic",
			icon: <FormatItalicIcon fontSize="small" />,
			active: editor.isActive("italic"),
			onClick: () => editor.chain().focus().toggleItalic().run(),
		},
		{
			title: "Underline",
			icon: <FormatUnderlinedIcon fontSize="small" />,
			active: editor.isActive("underline"),
			onClick: () => editor.chain().focus().toggleUnderline().run(),
		},
		{
			title: "Strikethrough",
			icon: <StrikethroughSIcon fontSize="small" />,
			active: editor.isActive("strike"),
			onClick: () => editor.chain().focus().toggleStrike().run(),
		},
	];

	const blockTools: typeof tools = [
		{
			title: "Bullet list",
			icon: <FormatListBulletedIcon fontSize="small" />,
			active: editor.isActive("bulletList"),
			onClick: () => editor.chain().focus().toggleBulletList().run(),
		},
		{
			title: "Numbered list",
			icon: <FormatListNumberedIcon fontSize="small" />,
			active: editor.isActive("orderedList"),
			onClick: () => editor.chain().focus().toggleOrderedList().run(),
		},
	];

	const insertTools: typeof tools = [
		{
			title: "Blockquote",
			icon: <FormatQuoteIcon fontSize="small" />,
			active: editor.isActive("blockquote"),
			onClick: () => editor.chain().focus().toggleBlockquote().run(),
		},
		{
			title: "Link",
			icon: <LinkIcon fontSize="small" />,
			active: editor.isActive("link"),
			onClick: setLink,
		},
		...(editor.isActive("link")
			? [
					{
						title: "Remove link",
						icon: <LinkOffIcon fontSize="small" />,
						onClick: () => editor.chain().focus().unsetLink().run(),
					},
				]
			: []),
		{
			title: "Horizontal rule",
			icon: <HorizontalRuleIcon fontSize="small" />,
			onClick: () => editor.chain().focus().setHorizontalRule().run(),
		},
	];

	const historyTools: typeof tools = [
		{
			title: "Undo",
			icon: <UndoIcon fontSize="small" />,
			disabled: !editor.can().undo(),
			onClick: () => editor.chain().focus().undo().run(),
		},
		{
			title: "Redo",
			icon: <RedoIcon fontSize="small" />,
			disabled: !editor.can().redo(),
			onClick: () => editor.chain().focus().redo().run(),
		},
	];

	const group = (items: typeof tools) =>
		items.map((tool) => (
			<Tooltip key={tool.title} title={tool.title}>
				<span>
					<IconButton
						size="small"
						color={tool.active ? "primary" : "default"}
						onClick={tool.onClick}
						disabled={tool.disabled}
						aria-label={tool.title}
						sx={{
							borderRadius: 1.5,
							bgcolor: tool.active ? "action.selected" : "transparent",
						}}
					>
						{tool.icon}
					</IconButton>
				</span>
			</Tooltip>
		));

	return (
		<Box sx={{ borderRadius: 2, border: 1, borderColor: "divider", overflow: "hidden", display: "flex", flexDirection: "column" }}>
			<Box
				sx={{
					display: "flex",
					flexWrap: "wrap",
					alignItems: "center",
					gap: 0.25,
					bgcolor: "background.default",
					px: 1,
					py: 0.5,
					borderBottom: 1,
					borderColor: "divider",
					flexShrink: 0,
				}}
			>
				{group(tools)}
				<Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />
				{group(blockTools)}
				<Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />
				{group(insertTools)}
				<Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />
				{group(historyTools)}
			</Box>
			<Box sx={{ flex: 1, overflowY: "auto" }}>
				<EditorContent editor={editor} />
			</Box>
		</Box>
	);
}
