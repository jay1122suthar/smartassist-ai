---
name: SmartAssist AI
colors:
  surface: '#fcf8ff'
  surface-dim: '#dad7f1'
  surface-bright: '#fcf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f2ff'
  surface-container: '#efecff'
  surface-container-high: '#e8e5ff'
  surface-container-highest: '#e2e0fa'
  on-surface: '#1a1a2c'
  on-surface-variant: '#474554'
  inverse-surface: '#2f2f42'
  inverse-on-surface: '#f2efff'
  outline: '#777585'
  outline-variant: '#c8c4d6'
  surface-tint: '#544bcb'
  primary: '#4a40c1'
  on-primary: '#ffffff'
  primary-container: '#635bdb'
  on-primary-container: '#f2eeff'
  inverse-primary: '#c4c0ff'
  secondary: '#5e5d6d'
  on-secondary: '#ffffff'
  secondary-container: '#e4e0f4'
  on-secondary-container: '#646373'
  tertiary: '#4c5660'
  on-tertiary: '#ffffff'
  tertiary-container: '#646e79'
  on-tertiary-container: '#e7f1fe'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e3dfff'
  primary-fixed-dim: '#c4c0ff'
  on-primary-fixed: '#120068'
  on-primary-fixed-variant: '#3b2fb3'
  secondary-fixed: '#e4e0f4'
  secondary-fixed-dim: '#c8c4d7'
  on-secondary-fixed: '#1b1a28'
  on-secondary-fixed-variant: '#464555'
  tertiary-fixed: '#d9e3f0'
  tertiary-fixed-dim: '#bdc7d4'
  on-tertiary-fixed: '#131d26'
  on-tertiary-fixed-variant: '#3e4852'
  background: '#fcf8ff'
  on-background: '#1a1a2c'
  surface-variant: '#e2e0fa'
typography:
  headline-xl:
    fontFamily: Geist
    fontSize: 2.25rem
    fontWeight: '600'
    lineHeight: 2.75rem
    letterSpacing: -0.025em
  headline-xl-mobile:
    fontFamily: Geist
    fontSize: 1.75rem
    fontWeight: '600'
    lineHeight: 2.25rem
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Geist
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Geist
    fontSize: 1.25rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: -0.015em
  title-md:
    fontFamily: Geist
    fontSize: 1.125rem
    fontWeight: '500'
    lineHeight: 1.625rem
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: '400'
    lineHeight: 1.5rem
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.375rem
  body-sm:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1.125rem
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.45rem
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1.25rem
  label-md:
    fontFamily: Inter
    fontSize: 0.8125rem
    fontWeight: '500'
    lineHeight: 1rem
    letterSpacing: 0.01em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 0.6875rem
    fontWeight: '500'
    lineHeight: 0.875rem
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 3rem
---

## Brand & Style

This design system defines an intelligent, developer-focused workspace engineered for Computer Science disciplines, algorithmic problem solving, architecture design, and systems engineering. The design language fuses high-density utility with modern architectural refinement. 

### Brand Archetype & Personality
- **Analytical & Precise:** Information density is intentional, structured, and legible without cognitive bloat.
- **Supportive & Sophisticated:** Interactions feel responsive and weightless, maintaining quiet elegance rather than decorative noise.
- **Technical Rigor:** Code blocks, mathematical expressions, AST visualizations, and chat interfaces exist in harmonic spatial hierarchy.

### Visual Style
- **Aesthetic:** Minimalist structural dashboard paired with bento-grid modularity and subtle glassmorphic atmospheric overlays for transient panels (command palettes, flyouts, and context menus).
- **Influences:** Modern developer ecosystems (`shadcn/ui`, linear layout mechanics) engineered with crisp 1px borders, muted contrast divisions, and balanced structural rhythm.

## Colors

The palette leverages an electric-yet-refined indigo core anchored by balanced atmospheric neutrals. Contrast is strictly regulated across light and dark modes to sustain sustained debugging and deep reading sessions.

