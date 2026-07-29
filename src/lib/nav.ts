import {
  LayoutDashboard,
  Users,
  UserSquare2,
  Wallet,
  GraduationCap,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { AppRole } from "./roles";

export type NavChild = {
  to: string;
  label: string;
  roles?: AppRole[];
};

export type NavItem = {
  to?: string;
  label: string;
  icon: LucideIcon;
  emoji: string;
  children?: NavChild[];
  roles?: AppRole[];
};

export const NAV: NavItem[] = [
  { to: "/overview", label: "Огляд бізнесу", icon: LayoutDashboard, emoji: "🏠" },
  { to: "/leads", label: "Ліди", icon: Users, emoji: "👥" },
  {
    label: "Клієнти",
    icon: UserSquare2,
    emoji: "👨‍👩‍👧",
    children: [
      { to: "/clients", label: "Клієнти" },
      { to: "/clients/children", label: "Діти" },
    ],
  },
  {
    label: "Фінанси",
    icon: Wallet,
    emoji: "💰",
    children: [
      { to: "/finance/settlements", label: "Розрахунки" },
      { to: "/finance/payroll", label: "Зарплати" },
      { to: "/finance/expenses", label: "Витрати" },
      { to: "/finance/cash-flow", label: "Cash Flow" },
      { to: "/finance/pnl", label: "P&L" },
    ],
  },
  { to: "/staff", label: "Працівники", icon: GraduationCap, emoji: "👩‍🏫" },
  {
    label: "Адміністрування",
    icon: Settings,
    emoji: "⚙️",
    children: [
      { to: "/admin/branches", label: "Філії" },
      { to: "/admin/users", label: "Користувачі" },
      { to: "/admin/roles", label: "Ролі" },
      { to: "/admin/groups", label: "Групи" },
      { to: "/admin/services", label: "Послуги" },
      { to: "/admin/subscription-plans", label: "Тарифні плани" },
      { to: "/admin/price-lists", label: "Прайс-листи" },
      { to: "/admin/discounts", label: "Знижки" },
      { to: "/admin/payment-methods", label: "Методи оплати" },
      { to: "/admin/contract-templates", label: "Шаблони договорів" },
      { to: "/admin/expense-categories", label: "Категорії витрат" },
      { to: "/admin/income-categories", label: "Категорії доходів" },
      { to: "/admin/lead-sources", label: "Джерела лідів" },
      { to: "/admin/lead-statuses", label: "Статуси лідів" },
      { to: "/admin/email-templates", label: "Шаблони листів" },
    ],
  },
];
