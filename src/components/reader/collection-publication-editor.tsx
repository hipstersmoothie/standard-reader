"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus } from "lucide-react";
import { useState } from "react";

import type { CollectionsPublicationSummary } from "#/integrations/tanstack-query/api-collections.functions";
import { collectionsApi } from "#/integrations/tanstack-query/api-collections.functions";

import { Button } from "@standard-reader/design-system/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@standard-reader/design-system/dialog";
import {
  FileDropDefaultTrigger,
  FileDropZone,
} from "@standard-reader/design-system/file-drop-zone";
import { Flex } from "@standard-reader/design-system/flex";
import { Label } from "@standard-reader/design-system/label";
import { TextArea } from "@standard-reader/design-system/text-area";
import { TextField } from "@standard-reader/design-system/text-field";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import { size } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
} from "@standard-reader/design-system/theme/typography.stylex";
import { PublicationAvatar } from "./primitives";

type JsonObject = { [key: string]: unknown };

const styles = stylex.create({
  headerTitle: {
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontWeight: 600,
  },
  iconPreview: {
    borderRadius: radius.md,
    flexShrink: 0,
  },
  dropZone: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    minHeight: size["10xl"],
    width: "100%",
  },
});

function usePublicationIcon(initialUrl: string | null) {
  const [iconBlob, setIconBlob] = useState<JsonObject | undefined>();
  const [iconUrl, setIconUrl] = useState<string | null>(initialUrl);

  const iconMutation = useMutation(
    collectionsApi.uploadPublicationIconMutationOptions(),
  );

  const onIconFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.slice(result.indexOf(",") + 1);
      if (!base64) return;
      iconMutation.mutate(
        { dataBase64: base64, mimeType: file.type },
        {
          onSuccess: (data) => {
            setIconBlob(data.blob as JsonObject);
            setIconUrl(data.url ?? URL.createObjectURL(file));
          },
        },
      );
    });
    reader.readAsDataURL(file);
  };

  const removeIcon = () => {
    setIconBlob(undefined);
    setIconUrl(null);
  };

  return { iconBlob, iconUrl, iconMutation, onIconFile, removeIcon };
}

function PublicationDetailsFields({
  name,
  setName,
  description,
  setDescription,
  iconUrl,
  iconPending,
  onIconFile,
  onRemoveIcon,
}: {
  name: string;
  setName: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  iconUrl: string | null;
  iconPending: boolean;
  onIconFile: (file: File) => void;
  onRemoveIcon: () => void;
}) {
  const { t } = useLingui();
  return (
    <Flex direction="column" gap="2xl">
      <Flex direction="column" gap="md">
        <Label size="lg">
          <Trans>Icon</Trans>
        </Label>
        {iconUrl ? (
          <PublicationAvatar
            pub={{ name, iconUrl }}
            size="xl"
            style={styles.iconPreview}
          />
        ) : null}
        <FileDropZone
          acceptedFileTypes={["image/*"]}
          isDisabled={iconPending}
          onAddFiles={(files) => {
            if (files[0]) onIconFile(files[0]);
          }}
          style={styles.dropZone}
        >
          <Flex direction="column" gap="sm" align="center">
            <ImagePlus size={16} aria-hidden />
            <span>
              {iconPending
                ? t`Uploading…`
                : iconUrl
                  ? t`Drop or choose a new image`
                  : t`Drop a square image, or choose a file`}
            </span>
          </Flex>
          <FileDropDefaultTrigger>
            {iconUrl ? t`Replace icon` : null}
          </FileDropDefaultTrigger>
        </FileDropZone>
        {iconUrl ? (
          <Button variant="tertiary" size="lg" onPress={onRemoveIcon}>
            <Trans>Remove icon</Trans>
          </Button>
        ) : null}
      </Flex>

      <TextField
        label={t`Series name`}
        placeholder={t`e.g. Dispatches from the Atmosphere`}
        value={name}
        onChange={setName}
        isRequired
        size="lg"
      />

      <TextArea
        label={t`Description`}
        placeholder={t`What is this series about?`}
        value={description}
        onChange={setDescription}
        rows={4}
        size="lg"
      />
    </Flex>
  );
}

