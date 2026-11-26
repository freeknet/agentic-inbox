import { useQuery } from "@tanstack/react-query";
import api from "~/services/api";

/** Whether the Drive app is connected (service binding present and answering). */
export function useDrive() {
	const { data } = useQuery({ queryKey: ["drive"], queryFn: api.getDrive, staleTime: 5 * 60_000, retry: false });
	return data?.available ? data : null;
}
