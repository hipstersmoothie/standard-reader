import { useCallback, useEffect, useRef, useState } from "react";

const noop = () => {};

export function usePointerLock({
  onMove: onMoveProp,
}: {
  onMove?: (e: { deltaX: number; deltaY: number }) => void;
}) {
  const onMove = useRef(onMoveProp ?? noop);
  useEffect(() => {
    onMove.current = onMoveProp ?? noop;
  }, [onMoveProp]);
  const elementRef = useRef<HTMLElement | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [pointerPosition, setPointerPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Handle pointer lock state changes
  useEffect(() => {
    const handlePointerLockChange = () => {
      const isCurrentlyLocked =
        document.pointerLockElement === elementRef.current;
      setIsLocked(isCurrentlyLocked);

      if (!isCurrentlyLocked) {
        setPointerPosition(null);
      }
    };

    const handlePointerLockError = () => {
      setIsLocked(false);
      setPointerPosition(null);
    };

    document.addEventListener("pointerlockchange", handlePointerLockChange);
    document.addEventListener("pointerlockerror", handlePointerLockError);

    return () => {
      document.removeEventListener(
        "pointerlockchange",
        handlePointerLockChange,
      );
      document.removeEventListener("pointerlockerror", handlePointerLockError);
    };
  }, []);

  // Track mouse movement while locked
  useEffect(() => {
    if (!isLocked) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!elementRef.current) return;

      // Get current cursor position or initialize it
      setPointerPosition((prev) => {
        const currentX = prev?.x ?? window.innerWidth / 2;
        const currentY = prev?.y ?? window.innerHeight / 2;

        // Calculate new position with movement deltas
        let newX = currentX + e.movementX;
        let newY = currentY + e.movementY;

        // Wrap around screen edges
        if (newX < 0) {
          newX = window.innerWidth;
        } else if (newX > window.innerWidth) {
          newX = 0;
        }

        if (newY < 0) {
          newY = window.innerHeight;
        } else if (newY > window.innerHeight) {
          newY = 0;
        }

        onMove.current({
          deltaX: e.movementX,
          deltaY: e.movementY,
        });

        return { x: newX, y: newY };
      });
    };

    document.addEventListener("mousemove", handleMouseMove);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
    };
  }, [isLocked]);

  // Request pointer lock on pointer down
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return; // Only handle primary button
    if (e.target instanceof HTMLInputElement) return;

    const target = e.currentTarget as HTMLElement;
    elementRef.current = target;

    // Initialize cursor position
    setPointerPosition({ x: e.clientX, y: e.clientY });

    // Request pointer lock
    void target.requestPointerLock();
  }, []);

  // Handle pointer up to exit pointer lock
  useEffect(() => {
    if (!isLocked) return;

    const handlePointerUp = () => {
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    };

    document.addEventListener("pointerup", handlePointerUp);
    return () => {
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isLocked]);

  // Handle escape key or other unlock scenarios
  useEffect(() => {
    if (!isLocked) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && document.pointerLockElement) {
        document.exitPointerLock();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLocked]);

  return {
    isLocked,
    cursorProps: {
      style: {
        cursor: "ew-resize",
        position: "fixed",
        top: pointerPosition?.y ?? 0,
        left: pointerPosition?.x ?? 0,
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
      },
    } as React.ComponentProps<"div">,
    lockProps: {
      onPointerDown,
    },
  };
}
