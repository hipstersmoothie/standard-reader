import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ListPlus } from "lucide-react";

import { IconButton } from "#/design-system/icon-button";
import { Menu, MenuItem } from "#/design-system/menu";
import { listApi } from "#/integrations/tanstack-query/api-lists.functions";

/**
 * Menu that toggles a user's membership across the signed-in reader's lists —
 * how followed people get "sorted into lists". Each list shows a check when the
 * user is already a member; selecting toggles membership (writes through to the
 * list record + read-model, then refreshes lists + sidebar).
 */
export function AddToListButton({
  did,
  size = "md",
}: {
  did: string;
  size?: "sm" | "md";
}) {
  const queryClient = useQueryClient();
  const { data: lists } = useQuery(listApi.getListsQueryOptions());
  const addMutation = useMutation(listApi.addUserToListMutationOptions());
  const removeMutation = useMutation(
    listApi.removeUserFromListMutationOptions(),
  );

  const iconSize = size === "md" ? 15 : 14;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["reader", "lists"] });
    void queryClient.invalidateQueries({ queryKey: ["feed", "sidebar"] });
  };

  const toggle = (rkey: string, isMember: boolean) => {
    const mutation = isMember ? removeMutation : addMutation;
    mutation.mutate({ rkey, did }, { onSettled: refresh });
  };

  const trigger = (
    <IconButton variant="secondary" size={size} label="Add to list">
      <ListPlus size={iconSize} />
    </IconButton>
  );

  return (
    <Menu trigger={trigger}>
      {(lists ?? []).length === 0 ? (
        <MenuItem isDisabled>No lists yet</MenuItem>
      ) : (
        (lists ?? []).map((list) => {
          const isMember = list.users.includes(did);
          return (
            <MenuItem
              key={list.rkey}
              onPress={() => toggle(list.rkey, isMember)}
              suffix={isMember ? <Check size={14} /> : undefined}
            >
              {list.name}
            </MenuItem>
          );
        })
      )}
    </Menu>
  );
}
