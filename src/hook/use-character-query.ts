import { useCallback } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createCharacter,
  deleteCharacter,
  listCharacters,
  updateCharacter,
  type Character,
  type CharacterInput,
} from "@/lib/api";
import { queryKey } from "@/lib/query-key";

export const useCharacterQuery = () => {
  const queryClient = useQueryClient();

  const {
    data: characters = [],
    isPending,
    isFetching,
  } = useQuery({
    queryKey: queryKey.characterList,
    queryFn: listCharacters,
  });

  const createCharacterMutation = useMutation({
    mutationFn: createCharacter,
    onSuccess: (character) => {
      queryClient.setQueryData<Character[]>(queryKey.characterList, (previous) =>
        previous ? [character, ...previous] : [character],
      );
    },
  });

  const updateCharacterMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: CharacterInput }) =>
      updateCharacter(id, input),
    onSuccess: (_, { id, input }) => {
      queryClient.setQueryData<Character[]>(queryKey.characterList, (previous) =>
        previous
          ? previous.map((c) =>
              c.id === id
                ? {
                    ...c,
                    name: input.name,
                    avatar: input.avatar ?? null,
                    systemPrompt: input.systemPrompt,
                    greeting: input.greeting,
                    tags: input.tags,
                  }
                : c,
            )
          : [],
      );
    },
  });

  const deleteCharacterMutation = useMutation({
    mutationFn: deleteCharacter,
    onSuccess: (_, id) => {
      queryClient.setQueryData<Character[]>(queryKey.characterList, (previous) =>
        previous ? previous.filter((c) => c.id !== id) : [],
      );
    },
  });

  const createCharacterEntry = useCallback(
    async (input: CharacterInput) => createCharacterMutation.mutateAsync(input),
    [createCharacterMutation],
  );

  const updateCharacterEntry = useCallback(
    async (id: string, input: CharacterInput) =>
      updateCharacterMutation.mutateAsync({ id, input }),
    [updateCharacterMutation],
  );

  const deleteCharacterEntry = useCallback(
    async (id: string) => deleteCharacterMutation.mutateAsync(id),
    [deleteCharacterMutation],
  );

  return {
    characters,
    isLoading: isPending || isFetching,
    createCharacterEntry,
    updateCharacterEntry,
    deleteCharacterEntry,
  };
};
