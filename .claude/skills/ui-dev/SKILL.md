---
name: ui-dev
description: Build UI components with dark theme, shadcn/ui, animations, and responsive design
---

# UI Development Skill

## CRITICAL: File Size Limits

**HARD LIMIT: 300 lines per file maximum. NO EXCEPTIONS.**

Before writing any component:
1. If file would exceed 300 lines → decompose FIRST
2. If component has 3+ useState → extract to hook
3. If component has tabs/sections → split into separate files

See **code-structure** skill for detailed decomposition patterns.

## BEFORE WRITING ANY CODE

1. **Check `docs/issues/ui/README.md`** for known pitfalls
2. **Check shadcn/ui via Context7:**

```
1. ALWAYS check if shadcn/ui has the component first:
   mcp__context7__resolve-library-id({ libraryName: "shadcn-ui" })

   mcp__context7__get-library-docs({
     context7CompatibleLibraryID: "/shadcn-ui/ui",
     topic: "button",
     mode: "code"
   })

2. If shadcn has it: use their component, don't build custom
3. If shadcn doesn't have it: build custom following their patterns
```

---

## When to Use This Skill

Load this skill when:
- Creating new React components
- Styling existing components
- Adding animations or transitions
- Building responsive layouts
- Working with shadcn/ui components

## Core Rules

1. **shadcn/ui First** - Always check if a component exists before building custom
2. **Dark Theme Only** - Use CSS variables, never hardcode colors
3. **Mobile First** - Start with mobile layout, add breakpoints up
4. **Semantic HTML** - Use correct elements (button, nav, main, etc.)
5. **Accessible** - Include aria labels, keyboard navigation, focus states

## Decision Tree

```
Need a new component?
├─ Is it a form element? → Check shadcn/ui first
├─ Is it a layout? → Use CSS Grid/Flexbox with responsive breakpoints
├─ Is it interactive? → Add hover states + transitions
└─ Is it loading data? → Add skeleton + loading state

Need to style something?
├─ Color → Use theme variables (--primary, --muted, etc.)
├─ Spacing → Use Tailwind scale (p-4, gap-6, etc.)
├─ Animation → Use predefined keyframes or transition-all
└─ Responsive → Mobile-first: base → md: → lg:
```

## Common Tasks

### Adding a New Component

1. Look up shadcn/ui components via Context7 first
2. If shadcn has it: `cd frontend && npx shadcn@latest add <name>`
3. If custom: create file at `components/<category>/<name>.tsx`
4. Use theme variables for colors (never hardcode)
5. Add responsive breakpoints (mobile-first)
6. Include loading and error states

### Installing shadcn Components

```bash
cd frontend && npx shadcn@latest add button card dialog input select tabs toast
```

Common components: `button`, `card`, `dialog`, `dropdown-menu`, `input`, `label`, `select`, `skeleton`, `table`, `tabs`, `toast`, `tooltip`

## Theme System

All colors use HSL CSS variables defined in `frontend/app/globals.css`:

| Variable | Usage | Example Class |
|----------|-------|---------------|
| `--background` | Page background | `bg-background` |
| `--foreground` | Primary text | `text-foreground` |
| `--card` | Card backgrounds | `bg-card` |
| `--primary` | Primary actions | `bg-primary text-primary-foreground` |
| `--secondary` | Secondary elements | `bg-secondary` |
| `--muted` | Muted text/backgrounds | `text-muted-foreground bg-muted` |
| `--accent` | Hover states | `hover:bg-accent` |
| `--destructive` | Error/danger | `bg-destructive text-destructive-foreground` |
| `--border` | Borders | `border-border` |

## Responsive Breakpoints

| Breakpoint | Min Width | Usage |
|------------|-----------|-------|
| (default) | 0px | Mobile phones |
| `sm:` | 640px | Large phones |
| `md:` | 768px | Tablets |
| `lg:` | 1024px | Laptops |
| `xl:` | 1280px | Desktops |
| `2xl:` | 1536px | Large screens |

## Anti-Patterns (NEVER DO)

```tsx
// NEVER hardcode colors
<div className="bg-gray-900 text-white">

// Use theme variables
<div className="bg-background text-foreground">

// NEVER skip loading states
{data && <Component data={data} />}

// Handle all states
{loading ? <Skeleton /> : error ? <Error /> : <Component data={data} />}

// NEVER forget mobile
<div className="flex gap-8">  // Too much gap on mobile

// Responsive spacing
<div className="flex gap-4 md:gap-8">
```

## Component Structure for MoveIntent

### Intent Form Components

```
components/intent/
├── swap-form.tsx         # Swap intent form (< 200 lines)
├── limit-form.tsx        # Limit order form (< 200 lines)
├── token-selector.tsx    # Token selection dropdown (< 150 lines)
├── amount-input.tsx      # Amount input with max button (< 100 lines)
├── price-input.tsx       # Price input for limits (< 100 lines)
└── intent-status.tsx     # Status display (< 100 lines)
```

### Shared Components

```
components/shared/
├── connect-button.tsx    # Wallet connect (Privy)
├── loading-spinner.tsx   # Loading indicator
├── transaction-toast.tsx # Transaction status toast
└── error-display.tsx     # Error message display
```

## Hook Extraction Pattern

```tsx
// BEFORE: Logic in component (BAD)
function SwapForm() {
  const [inputToken, setInputToken] = useState(null)
  const [outputToken, setOutputToken] = useState(null)
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // 50 lines of quote fetching logic
  }, [deps])

  return (/* 200 lines of JSX */)
}

// AFTER: Logic in hook (GOOD)
// hooks/use-swap.ts
export function useSwap() {
  const [inputToken, setInputToken] = useState(null)
  const [outputToken, setOutputToken] = useState(null)
  // ... logic
  return { inputToken, outputToken, quote, submitSwap }
}

// Component is now simpler
function SwapForm() {
  const { inputToken, outputToken, quote, submitSwap } = useSwap()
  return (/* Clean JSX */)
}
```

## Related Skills

- **code-structure** - For file size limits and decomposition patterns
- **web3-integration** - For wallet/transaction UI components

## Quick Reference

| Task | Solution |
|------|----------|
| Add component | `cd frontend && npx shadcn@latest add <name>` |
| Custom color | Add to globals.css + tailwind.config.ts |
| Icon | `import { IconName } from 'lucide-react'` |
| Icon sizes | `h-4 w-4` (sm), `h-5 w-5` (md), `h-6 w-6` (lg) |
| Hover effect | `transition-all duration-300 hover:...` |
| Focus ring | `focus:ring-2 focus:ring-primary focus:ring-offset-2` |
