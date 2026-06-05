import type { OverlayTriggerProps } from "@react-types/overlays";
import type { AriaButtonProps } from "react-aria";
import type {
  MenuProps as AriaMenuProps,
  PopoverProps,
} from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import {
  Children,
  cloneElement,
  createContext,
  use,
  useCallback,
  useRef,
  useState,
} from "react";
import { mergeProps, useMenuTrigger } from "react-aria";
import {
  Menu as AriaMenu,
  MenuContext,
  OverlayTriggerStateContext,
  Popover,
  PopoverContext,
  Provider,
  RootMenuTriggerStateContext,
} from "react-aria-components";
import { useMenuTriggerState } from "react-stately";

import type { Size, StyleXComponentProps } from "../theme/types";

import { SizeContext } from "../context";
import { verticalSpace } from "../theme/semantic-spacing.stylex";
import { usePopoverStyles } from "../theme/usePopoverStyles";

const styles = stylex.create({
  menu: {
    minWidth: 180,
    paddingBottom: verticalSpace["xxs"],
    paddingTop: verticalSpace["xxs"],
  },
});

const ContextMenuTriggerPropsContext = createContext<
  AriaButtonProps & { ref?: React.Ref<HTMLDivElement> }
>({});

interface Position {
  x: number;
  y: number;
}

const ContextMenuStateContext = createContext<{
  position: Position;
  setPosition: (position: Position) => void;
}>({
  position: { x: 0, y: 0 },
  setPosition: () => {},
});

function ContextMenuRoot({
  children,
  ...props
}: OverlayTriggerProps & { children: React.ReactNode }) {
  const scrollRef = useRef(null);
  const state = useMenuTriggerState(props);
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const { menuTriggerProps, menuProps } = useMenuTrigger(
    { ...props, type: "menu" },
    state,
    ref,
  );

  return (
    <Provider
      values={[
        [MenuContext, { ...menuProps, ref: scrollRef }],
        [OverlayTriggerStateContext, state],
        [RootMenuTriggerStateContext, state],
        [ContextMenuTriggerPropsContext, { ...menuTriggerProps, ref }],
        [ContextMenuStateContext, { position, setPosition }],
        [
          PopoverContext,
          {
            trigger: "MenuTrigger",
            triggerRef: ref,
            scrollRef,
            placement: "bottom start",
            "aria-labelledby": menuProps["aria-labelledby"],
          },
        ],
      ]}
    >
      {children}
    </Provider>
  );
}

function ContextMenuTrigger({
  children,
  ...props
}: OverlayTriggerProps & { children: React.ReactNode }) {
  const overlayTriggerState = use(OverlayTriggerStateContext);
  const menuTriggerProps = use(ContextMenuTriggerPropsContext);
  const { position, setPosition } = use(ContextMenuStateContext);
  const onContextMenu = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      overlayTriggerState?.open();
      setPosition({ x: e.pageX, y: e.pageY });
    },
    [overlayTriggerState, setPosition],
  );

  if (Children.count(children) !== 1) {
    throw new Error("ContextMenuTrigger must have exactly one child");
  }

  /* eslint-disable react-hooks/refs */
  return (
    <>
      {cloneElement(
        children as React.ReactElement<React.HTMLAttributes<HTMLElement>>,
        mergeProps(props, {
          "aria-controls": menuTriggerProps["aria-controls"],
          "aria-expanded": menuTriggerProps["aria-expanded"],
          "aria-haspopup": menuTriggerProps["aria-haspopup"],
          id: menuTriggerProps["id"],
          onContextMenu: onContextMenu,
        }),
      )}
      <div
        ref={menuTriggerProps.ref}
        style={{ position: "absolute", top: position.y, left: position.x }}
      />
    </>
  );
  /* eslint-enable react-hooks/refs */
}

export interface ContextMenuProps<T extends object>
  extends
    OverlayTriggerProps,
    StyleXComponentProps<Omit<AriaMenuProps<T>, "children">>,
    Pick<
      PopoverProps,
      | "shouldCloseOnInteractOutside"
      | "shouldFlip"
      | "shouldUpdatePosition"
      | "placement"
    > {
  trigger: React.ReactNode;
  items?: Iterable<T>;
  children: React.ReactNode | ((item: T) => React.ReactNode);
  size?: Size;
}

export function ContextMenu<T extends object>({
  trigger,
  size: sizeProp,
  defaultOpen,
  isOpen,
  onOpenChange,
  shouldCloseOnInteractOutside,
  shouldFlip,
  shouldUpdatePosition,
  placement,
  style,
  ...props
}: ContextMenuProps<T>) {
  const popoverStyles = usePopoverStyles();
  const size = sizeProp || use(SizeContext);

  return (
    <SizeContext value={size}>
      <ContextMenuRoot
        defaultOpen={defaultOpen}
        isOpen={isOpen}
        onOpenChange={onOpenChange}
      >
        <ContextMenuTrigger>{trigger}</ContextMenuTrigger>
        <Popover
          containerPadding={8}
          shouldCloseOnInteractOutside={shouldCloseOnInteractOutside}
          shouldFlip={shouldFlip}
          shouldUpdatePosition={shouldUpdatePosition}
          placement={placement}
          {...stylex.props(
            popoverStyles.wrapper,
            styles.menu,
            popoverStyles.animation,
            style,
          )}
        >
          <AriaMenu {...props} />
        </Popover>
      </ContextMenuRoot>
    </SizeContext>
  );
}
