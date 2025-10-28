# Background Color Menu Test

## Changes Made

1. **HTML Structure (index.html)**:
   - Added new menu `bgColorMenu` with two options:
     - "Transparent" (id: `bgColorTransparent`) 
     - "Color" (id: `bgColorPicker`)

2. **JavaScript (index.js)**:
   - Added reference to `bgColorMenu` element
   - Updated `hideMenus()` function to include the new menu
   - Modified `modalBgColorPickerBtn` click handler to show menu instead of directly opening color picker
   - Added event handlers for both menu options:
     - `bgColorTransparent`: Placeholder for transparency functionality (not implemented yet)
     - `bgColorPicker`: Moved original color picker logic here
   - Updated `hideModals()` to also hide menus for better UX

## How to Test

1. Open the speed dial extension
2. Right-click on any existing dial and select "Edit"
3. Click the "BG Color" button
4. A menu should appear with "Transparent" and "Color" options
5. Clicking "Transparent" should hide the menu and log to console (functionality not implemented yet)
6. Clicking "Color" should hide the menu and open the color picker/eyedropper
7. The menu should also hide when clicking elsewhere or opening other modals

## Expected Behavior

- The background color button now shows a menu instead of directly opening the color picker
- All existing color picker functionality remains the same when "Color" is selected
- Menu positioning and hiding follows the same pattern as other menus in the application
- "Transparent" option is ready for future implementation

## Files Modified

- `src/index.html`: Added bgColorMenu structure
- `src/js/index.js`: Updated menu handling and event listeners