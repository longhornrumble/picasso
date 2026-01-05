# MyRecruiter Marketing Style Guide

A reference for maintaining visual and verbal consistency across all marketing materials.

---

## Brand Colors

### Primary Palette
| Color | Hex | Usage |
|-------|-----|-------|
| **Emerald 500** | `#50C878` | Primary brand color, CTAs, accent highlights |
| **Emerald 400** | `#34d399` | Hover states, secondary accents |
| **Emerald 600** | `#059669` | Eyebrow text, icons on light backgrounds |
| **Emerald 700** | `#047857` | Setup step numbers, icon strokes |
| **Emerald 800** | `#065f46` | Premium card background, case study section |

### Neutral Palette
| Color | Hex | Usage |
|-------|-----|-------|
| **Slate 900** | `#0f172a` | Hero gradient, dark section backgrounds |
| **Slate 950** | `#020617` | Footer background |
| **Slate 800** | `#1e293b` | Dark card backgrounds, inactive states |
| **Slate 600** | `#475569` | Body text on light backgrounds |
| **Slate 400** | `#94a3b8` | Secondary text, muted labels |
| **Slate 50** | `#f8fafc` | Light section backgrounds (pricing, FAQ) |

### Accent Colors
| Color | Hex | Usage |
|-------|-----|-------|
| **Amber 400** | `#fbbf24` | "Most Popular" badge, warning callouts, pulsing inquiry dots |
| **White** | `#ffffff` | Text on dark backgrounds, primary button on dark |

---

## Typography

### Font Family
**Plus Jakarta Sans** — weights 400, 500, 600, 700

### Type Scale
| Element | Size | Weight | Line Height |
|---------|------|--------|-------------|
| H1 (Hero) | 4xl–6xl (2.25–3.75rem) | 600 (semibold) | 1.1 |
| H2 (Section) | 3xl–4xl (1.875–2.25rem) | 600 (semibold) | 1.2 |
| H3 (Card title) | lg–xl (1.125–1.25rem) | 600 (semibold) | 1.4 |
| Body | lg (1.125rem) | 400 (regular) | relaxed (1.625) |
| Body small | base (1rem) | 400 (regular) | 1.5 |
| Eyebrow | sm (0.875rem) | 600 (semibold) | 1.4 |
| Caption | xs–sm (0.75–0.875rem) | 400–500 | 1.4 |

### Text Treatments
- **Eyebrow labels**: Uppercase, tracking-wide, emerald-600 on light / emerald-200 on dark
- **Gradient text**: Use `.gradient-text` class for special emphasis (emerald gradient)
- **Emphasis in headlines**: Use `<span class="text-emerald-400">` for highlighting key phrases on dark backgrounds

---

## Voice & Tone

### Brand Voice
- **Empathetic**: We understand nonprofits run lean
- **Confident but not pushy**: State benefits clearly without overselling
- **Action-oriented**: Focus on outcomes, not features
- **Accessible**: No jargon; speak to non-technical staff

### Messaging Hierarchy

1. **Primary message**: "Never miss another volunteer or donor inquiry again."
2. **Supporting proof**: Statistics (65.6% conversion, 8x applications, 49.4% after-hours)
3. **Pain point acknowledgment**: Lean teams, limited staff hours
4. **Solution framing**: AI that works 24/7 without adding headcount
5. **Social proof**: Austin Angels case study (767% increase)
6. **Risk reduction**: 48-hour setup, no contracts, we handle everything

### Key Phrases to Use
- "Live in 48 hours"
- "We handle everything"
- "No technical skills needed"
- "Purpose-built for nonprofits"
- "Never takes nights, weekends, or holidays off"
- "Your AI team member"

### Phrases to Avoid
- "Cutting-edge AI" (too tech-forward)
- "Revolutionize" (overused)
- "Simple" without showing proof
- Price comparisons to competitors

---

## UI Components

### Buttons

**Primary CTA (dark background)**
```
bg-emerald-500 hover:bg-emerald-400 text-white rounded-full font-semibold
px-7 py-3.5 shadow-lg shadow-emerald-500/25
```

**Secondary CTA (dark background)**
```
border border-white/20 text-white rounded-full font-medium
hover:bg-white/5 px-7 py-3.5
```

**Primary CTA (light background)**
```
border-2 border-emerald-500 text-emerald-500 rounded-full font-semibold
hover:bg-emerald-50 py-3
```

**Text Link CTA**
```
text-emerald-500 hover:text-emerald-400 font-medium
+ arrow icon with group-hover:translate-x-1
```

