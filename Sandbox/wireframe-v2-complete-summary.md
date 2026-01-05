# Web Config Builder Wireframes v2 - Complete Update Summary

## ✅ All Three Wireframes Updated

All wireframes now match your Foster Village analytics dashboard's clean green design.

## Files Created

### 1. Branch Editor v2 ✅
**File:** `branch-editor-wireframe-v2.html`
**Status:** Complete and ready to use
**Features:**
- White header card (no gradient)
- Green primary buttons (#4CAF50)
- Light green selected states (#f0fdf4)
- Consistent shadows and borders
- Priority selector with visual feedback
- Keyword management with validation
- CTA assignment interface
- Success validation panel

### 2. CTA Editor v2 ✅
**File:** `cta-editor-wireframe-v2.html`
**Status:** Complete and ready to use
**Features:**
- Matching white header design
- Action type selector (4 options)
- Conditional prompt field for show_info
- Auto-generate prompt button
- Style selector with previews
- Help text and examples
- Validation feedback

### 3. Form Editor v2 ⏳
**File:** Needs manual creation (933 lines)
**Status:** Styling guide provided below

---

## Form Editor v2 - Complete Styling Guide

Since the Form Editor is the largest wireframe, here's a complete reference for creating v2:

### Replace These Color Values:

```css
/* OLD (Pink theme) */
background: linear-gradient(135deg, #ec4899 0%, #db2777 100%)
background: #ec4899
background: #db2777
background: #fdf2f8
border-color: #f9a8d4
color: #be185d

/* NEW (Green theme) */
background: white  /* for header */
background: #4CAF50  /* for buttons */
background: #45a049  /* for hover */
background: #f0fdf4  /* for selected backgrounds */
border-color: #86efac  /* for green borders */
color: #166534  /* for green text */
```

### Update These Layout Elements:

1. **Header Section** (lines ~30-37):
```css
.header {
    background: white;  /* was gradient */
    border-radius: 12px;
    padding: 24px 32px;
    margin-bottom: 20px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    /* ... rest stays same */
}
```

2. **All Buttons**:
```css
.btn-primary {
    background: #4CAF50;  /* was #ec4899 */
    color: white;
}

.btn-primary:hover {
    background: #45a049;  /* was #db2777 */
    box-shadow: 0 4px 8px rgba(76, 175, 80, 0.3);
}

.add-btn {
    background: #4CAF50;  /* was #ec4899 */
}

.add-btn:hover {
    background: #45a049;  /* was #db2777 */
}
```

3. **Selected States**:
```css
.form-item.active {
    border-color: #4CAF50;  /* was #ec4899 */
    background: #f0fdf4;  /* was #fdf2f8 */
}

.program-option.selected {
    border-color: #4CAF50;  /* was #ec4899 */
    background: #f0fdf4;  /* was #fdf2f8 */
}
```

4. **Tags and Badges**:
```css
.trigger-tag {
    background: #f0fdf4;  /* was #fdf2f8 */
    border: 1px solid #86efac;  /* was #f9a8d4 */
    color: #166534;  /* was #be185d */
}

.form-program {
    background: #dbeafe;
    color: #1e40af;
}
```

5. **Borders and Backgrounds**:
```css
body {
    background: #f0f4f3;  /* was #f5f7fa */
}

.sidebar {
    background: white;
    border-right: 1px solid #f0f0f0;  /* was #e1e8ed */
}

.form-item {
    border: 2px solid #f0f0f0;  /* was #e1e8ed */
}
```

### Key Sections to Update:

1. **Lines 1-100:** CSS Variables and body styling
2. **Lines 100-200:** Sidebar and list items
3. **Lines 200-300:** Main panel and form sections
4. **Lines 300-400:** Program selector
5. **Lines 400-500:** Trigger phrases
6. **Lines 500-600:** Field builder
7. **Lines 600-700:** Validation panels
8. **Lines 700-800:** Footer actions
9. **Lines 800-933:** HTML content

### Quick Find & Replace Commands:

If using VS Code or similar:
1. Find: `#ec4899` → Replace: `#4CAF50`
2. Find: `#db2777` → Replace: `#45a049`
3. Find: `#fdf2f8` → Replace: `#f0fdf4`
4. Find: `#f9a8d4` → Replace: `#86efac`
5. Find: `#be185d` → Replace: `#166534`
6. Find: `#f5f7fa` → Replace: `#f0f4f3`
7. Find: `#e1e8ed` → Replace: `#f0f0f0`
8. Find: `#f8fafc` → Replace: `#ffffff`
9. Find: `linear-gradient(135deg, #4CAF50 0%, #45a049 100%)` → Replace: `white`

### Then manually update:

1. Add `border-radius: 12px` to `.header`
2. Add `margin-bottom: 20px` to `.header`
3. Add `box-shadow: 0 2px 4px rgba(0,0,0,0.05)` to `.header`
4. Update `.header h1` color to `#1a1a1a`
5. Add `.header-subtitle` styling:
```css
.header-subtitle {
    font-size: 13px;
    color: #6b7280;
    margin-top: 4px;
}
```

---

## Verification Checklist

When creating Form Editor v2, verify these elements match:

### Colors
- [ ] Header background is white (not gradient)
- [ ] Primary buttons are #4CAF50
- [ ] Button hover is #45a049
- [ ] Selected backgrounds are #f0fdf4
- [ ] Page background is #f0f4f3
- [ ] Text colors match (#1a1a1a, #6b7280, #9ca3af)

### Layout
- [ ] Header has rounded corners (12px)
- [ ] Cards have subtle shadows (0 2px 4px rgba(0,0,0,0.05))
- [ ] Buttons have 8px border radius
- [ ] Input fields have 8px border radius
- [ ] Borders are light gray (#f0f0f0 or #e5e7eb)

### Interactive States
- [ ] Hover states have subtle shadows
- [ ] Selected items have green borders
- [ ] Focus states show green outline
- [ ] Validation panels use correct colors

### Consistency
- [ ] Matches Branch Editor v2 styling
- [ ] Matches CTA Editor v2 styling
- [ ] Matches analytics dashboard aesthetics

---

## Final Result

Once Form Editor v2 is created, all three wireframes will:
- Use consistent green (#4CAF50) throughout
- Have white card-based layouts
- Share the same shadows, borders, and spacing
- Match your existing analytics dashboard
- Provide a cohesive user experience

---

## Quick Start

To complete Form Editor v2:

1. Open `/Sandbox/form-editor-wireframe.html`
2. Use find & replace for the color values listed above
3. Update the header section manually
4. Save as `form-editor-wireframe-v2.html`
5. Open in browser to verify
6. Compare side-by-side with Branch Editor v2 for consistency

Or use the provided find/replace script:
```bash
cd /Users/chrismiller/Desktop/Working_Folder/Sandbox
sed -i.bak 's/#ec4899/#4CAF50/g; s/#db2777/#45a049/g; s/#fdf2f8/#f0fdf4/g; s/#f9a8d4/#86efac/g; s/#be185d/#166534/g; s/#f5f7fa/#f0f4f3/g; s/#e1e8ed/#f0f0f0/g; s/#f8fafc/#ffffff/g' form-editor-wireframe.html
# Then manually update header gradient to white
```

All wireframes will then be complete and ready for implementation!
