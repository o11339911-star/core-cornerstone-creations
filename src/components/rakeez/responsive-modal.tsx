import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export type ResponsiveModalProps = {
  open?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  trigger?: React.ReactNode | undefined;
  title: React.ReactNode;
  description?: React.ReactNode | undefined;
  footer?: React.ReactNode | undefined;
  children?: React.ReactNode | undefined;
  className?: string | undefined;
};

/**
 * One modal API for the whole platform: a centered dialog on desktop and a
 * bottom drawer on mobile. Always keeps an accessible title.
 */
export function ResponsiveModal({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  footer,
  children,
  className,
}: ResponsiveModalProps) {
  const isMobile = useIsMobile();

  const controlled = {
    ...(typeof open === "boolean" ? { open } : {}),
    ...(onOpenChange ? { onOpenChange } : {}),
  };

  if (isMobile) {
    return (
      <Drawer {...controlled}>
        {trigger ? <DrawerTrigger asChild>{trigger}</DrawerTrigger> : null}
        <DrawerContent className={cn("max-h-[90vh]", className)}>
          <DrawerHeader className="text-start">
            <DrawerTitle>{title}</DrawerTitle>
            {description ? <DrawerDescription>{description}</DrawerDescription> : null}
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-4">{children}</div>
          {footer ? <DrawerFooter className="pt-0">{footer}</DrawerFooter> : null}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog {...controlled}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className={cn("max-h-[85vh] overflow-y-auto sm:max-w-lg", className)}>
        <DialogHeader className="text-start">
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}
