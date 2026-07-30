# UI & Architecture Audit Report

This document provides a comprehensive audit of the frontend UI layer, component organization, styling system, and design patterns across the `doit-prod` codebase.

---

## 1. Shadcn/UI Component Inventory

The project utilizes **Shadcn/UI** as its core primitive design system. All primitive UI components reside in `frontend/src/components/ui/` and leverage `@radix-ui` headless primitives paired with **Class Variance Authority (CVA)** and **Tailwind CSS v4** utility classes.

| Component | File Path | Type | Customized? | Safe to Modify? | Usage across Application |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Avatar** | `components/ui/avatar.tsx` | Shadcn Primitive (Radix) | Standard | Yes | User profiles, Layout, Task assignees |
| **Badge** | `components/ui/badge.tsx` | Shadcn Primitive (CVA) | Extended (Success/Warning) | Yes | Status pills, Priority badges, Counts |
| **Button** | `components/ui/button.tsx` | Shadcn Primitive (CVA) | Extended (icon-sm variant) | Yes | Application-wide interactive actions |
| **Card** | `components/ui/card.tsx` | Shadcn Primitive | Standard | Yes | Dashboard widgets, Task cards, Empty states |
| **Dialog** | `components/ui/dialog.tsx` | Shadcn Primitive (Radix) | Standard | Yes | Modals (Add Task, Add Member, Create Project) |
| **DropdownMenu** | `components/ui/dropdown-menu.tsx` | Shadcn Primitive (Radix) | Standard | Yes | Row actions, User profile menu |
| **Input** | `components/ui/input.tsx` | Shadcn Primitive | Standard | Yes | Form fields, Search inputs |
| **Label** | `components/ui/label.tsx` | Shadcn Primitive (Radix) | Standard | Yes | Form field labels |
| **ScrollArea** | `components/ui/scroll-area.tsx` | Shadcn Primitive (Radix) | Standard | Yes | Navigation sidebar, Task detail drawers |
| **Separator** | `components/ui/separator.tsx` | Shadcn Primitive (Radix) | Standard | Yes | Section dividers |
| **Skeleton** | `components/ui/skeleton.tsx` | Shadcn Primitive | Standard | Yes | Async loading placeholders |
| **Toast** | `components/ui/toast.tsx` | Shadcn Primitive (Radix) | Custom variants added | Yes | Notification toasts |
| **Toaster** | `components/ui/toaster.tsx` | Shadcn Primitive | Standard | Yes | Global toast viewport container |
| **Tooltip** | `components/ui/tooltip.tsx` | Shadcn Primitive (Radix) | Standard | Yes | Icon tooltips, Collapsed sidebar tooltips |

### Modifications & Customization Summary
- **Button (`button.tsx`)**: Added `icon-sm` size variant for compact table/header action triggers.
- **Badge (`badge.tsx`)**: Added `warning` and `info` variant rules matching semantic color variables.
- **Toast (`toast.tsx`)**: Customized success (`bg-success`) and error (`bg-destructive`) toast popups.

---

## 2. UI Architecture & Folder Structure

```
frontend/src/
├── api.ts              # Centralized Axios client with JWT interceptor & auto-redirects
├── index.css           # Design Tokens (CSS Variables) & Tailwind v4 root config
├── main.tsx            # App router, TanStack Query provider & Theme initializer
├── components/
│   ├── ui/            # Headless Shadcn/UI primitives (Radix UI + CVA)
│   └── Common/        # Reusable custom page components (e.g. NotFound.tsx)
├── hooks/             # Custom React hooks & TanStack Query v5 data-fetching layer
│   ├── useAuth.ts     # Authentication state & JWT storage management
│   ├── useTheme.ts    # Dark mode toggle (.dark class on <html>)
│   ├── useTasks.ts    # Task queries & mutation hooks (create, update, delete)
│   ├── useProjects.ts # Project queries & mutation hooks
│   └── use-toast.ts   # Toast dispatch hook
├── lib/
│   └── utils.ts       # cn() helper combining clsx and tailwind-merge
└── pages/             # Route-level containers & view pages
    ├── Layout.tsx     # Responsive app shell (sidebar, mobile drawer, topbar)
    ├── TasksPage.tsx  # Monday.com-inspired task management table
    └── ...            # Other application views
```

---

## 3. Styling System & Tailwind CSS v4

- **Tailwind CSS Version**: **v4.3.3** integrated via `@tailwindcss/vite`.
- **Primary Design Tokens**: Defined as semantic HSL CSS variables in `src/index.css`:
  - **Primary (Indigo)**: `--primary: 238 84% 60%`
  - **Secondary (Slate)**: `--secondary: 215 16% 47%`
  - **Success (Emerald)**: `--success: 160 84% 39%`
  - **Warning (Amber)**: `--warning: 43 96% 56%`
  - **Destructive (Red)**: `--destructive: 0 84% 60%`
  - **Info (Blue)**: `--info: 217 91% 60%`
- **Dark Mode**: Configured via class-based strategy (`.dark` on `document.documentElement`). All Shadcn primitives support dark mode out of the box using `dark:` Tailwind variants.

---

## 4. Component & Data Fetching Patterns

1. **Data Fetching**: **TanStack Query v5** (`useQuery`, `useMutation`). Raw `useEffect` data fetching is prohibited.
2. **Cache Invalidation**: Mutations automatically invalidate affected Query Keys (`["tasks"]`, `["project", id]`, `["projects"]`) upon success to guarantee synchronized UI states.
3. **Form Handling**: Native HTML5 forms or React Hook Form combined with Zod validation schemas.
4. **Conditional Styles**: Always composed using the `cn(...)` utility helper (`twMerge(clsx(...))`).
