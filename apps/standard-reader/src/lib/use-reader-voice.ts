import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { user } from "#/integrations/tanstack-query/api-user.functions";

import type { ReaderVoicePreference } from "./reader-voice";
import { DEFAULT_READER_VOICE_PREFERENCE } from "./reader-voice";

export interface ReaderVoiceContextValue {
  preference: ReaderVoicePreference;
  setPreference: (next: ReaderVoicePreference) => void;
  isPending: boolean;
}

export function useReaderVoice(): ReaderVoiceContextValue {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    ...user.getReaderVoicePreferenceQueryOptions,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const preference = data?.preference ?? DEFAULT_READER_VOICE_PREFERENCE;

  const setMutation = useMutation({
    mutationFn: async (next: ReaderVoicePreference) => {
      return await user.setReaderVoicePreference({
        data: { preference: next },
      });
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({
        queryKey: user.getReaderVoicePreferenceQueryOptions.queryKey,
      });
      const previous = queryClient.getQueryData(
        user.getReaderVoicePreferenceQueryOptions.queryKey,
      );
      queryClient.setQueryData(
        user.getReaderVoicePreferenceQueryOptions.queryKey,
        { preference: next },
      );
      return { previous };
    },
    onError: (_error, _next, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(
          user.getReaderVoicePreferenceQueryOptions.queryKey,
          ctx.previous,
        );
      }
    },
    onSuccess: (result) => {
      queryClient.setQueryData(
        user.getReaderVoicePreferenceQueryOptions.queryKey,
        result,
      );
    },
  });

  const setPreference = useCallback(
    (next: ReaderVoicePreference) => {
      if (next === preference) return;
      setMutation.mutate(next);
    },
    [preference, setMutation],
  );

  return {
    preference,
    setPreference,
    isPending: setMutation.isPending,
  };
}
