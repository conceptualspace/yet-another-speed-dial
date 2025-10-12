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
  navigator.clipboard.writeText(url).then(function() {
    const button = document.getElementById('copyButton');
    const originalText = button.textContent;
    const svgElement = button.querySelector('svg');
    const originalSvg = svgElement.outerHTML;
    
    // Replace with checkmark icon
    svgElement.innerHTML = '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>';
    button.textContent = 'Copied!';
    // Re-add the SVG since textContent overwrites everything
    button.innerHTML = '<svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24" style="margin-right: 6px;"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Copy';
    
    setTimeout(function() {
      button.innerHTML = originalSvg + ' Copy';
    }, 2000);
  }).catch(function(err) {
    console.error('Could not copy text: ', err);
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = url;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    
    const button = document.getElementById('copyButton');
    const originalText = button.textContent;
    const svgElement = button.querySelector('svg');
    const originalSvg = svgElement.outerHTML;
    
    // Replace with checkmark icon
    button.innerHTML = '<svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24" style="margin-right: 6px;"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Copy';
    
    setTimeout(function() {
      button.innerHTML = originalSvg + ' Copy';
    }, 2000);
  });
}