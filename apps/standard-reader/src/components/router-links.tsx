"use client";

import { Button } from "@standard-reader/design-system/button";
import { IconButton } from "@standard-reader/design-system/icon-button";
import { MenuItem } from "@standard-reader/design-system/menu";
import { createLink } from "@tanstack/react-router";

export const ButtonLink = createLink(Button);
export const IconButtonLink = createLink(IconButton);
export const MenuItemLink = createLink(MenuItem);