### Light Theme
- **Background Primary:** `#F7F6FC` (Soft cool canvas)
- **Surface (Cards & Panels):** `#FFFFFF`
- **Surface Subdued / Accent:** `#EEEAFE` (Lavender container), `#E8F2FF` (Pale blue data highlight)
- **Brand Primary:** `#635BDB` (Interactive primary)
- **Brand Primary Hover:** `#5148C8`
- **Text High-Contrast:** `#202033`
- **Text Muted / Supporting:** `#73738A`
- **Border / Divider:** `#E6E4F0`
- **Success:** `#16865C`
- **Destructive / Error:** `#D64545`

### Dark Theme (Mapping & Variables)
- **Background Primary:** `#151520`
- **Sidebar & Panels:** `#1D1D2B`
- **Elevated Surfaces / Bento Modules:** `#262638`
- **Brand Primary / Interactive:** `#A49BFF`
- **Text High-Contrast:** `#F4F3FC`
- **Text Muted / Supporting:** `#B1B0C4`
- **Border / Divider:** `#36364A`
- **Success:** `#34D399`
- **Destructive / Error:** `#F87171`

### State & Contrast Rules
- Hover states for solid primary buttons utilize `#5148C8` in light mode and lighter tint shift in dark mode.
- Borders use single-pixel solid geometry `#E6E4F0` (light) and `#36364A` (dark) to define container edges without visual heaviness.

## Typography

Typography relies on a tripartite structural pairing: **Geist** for crisp dashboard framing and structural titles, **Inter** for sustained chat and analytical legibility, and **JetBrains Mono** for syntactical code, logs, and technical metadata.

- **Geist (Headings & Display):** Rendered with slight negative tracking to produce dense, commanding titles in Bento Grid headers.
- **Inter (Body & Controls):** Tuned for neutral reading ergonomics during lengthy AI generation passes and step-by-step reasoning proofs.
- **JetBrains Mono (Code & Technical Labels):** Designed with clear character differentiation (`0` vs `O`, `l` vs `1`), strictly used for inline code, terminal outputs, tab labels, and metrics counters.

## Layout & Spacing

The layout is architected around an exact 8pt spatial cadence (4px micro-steps for tight density). Content is distributed through a fluid Bento Grid system.

### Responsive Breakpoints & Grids
- **Mobile (< 768px):** 4-column layout, `gutter: 1rem`, `margin: 1rem`. Dynamic bottom navigation and collapsible action drawers.
- **Tablet (768px - 1024px):** 8-column layout, compact persistent sidebar (64px icon bar), `gutter: 1rem`, `margin: 1.5rem`.
- **Desktop (> 1024px):** 12-column adaptive Bento Grid with full collapsible panel layout (260px left sidebar, dynamic canvas, and 340px contextual AI inspector drawer). `gutter: 1.5rem`, `margin: 2rem`.

### Bento Grid Structure
Bento modules snap to grid column tracks (spans 3, 6, 9, or 12). Components inside modules observe strict interior gap tokens:
- Form fields and atomic actions leverage `space-sm` (0.5rem / 8px).
- Internal card content divisions leverage `space-md` (1rem / 16px).
- Module-to-module visual breathing space uses `space-lg` (1.5rem / 24px) or `space-xl` (2rem / 32px).

## Elevation & Depth

Visual depth is achieved predominantly through planar surface layering, delicate single-pixel boundary borders, and subtle glassmorphic refractions.

### Layer Hierarchy
1. **Canvas Layer (Base):** `#F7F6FC` (Light) / `#151520` (Dark). Recessed, texture-free workspace plane.
2. **Structural Surfaces (Bento Cards, Main Panes):** `#FFFFFF` (Light) / `#1D1D2B` and `#262638` (Dark). Outlined by a crisp `1px solid` border (`#E6E4F0` / `#36364A`). Ambient drop-shadow is minimal: `0 1px 3px rgba(32, 32, 51, 0.04), 0 1px 2px rgba(32, 32, 51, 0.02)`.
3. **Floating & Glassmorphic Elements (Popovers, Command Palette, Floating Prompt Bar):** 
   - Light: `background: rgba(255, 255, 255, 0.82)`, `backdrop-filter: blur(12px) saturate(180%)`, border `1px solid rgba(230, 228, 240, 0.8)`.
   - Dark: `background: rgba(29, 29, 43, 0.85)`, `backdrop-filter: blur(16px) saturate(180%)`, border `1px solid rgba(54, 54, 74, 0.9)`.
   - Shadow: `0 12px 32px -4px rgba(21, 21, 32, 0.12)`.
