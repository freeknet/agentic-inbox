// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import ExtensionOutlinedIcon from "@mui/icons-material/ExtensionOutlined";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import MCPPanel from "./MCPPanel";

function LazyAgentPanel() {
	const [AgentChat, setAgentChat] = useState<React.ComponentType | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);

	useEffect(() => {
		import("~/components/AgentPanel").then((mod) => {
			setAgentChat(() => mod.default);
		}).catch((err) => {
			console.error("Failed to load AgentPanel:", err);
			setLoadError("Failed to load agent panel");
		});
	}, []);

	if (loadError) {
		return (
			<Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
				<Typography variant="caption" color="error">
					{loadError}
				</Typography>
			</Box>
		);
	}
	if (!AgentChat) {
		return (
			<Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 1 }}>
				<CircularProgress size={20} />
				<Typography variant="caption" color="text.secondary">
					Loading agent...
				</Typography>
			</Box>
		);
	}
	return <AgentChat />;
}

export default function AgentSidebar() {
	const [activeTab, setActiveTab] = useState<"agent" | "mcp">("agent");

	return (
		<Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
			<Tabs
				value={activeTab}
				onChange={(_, value: "agent" | "mcp") => setActiveTab(value)}
				aria-label="Side panel"
				sx={{ minHeight: 40, borderBottom: 1, borderColor: "divider", flexShrink: 0 }}
			>
				<Tab
					value="agent"
					icon={<SmartToyOutlinedIcon sx={{ fontSize: 16 }} />}
					iconPosition="start"
					label="Agent"
					sx={{ minHeight: 40, minWidth: 0, px: 2, fontSize: 14 }}
				/>
				<Tab
					value="mcp"
					icon={<ExtensionOutlinedIcon sx={{ fontSize: 16 }} />}
					iconPosition="start"
					label="MCP"
					sx={{ minHeight: 40, minWidth: 0, px: 2, fontSize: 14 }}
				/>
			</Tabs>

			{/* Tab content — keep agent mounted so chat isn't lost */}
			<Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
				<Box sx={{ height: "100%", display: activeTab === "agent" ? "block" : "none" }}>
					<LazyAgentPanel />
				</Box>
				{activeTab === "mcp" && <MCPPanel />}
			</Box>
		</Box>
	);
}
