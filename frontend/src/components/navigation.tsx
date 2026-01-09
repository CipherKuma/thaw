"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ConnectButton } from "./connect-button";
import { NetworkSelector } from "./network-selector";
import {
  Coins,
  Wallet,
  TrendingUp,
  Zap,
  LayoutDashboard,
} from "lucide-react";

const navItems = [
  {
    name: "Stake",
    href: "/",
    icon: Coins,
    description: "Stake CSPR, get thCSPR",
  },
  {
    name: "Lend",
    href: "/lend",
    icon: Wallet,
    description: "Deposit CSPR to earn yield",
  },
  {
    name: "Borrow",
    href: "/borrow",
    icon: TrendingUp,
    description: "Use thCSPR as collateral",
  },
  {
    name: "Leverage",
    href: "/leverage",
    icon: Zap,
    description: "1-4x leveraged staking",
  },
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    description: "View your positions",
  },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm pb-2">
      <div className="container relative flex h-16 items-center justify-center">
        {/* Logo - Left */}
        <div className="absolute left-4">
          <Link href="/" className="flex items-center -my-4">
            <Image
              src="/thaw-text.png"
              alt="Thaw"
              width={500}
              height={500}
              className="h-24 w-24"
              priority
            />
          </Link>
        </div>

        {/* Nav - Center */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Wallet - Right */}
        <div className="absolute right-4 flex items-center gap-2">
          <NetworkSelector />
          <ConnectButton />
        </div>
      </div>

      {/* Mobile navigation */}
      <nav className="md:hidden border-t">
        <div className="container flex justify-around py-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 px-3 py-1 rounded-lg text-xs transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
