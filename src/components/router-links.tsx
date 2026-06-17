"use client";

import { createLink } from "@tanstack/react-router";
import { Button } from "#/design-system/button";
import { IconButton } from "#/design-system/icon-button";
import { MenuItem } from "#/design-system/menu";

export const ButtonLink = createLink(Button);
export const IconButtonLink = createLink(IconButton);
export const MenuItemLink = createLink(MenuItem);
