"use client";

import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:glass-card group-[.toaster]:text-foreground group-[.toaster]:border-white/50 group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl",
          title: "group-[.toast]:font-semibold",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-sm",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-lg group-[.toast]:px-4 group-[.toast]:py-2 group-[.toast]:text-sm group-[.toast]:font-medium group-[.toast]:shadow-sm group-[.toast]:hover:opacity-90 group-[.toast]:transition-opacity",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-lg group-[.toast]:px-4 group-[.toast]:py-2 group-[.toast]:text-sm",
          success:
            "group-[.toaster]:glass-card group-[.toaster]:border-green-500/30 group-[.toaster]:text-foreground [&>svg]:text-green-500",
          error:
            "group-[.toaster]:glass-card group-[.toaster]:border-destructive/30 group-[.toaster]:text-foreground [&>svg]:text-destructive",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
