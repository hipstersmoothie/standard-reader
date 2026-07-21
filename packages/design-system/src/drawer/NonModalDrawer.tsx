import {
  mergeProps,
  useEnterAnimation,
  useExitAnimation,
} from "@react-aria/utils";
import { use, useRef } from "react";
import { Overlay, useOverlay } from "react-aria";
import { OverlayTriggerStateContext } from "react-aria-components";

export function NonModalDrawer(props: React.ComponentProps<"div">) {
  const state = use(OverlayTriggerStateContext);
  const modalRef = useRef<HTMLDivElement>(null);
  const { overlayProps } = useOverlay(
    { isOpen: state?.isOpen, onClose: state?.close },
    modalRef,
  );
  const entering = useEnterAnimation(modalRef) || false;
  const exiting = useExitAnimation(modalRef, state?.isOpen || false);

  if (!state?.isOpen && !exiting) {
    return null;
  }

  return (
    <Overlay isExiting={exiting}>
      <div
        {...mergeProps(overlayProps, props)}
        ref={modalRef}
        data-entering={entering || undefined}
        data-exiting={exiting || undefined}
      />
    </Overlay>
  );
}
