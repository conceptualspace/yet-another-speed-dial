// Load the current setting and set checkbox state
document.addEventListener('DOMContentLoaded', async function() {
  const checkbox = document.getElementById('showReleaseNotes');
  
  try {
    const result = await chrome.storage.sync.get('showReleaseNotes');
    // Default to true if setting doesn't exist
    checkbox.checked = result.showReleaseNotes !== false;
  } catch (error) {
    console.error('Error loading showReleaseNotes setting:', error);
    checkbox.checked = true; // Default to true on error
  }
  
  // Save setting when checkbox changes
  checkbox.addEventListener('change', async function() {
    try {
      await chrome.storage.sync.set({ showReleaseNotes: checkbox.checked });
    } catch (error) {
      console.error('Error saving showReleaseNotes setting:', error);
    }
  });
});