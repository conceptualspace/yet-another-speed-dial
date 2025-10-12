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

  // Add event listener for copy button
  const copyButton = document.getElementById('copyButton');
  if (copyButton) {
    copyButton.addEventListener('click', copyToClipboard);
  }
});

// Copy to clipboard function for share buttons
function copyToClipboard() {
  const url = 'www.yetanotherspeeddial.com';
  const button = document.getElementById('copyButton');
  
  navigator.clipboard.writeText(url).then(function() {
    showTooltip(button, 'Copied!');
  }).catch(function(err) {
    console.error('Could not copy text: ', err);
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = url;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    showTooltip(button, 'Copied!');
  });
}

// Show tooltip function
function showTooltip(element, message) {
  // Remove any existing tooltip
  const existingTooltip = document.querySelector('.copy-tooltip');
  if (existingTooltip) {
    existingTooltip.remove();
  }
  
  // Create tooltip
  const tooltip = document.createElement('div');
  tooltip.className = 'copy-tooltip';
  tooltip.textContent = message;
  document.body.appendChild(tooltip);
  
  // Position tooltip
  const rect = element.getBoundingClientRect();
  tooltip.style.left = (rect.left + rect.width / 2) + 'px';
  tooltip.style.top = (rect.top - 40) + 'px';
  
  // Show tooltip
  setTimeout(() => tooltip.classList.add('show'), 10);
  
  // Hide tooltip after 2 seconds
  setTimeout(() => {
    tooltip.classList.remove('show');
    setTimeout(() => tooltip.remove(), 300);
  }, 2000);
}