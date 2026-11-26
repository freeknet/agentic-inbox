// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useNavigate } from "react-router";

export default function NotFoundRoute() {
	const navigate = useNavigate();

	return (
		<Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
			<Stack spacing={2} sx={{ alignItems: "center", textAlign: "center", p: 4 }}>
				<ReportProblemOutlinedIcon sx={{ fontSize: 48, color: "text.disabled" }} />
				<Typography variant="h6">404 — Page Not Found</Typography>
				<Typography variant="body2" color="text.secondary">
					The page you're looking for doesn't exist.
				</Typography>
				<Button variant="contained" size="small" onClick={() => navigate("/")}>
					Go Home
				</Button>
			</Stack>
		</Box>
	);
}