4. **Transient Modals & Sheets:** Scrim with `rgba(21, 21, 32, 0.4)` and a `backdrop-filter: blur(4px)`.

## Shapes

The design uses balanced, rounded geometry aligned with modern UI expectations:
- **Bento Cards & Structural Panels:** Fixed at `16px` (`rounded-lg` / `rounded-xl` boundary), creating a clean container feel.
- **Inputs, Dropdowns, & Action Buttons:** Radii calibrated between `10px` and `12px` to sit comfortably within Bento card layouts.
- **Pills, Badges, & Status Chips:** Full pill radius (`9999px`) for quick scanning.
- **Code Blocks & Terminal Panels:** `12px` container corner radius with `6px` internal scrollbar tracks.

## Components

### Buttons
- **Primary:** Solid `#635BDB` fill with white text, font `Inter 500`, radius `10px`, height `40px` (md) / `34px` (sm). Subtle transition on hover to `#5148C8`.
- **Secondary / Soft:** Fill `#EEEAFE` (Light) / `rgba(164, 155, 255, 0.15)` (Dark), text `#635BDB` / `#A49BFF`. No border.
- **Outline / Ghost:** Background transparent, border `1px solid #E6E4F0` (`#36364A` dark), text `#202033` (`#F4F3FC` dark). Hover fill `#F7F6FC` (`#262638` dark).

### Input Fields & Search Bars
- Clean `shadcn/ui` aesthetic: background `#FFFFFF` (Light) / `#1D1D2B` (Dark).
- Border: `1px solid #E6E4F0` (`#36364A` dark), radius `10px`, inner padding `0.5rem 0.875rem`.
- Focus state: `border-color: #635BDB` with an explicit focus ring `box-shadow: 0 0 0 3px rgba(99, 91, 219, 0.18)`.
- Includes leading/trailing Lucide icon slots (`16px` icon size, color `#73738A`).

### Cards & Bento Modules
- Base: `#FFFFFF` (Light) / `#262638` (Dark), `16px` radius, `1px solid #E6E4F0` (`#36364A` dark).
- Header sections feature a flex row separating Title (`Geist 500`, 16px) from technical action pills or icon controls.
- Internal divider lines use `#E6E4F0` (Light) / `#36364A` (Dark) with zero margin across card edges.

### Code Blocks & Tabbed Snippets
- Multi-language tabs along top header (`JetBrains Mono`, `12px`), active tab indicated by a subtle card-background pill or bottom indicator line `#635BDB`.
- Body container: `#151520` background (regardless of system theme for optimal syntax highlighting balance), padding `1rem`, font `JetBrains Mono 14px`.
- Features single-click copy button at top right, transition confirmation icon (Lucide `Check` in `#16865C`).

### Chips, Tags & Badges
- **Status Pills:** Height `24px`, padding `0 10px`, pill-shaped (`9999px`). 
- Success (CS compile pass, test coverage): Background `rgba(22, 134, 92, 0.12)`, text `#16865C`.
- Execution failure / syntax error: Background `rgba(214, 69, 69, 0.12)`, text `#D64545`.
- Language / Branch tag: Background `#E8F2FF`, text `#202033`, font `JetBrains Mono 11px`.

### Checkboxes & Toggle Controls
- Size: `18px x 18px`, radius `5px`.
- Unchecked: Border `1.5px solid #E6E4F0` (`#36364A` dark).
- Checked: Fill `#635BDB` with white Lucide checkmark.

### Popovers & Command Palette (AI Assistant Modal)
- Center-anchored overlay with glassmorphic backdrop.
- Omnisearch input with keyboard indicator shortcut badge (`⌘K` / `Ctrl+K`) in `JetBrains Mono`.
- Interactive suggestion list separated by categories (e.g., *Algorithms*, *Refactor Code*, *System Design*, *Explain Complexity*).