### Cards

**Light card (on white background)**
```
bg-slate-50 rounded-xl p-6
```

**Elevated card**
```
bg-white rounded-2xl px-8 py-8
border border-slate-200
box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08)
```

**Feature card (subtle green border)**
```
background-color: #F9FBFA
border: 1px solid rgba(80, 200, 120, 0.25)
box-shadow: 0px 6px 20px rgba(0, 0, 0, 0.08)
rounded-2xl p-8
```

**Premium/highlighted card**
```
bg-emerald-800 rounded-3xl p-12 text-white
box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18), 0 6px 14px rgba(6, 95, 70, 0.22)
```

### Section Backgrounds
| Section Type | Background |
|--------------|------------|
| Hero | `bg-slate-900` (hero-gradient class) |
| Light content | `bg-white` |
| Alternating light | `bg-slate-50` |
| Dark feature | `bg-slate-900` |
| Case study/premium | `bg-emerald-800` |
| Footer | `bg-slate-950` |

### Callout Boxes
**Info callout (on dark)**
```
bg-slate-800 rounded-xl p-4 border-l-4 border-amber-500
```

**Comparison callout (on light)**
```
bg-emerald-50/30 rounded-xl p-5 border border-emerald-200/40
```

---

## Visual Patterns

### Hero Badge
```html
<div class="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5">
    <span class="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
    <span class="text-slate-300 text-sm">Badge text here</span>
</div>
```

### Proof Bar (checkmarks)
```html
<span class="text-emerald-400 font-semibold">&#10003; Stat or proof point</span>
```

### Stat Display
```html
<div class="font-display text-3xl md:text-5xl font-semibold" style="color: #50C878">767%</div>
<div class="text-sm" style="color: #0A1A2F">increase in volunteer signups</div>
<div class="text-xs" style="color: #5C6B74">in their first month</div>
```

### Section Transitions
- **Micro-CTAs**: End each section with a text link pointing to the next section
- **Pattern**: "See how..." or "Learn how..." + arrow icon
- Use `group` class for hover animation on arrow

### Animations
| Animation | Usage |
|-----------|-------|
| `fade-in` | All major content blocks (via IntersectionObserver) |
| `float-animation` | Hero product showcase |
| `animate-pulse` | Live indicator dots, status badges |
| `sequentialPulse` | Setup section pulsing dots |

---

## Imagery

### Dashboard Screenshots
- Format: WebP for web, PNG for print
- Style: Cropped dashboard views showing real data
- Treatment: Rounded corners (rounded-2xl), subtle shadow

### Logo Usage
- **On dark**: `/images/logo-white.webp`
- **On light**: `/images/logo.webp`
- Height: 44px (header), 28px (footer)

### Partner/Client Logos
- Grayscale or muted treatment on alternating backgrounds
- Max height: 80px for case study features

---

## Responsive Behavior

### Breakpoints
| Breakpoint | Usage |
|------------|-------|
| Mobile | Default (< 640px) |
| `sm` | 640px+ |
| `md` | 768px+ |
| `lg` | 1024px+ |
| `xl` | 1280px+ |

### Mobile Adaptations
- Hero headline: Add word-spacing for readability (`.hero-headline`)
- Navigation: Hamburger menu with slide-in modal
- FAQ: Accordion behavior (desktop shows all expanded)
- CTAs: Full-width buttons on mobile
- Two-column grids: Stack to single column

---

## Pricing Display

### Price Format
- Monthly: `$150` / `$300`
- Annual: `$120` / `$240` (20% savings)
- Always show `/mo` suffix
- Toggle between monthly/annual with radio button UI

### Tier Naming
- **Standard**: "Essential AI engagement for growing nonprofits"
- **Premium**: "Best for orgs with higher volunteer demand..." (Most Popular badge)

### Value Comparison
Reference point: "$45,000/year for full-time staff" vs "$150-300/month for AI"

---

## Testimonial Format

```html
<blockquote class="text-xl text-slate-700 leading-relaxed mb-4">
    "Quote text here..."
</blockquote>
<div class="font-semibold text-slate-900">Organization Name</div>
<div class="text-slate-500">Source, Year</div>
```

---

## Accessibility

- All interactive elements have focus states
- Color contrast meets WCAG AA
- External links use `rel="noopener noreferrer" target="_blank"`
- Images include alt text and explicit dimensions
- Form controls use proper ARIA labels
- Mobile menu includes focus trapping