"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  Shield, LayoutDashboard, UserPlus, Users, Server, Bot, Share2,
  ArrowLeftRight, Briefcase, Building2, ClipboardList, Settings,
  ChevronLeft, ChevronRight, ChevronDown, LogOut, Activity,
} from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import { useOperatorTasks } from "./operator-tasks-context";

interface NavItem {
  label: string;
  href?: string;
  icon: React.ElementType;
  badge?: string;
  /** Corresponds to TASKS[n].id — used to filter access for Operators */
  taskId?: string;
  children?: NavItem[];
}

// Static nav definition — taskId links each IAM task child to its TASKS entry
const NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  {
    label: "IAM Tasks",
    icon: Activity,
    children: [
      { label: "Add User to Group",  href: "/tasks/add-user-to-group",  icon: UserPlus,      taskId: "ADD_USER_TO_GROUP"        },
      { label: "Bulk Add Users",     href: "/tasks/bulk-add-users",     icon: Users,         taskId: "BULK_ADD_USERS_TO_GROUP"  },
      { label: "Service Accounts",   href: "/tasks/service-accounts",   icon: Server,        taskId: "CREATE_SERVICE_ACCOUNTS"  },
      { label: "RPA Accounts",       href: "/tasks/rpa-accounts",       icon: Bot,           taskId: "CREATE_RPA_ACCOUNTS"      },
      { label: "Shared Accounts",    href: "/tasks/shared-accounts",    icon: Share2,        taskId: "CREATE_SHARED_ACCOUNTS"   },
      { label: "IL to EL Conversion",href: "/tasks/il-to-el",          icon: ArrowLeftRight, taskId: "IL_TO_EL_CONVERSION"     },
      { label: "Onboard Workday",    href: "/tasks/onboard-workday",    icon: Briefcase,     taskId: "ONBOARD_WORKDAY"          },
      { label: "Onboard VNDLY ELs",  href: "/tasks/onboard-vndly",     icon: Building2,     taskId: "ONBOARD_VNDLY"            },
    ],
  },
  { label: "Audit & Logs", href: "/audit", icon: ClipboardList },
  { label: "Settings",     href: "/settings", icon: Settings    },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { isTaskEnabled } = useOperatorTasks();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(["IAM Tasks"]);

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) =>
      prev.includes(label) ? prev.filter((g) => g !== label) : [...prev, label]
    );
  };

  const isActive = (href?: string) => href && pathname === href;
  const isGroupActive = (children?: NavItem[]) =>
    children?.some((c) => c.href && pathname.startsWith(c.href));

  const isAdmin = session?.user?.role === "ADMIN";

  // Build the visible nav based on role + operator task access settings
  const visibleNav: NavItem[] = NAV.flatMap((item) => {
    // Settings is ADMIN-only
    if (item.href === "/settings") return isAdmin ? [item] : [];

    // IAM Tasks group — filter children for Operators based on admin toggles
    if (item.children) {
      const visibleChildren = item.children.filter((child) => {
        // If the child has a taskId, apply the operator access check
        if (child.taskId) return isTaskEnabled(child.taskId);
        return true;
      });
      // Hide the whole group if no children are visible
      if (visibleChildren.length === 0) return [];
      return [{ ...item, children: visibleChildren }];
    }

    return [item];
  });

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-sidebar border-r border-sidebar-border transition-all duration-300 relative",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className={cn("flex items-center gap-3 px-4 py-5 border-b border-sidebar-border", collapsed && "justify-center px-2")}>
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
          <Shield className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground truncate leading-tight">AD Identity</p>
            <p className="text-xs text-muted-foreground truncate leading-tight">Management Portal</p>
          </div>
        )}
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-[4.5rem] w-6 h-6 rounded-full bg-sidebar border border-sidebar-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors z-10 shadow-sm"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto no-scrollbar py-4 px-2">
        {visibleNav.map((item) => {
          if (item.children) {
            const isOpen = expandedGroups.includes(item.label);
            const groupActive = isGroupActive(item.children);
            return (
              <div key={item.label} className="mb-1">
                {!collapsed && (
                  <button
                    onClick={() => toggleGroup(item.label)}
                    className={cn(
                      "nav-item w-full justify-between",
                      groupActive && "text-sidebar-foreground"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className="w-4 h-4 flex-shrink-0" />
                      <span>{item.label}</span>
                    </div>
                    <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", isOpen && "rotate-180")} />
                  </button>
                )}
                {collapsed && (
                  <div className="nav-item justify-center" title={item.label}>
                    <item.icon className="w-4 h-4" />
                  </div>
                )}
                {!collapsed && isOpen && (
                  <div className="ml-4 mt-1 space-y-0.5 border-l border-sidebar-border pl-3">
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href!}
                        prefetch={true}
                        className={cn("nav-item", isActive(child.href) && "active")}
                      >
                        <child.icon className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="text-xs">{child.label}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href!}
              prefetch={true}
              className={cn("nav-item mb-0.5", isActive(item.href) && "active", collapsed && "justify-center")}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className={cn("border-t border-sidebar-border p-3", collapsed && "px-2")}>
        {!collapsed ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/30 to-violet-500/30 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-indigo-400">
                {getInitials(session?.user?.name ?? session?.user?.email ?? "U")}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold text-foreground truncate">{session?.user?.name ?? "User"}</p>
                {session?.user?.role && (
                  <span className={cn(
                    "flex-shrink-0 text-[9px] font-bold px-1 py-0.5 rounded uppercase tracking-wide",
                    session.user.role === "ADMIN"
                      ? "bg-violet-500/20 text-violet-400"
                      : "bg-indigo-500/15 text-indigo-400",
                  )}>
                    {session.user.role === "ADMIN" ? "Admin" : "Operator"}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">{session?.user?.email}</p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-muted-foreground hover:text-rose-400 transition-colors p-1 rounded"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="nav-item justify-center w-full"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </aside>
  );
}
