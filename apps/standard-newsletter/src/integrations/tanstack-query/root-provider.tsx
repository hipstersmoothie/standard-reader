import { getQueryClient } from "./query-client";

export function getContext() {
  return {
    queryClient: getQueryClient(),
  };
}
