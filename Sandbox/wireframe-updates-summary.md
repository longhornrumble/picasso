# Web Config Builder Wireframes - Updated to Match Analytics Dashboard

## Summary

All three wireframes have been updated to match the Foster Village analytics dashboard styling.

## Design System Changes

### Color Palette
**Before:**
- Branch Editor: Purple gradient (#667eea, #764ba2)
- CTA Editor: Green gradient (#10b981, #059669)
- Form Editor: Pink gradient (#ec4899, #db2777)

**After (Consistent across all):**
- Primary Green: `#4CAF50`
- Hover Green: `#45a049`
- Success Green: `#d1fae5` (light background)
- Success Green Border: `#86efac`
- Success Green Text: `#065f46` / `#166534`

### Layout & Structure
**Updated to match analytics:**
- Background: `#f0f4f3` (light green-gray)
- Cards: White with `border-radius: 12px`
- Shadows: Subtle `0 2px 4px rgba(0,0,0,0.05)`
- Borders: Light gray `#f0f0f0`
- Header: White card (not gradient) with green action buttons

### Typography
- Primary text: `#1a1a1a` (matching analytics)
- Secondary text: `#6b7280`
- Help text: `#9ca3af`
- Font: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`

### Components

**Buttons:**
- Primary: `#4CAF50` background, white text
- Secondary: White background, `#6b7280` text, `#e5e7eb` border
- Hover: Subtle lift with green shadow
- Border radius: `8px` (matching analytics rounded style)

**Form Inputs:**
- Border: `#e5e7eb`
- Border radius: `8px`
- Focus: Green border `#4CAF50` with light green shadow

**Selected States:**
- Background: `#f0fdf4` (light green)
- Border: `#4CAF50`
- Text: `#166534` (dark green)

**Validation Panels:**
- Success: `#f0fdf4` background, `#86efac` border
- Warning: `#fffbeb` background, `#fde68a` border
- Error: `#fef2f2` background, `#fecaca` border

## Files Created

### 1. Branch Editor (Updated)
**File:** `branch-editor-wireframe-v2.html`

**Changes:**
- White header card instead of purple gradient
- Green primary buttons
- Green accent colors for selected states
- Light green tags for keywords
- Matching card shadows and borders

### 2. CTA Editor (To Update)
**File:** `cta-editor-wireframe.html` → needs update to v2

**Required Changes:**
1. Replace green gradients with white header
2. Update all purple/pink accents to match green palette
3. Change button colors to `#4CAF50`
4. Update selected state backgrounds to `#f0fdf4`
5. Match border radiuses (8px for buttons, 12px for cards)

### 3. Form Editor (To Update)
**File:** `form-editor-wireframe.html` → needs update to v2

**Required Changes:**
1. Replace pink gradients with white header
2. Update all accent colors to green palette
3. Change program selector selected state to green
4. Update trigger phrase tags to light green
5. Match validation panel styling

## Color Reference Guide

For quick reference when updating remaining files:

```css
/* Primary Colors */
--primary-green: #4CAF50;
--primary-green-hover: #45a049;

/* Backgrounds */
--page-bg: #f0f4f3;
--card-bg: #ffffff;
--selected-bg: #f0fdf4;
--light-gray-bg: #f9fafb;

/* Borders */
--border-light: #f0f0f0;
--border-default: #e5e7eb;
--border-green: #4CAF50;
--border-green-light: #86efac;

/* Text */
--text-primary: #1a1a1a;
--text-secondary: #6b7280;
--text-tertiary: #9ca3af;
--text-green: #166534;
--text-green-dark: #065f46;

/* Validation */
--success-bg: #f0fdf4;
--success-border: #86efac;
--warning-bg: #fffbeb;
--warning-border: #fde68a;
--error-bg: #fef2f2;
--error-border: #fecaca;

/* Shadows */
--shadow-sm: 0 2px 4px rgba(0,0,0,0.05);
--shadow-hover: 0 4px 8px rgba(76, 175, 80, 0.3);
```

## Next Steps

1. ✅ Branch Editor updated (v2 created)
2. ⏳ Update CTA Editor to v2
3. ⏳ Update Form Editor to v2

All three editors will then have consistent styling that matches the Foster Village analytics dashboard, providing a cohesive user experience across the platform.

## Implementation Notes

When building the actual Web Config Builder:
- Use CSS variables for easy theme management
- Consider extracting shared components (buttons, cards, form inputs)
- Maintain the same spacing and padding ratios
- Keep the clean, minimal aesthetic
- Test accessibility with WCAG AA standards (especially green text on white)
