"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Bell,
  Building2,
  FilePlus2,
  History,
  LayoutDashboard,
  Menu,
  ScrollText,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import type { AppNotification, SessionUser } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/opcos", label: "OPCO Selection", icon: Building2 },
  { href: "/verification/new", label: "New Verification", icon: FilePlus2 },
  { href: "/verification/history", label: "Live verification", icon: History },
  { href: "/audit", label: "Audit log", icon: ScrollText },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState("Not selected");
  const [opco, setOpco] = useState("Ayoba");
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    api<{ user: SessionUser }>("/api/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => undefined);
    api<{ notifications: AppNotification[] }>("/api/notifications")
      .then((data) => setNotifications(data.notifications))
      .catch(() => undefined);
    const syncPeriod = () => {
      const stored = localStorage.getItem("ghg-hub-period");
      if (stored) setPeriod(stored);
    };
    api<{ latestPeriod: string; activeOpco: string }>("/api/dashboard")
      .then((data) => {
        setPeriod(localStorage.getItem("ghg-hub-period") || data.latestPeriod);
        setOpco(localStorage.getItem("ghg-hub-opco") || data.activeOpco);
      })
      .catch(() => undefined);
    window.addEventListener("ghg-hub-period-changed", syncPeriod);
    return () => window.removeEventListener("ghg-hub-period-changed", syncPeriod);
  }, [pathname, router]);

  async function markRead() {
    await api("/api/notifications", { method: "POST" });
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
  }

  const unread = notifications.filter((item) => !item.read).length;
  const sidebar = (
    <div className="flex h-full flex-col bg-[#0c2340] text-white">
      <div className="border-b border-white/10 px-5 py-5">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-blue-200">Internal workspace</p>
        <p className="mt-1 text-lg font-semibold">GHG Verification Hub</p>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm",
                active ? "bg-[#1d4e89] text-white" : "text-slate-200 hover:bg-white/10",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f4f6f8]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 md:block">{sidebar}</aside>
      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button className="absolute inset-0 bg-slate-950/40" onClick={() => setOpen(false)} aria-label="Close menu" />
          <div className="relative h-full w-72">{sidebar}</div>
        </div>
      ) : null}
      <div className="md:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-[#e4e9f0] bg-white px-4 md:px-8">
          <div className="flex items-center gap-3">
            <button className="rounded-md p-2 text-slate-600 hover:bg-slate-100 md:hidden" onClick={() => setOpen((value) => !value)} aria-label="Open menu">
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div>
              <p className="text-sm font-semibold text-[#0c2340]">GHG Verification Hub</p>
              <p className="text-xs text-slate-500">{opco} · {period}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="relative rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label="Notifications">
                  <Bell className="h-5 w-5" />
                  {unread > 0 ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#1d4e89]" /> : null}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <div className="flex items-center justify-between px-3 py-2">
                  <p className="text-sm font-medium text-[#0c2340]">Notifications</p>
                  {unread > 0 ? <button className="text-xs text-[#1d4e89]" onClick={markRead}>Mark read</button> : null}
                </div>
                {notifications.length === 0 ? <p className="px-3 py-4 text-sm text-slate-500">No notifications yet.</p> : null}
                {notifications.slice(0, 6).map((item) => (
                  <DropdownMenuItem key={item.id} onSelect={() => item.href && router.push(item.href)}>
                    <span className="block font-medium">{item.title}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{item.body}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0c2340] text-xs font-semibold text-white">
                {user?.name.slice(0, 1) ?? "W"}
              </span>
              <span className="hidden sm:block">
                <span className="block text-sm font-medium text-slate-800">{user?.name ?? "Workspace user"}</span>
                <span className="block text-xs text-slate-500">GHG Verification Hub</span>
              </span>
            </div>
          </div>
        </header>
        <main className="px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