function CreatePublicationForm({
  close,
  onCreated,
}: {
  close: () => void;
  onCreated?: (publication: CollectionsPublicationSummary) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const { iconBlob, iconUrl, iconMutation, onIconFile, removeIcon } =
    usePublicationIcon(null);

  const createMutation = useMutation(
    collectionsApi.createCollectionsPublicationMutationOptions(),
  );

  const create = () => {
    const trimmedName = name.trim();
    if (trimmedName.length === 0 || createMutation.isPending) return;
    createMutation.mutate(
      {
        name: trimmedName,
        description: description.trim() || undefined,
        ...(iconBlob ? { icon: iconBlob } : {}),
      },
      {
        onSuccess: (publication) => {
          onCreated?.(publication);
          close();
        },
        onSettled: () => {
          void queryClient.invalidateQueries({
            queryKey: ["reader", "collectionsPublications"],
          });
          void queryClient.invalidateQueries({
            queryKey: ["reader", "collectionsPublication"],
          });
        },
      },
    );
  };

  return (
    <>
      <DialogBody>
        <PublicationDetailsFields
          name={name}
          setName={setName}
          description={description}
          setDescription={setDescription}
          iconUrl={iconUrl}
          iconPending={iconMutation.isPending}
          onIconFile={onIconFile}
          onRemoveIcon={removeIcon}
        />
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onPress={close}>
          <Trans>Cancel</Trans>
        </Button>
        <Button
          variant="primary"
          isDisabled={name.trim().length === 0 || createMutation.isPending}
          onPress={create}
        >
          <Trans>Create series</Trans>
        </Button>
      </DialogFooter>
    </>
  );
}

function PublicationForm({
  publication,
  close,
}: {
  publication: CollectionsPublicationSummary;
  close: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(publication.name);
  const [description, setDescription] = useState(publication.description ?? "");
  const { iconBlob, iconUrl, iconMutation, onIconFile, removeIcon } =
    usePublicationIcon(publication.iconUrl);
  const [iconRemoved, setIconRemoved] = useState(false);

  const saveMutation = useMutation(
    collectionsApi.putCollectionsPublicationMutationOptions(),
  );

  const handleRemoveIcon = () => {
    removeIcon();
    setIconRemoved(true);
  };

  const save = () => {
    const trimmedName = name.trim();
    if (trimmedName.length === 0 || saveMutation.isPending) return;
    saveMutation.mutate(
      {
        publicationRkey: publication.rkey,
        name: trimmedName,
        description: description.trim() || undefined,
        ...(iconRemoved ? { icon: null } : iconBlob ? { icon: iconBlob } : {}),
      },
      {
        onSuccess: close,
        onSettled: () => {
          void queryClient.invalidateQueries({
            queryKey: ["reader", "collectionsPublications"],
          });
          void queryClient.invalidateQueries({
            queryKey: ["reader", "collectionsPublication"],
          });
        },
      },
    );
  };

  return (
    <>
      <DialogBody>
        <PublicationDetailsFields
          name={name}
          setName={setName}
          description={description}
          setDescription={setDescription}
          iconUrl={iconUrl}
          iconPending={iconMutation.isPending}
          onIconFile={(file) => {
            setIconRemoved(false);
            onIconFile(file);
          }}
          onRemoveIcon={handleRemoveIcon}
        />
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onPress={close}>
          <Trans>Cancel</Trans>
        </Button>
        <Button
          variant="primary"
          isDisabled={name.trim().length === 0 || saveMutation.isPending}
          onPress={save}
        >
          <Trans>Save series</Trans>
        </Button>
      </DialogFooter>
    </>
  );
}

/** Create a collections publication (name, description, icon). */
export function CollectionPublicationCreateDialog({
  isOpen,
  onOpenChange,
  onCreated,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (publication: CollectionsPublicationSummary) => void;
}) {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="md"
      trigger={<span hidden aria-hidden />}
    >
      <DialogHeader>
        <span {...stylex.props(styles.headerTitle)}>
          <Trans>New series</Trans>
        </span>
      </DialogHeader>
      <CreatePublicationForm
        key={isOpen ? "open" : "closed"}
        close={() => onOpenChange(false)}
        onCreated={onCreated}
      />
    </Dialog>
  );
}

/** Edit a collections publication's name, description, and icon. */
export function CollectionPublicationEditor({
  isOpen,
  onOpenChange,
  publication,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  publication: CollectionsPublicationSummary;
}) {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="md"
      trigger={<span hidden aria-hidden />}
    >
      <DialogHeader>
        <span {...stylex.props(styles.headerTitle)}>
          <Trans>Edit series</Trans>
        </span>
      </DialogHeader>
      <PublicationForm
        key={isOpen ? publication.rkey : "closed"}
        publication={publication}
        close={() => onOpenChange(false)}
      />
    </Dialog>
  );
}
