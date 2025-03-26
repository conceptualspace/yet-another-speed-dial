console.log("YASD content script loaded");

let url = window.location.href;

// wait for page to load
// todo: why the fuck does this count as a "user action" and the same shit from the background script doesnt?
window.onload = (event) => {
    // check if the page is a YASD page
    // and wait another 500ms
    setTimeout(() => {
        chrome.runtime.sendMessage({ target:"background", type: "captureScreenshot", data: { url } }, (response) => {
            // set a delay and close window
        setTimeout(() => {
            window.close();
        }, 500);
        });
    }
    , 100);
}


/*

// add button and capture screenshot on click
const button = document.createElement("button");
button.innerText = "Save Screenshot";
button.style.position = "absolute";
button.style.top = "0px";
button.style.right = "0px";
button.style.zIndex = "9999999";
button.style.backgroundColor = "#4be058";
button.style.color = "black";
button.style.border = "2px solid #222222";
button.style.padding = "10px 20px";
button.style.fontSize = "16px";
button.style.borderRadius = "5px";
button.style.height = "50px";

button.addEventListener("click", () => {
    // Capture screenshot
    // set this button opacity to 0
    button.style.opacity = "0";
    chrome.runtime.sendMessage({ target:"background", type: "captureScreenshot", data: { url } }, (response) => {
        // set a delay and close window
    setTimeout(() => {
        window.close();
    }, 500);
    
    });
});;


// Append button to body
document.body.appendChild(button);
*/