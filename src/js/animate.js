
var inputs = document.querySelectorAll("input");
var nodes  = document.querySelectorAll(".tile");
var total  = nodes.length;
var dirty  = true;
var time   = 0.9;
var omega  = 12;
var zeta   = 0.9;
var boxes  = [];

for (var i = 0; i < total; i++) {
    var node   = nodes[i];
    TweenLite.set(node, { x: "+=0" });
    var transform = node._gsTransform;
    var x = node.offsetLeft;
    var y = node.offsetTop;
    boxes[i] = { node, transform, x, y };
}

for (var i = 0; i < inputs.length; i++) {
    inputs[i].addEventListener("change", layout);
}

window.addEventListener("resize", () => { dirty = true; });
TweenLite.ticker.addEventListener("tick", () => dirty && layout());

layout();

function layout() {
    dirty = false;

    for (var i = 0; i < total; i++) {
        var box = boxes[i];
        var lastX = box.x;
        var lastY = box.y;
        box.x = box.node.offsetLeft;
        box.y = box.node.offsetTop;
        if (lastX !== box.x || lastY !== box.y) {
            var x = box.transform.x + lastX - box.x;
            var y = box.transform.y + lastY - box.y;
            // Tween to 0 to remove the transforms
            TweenLite.set(box.node, { x, y });
            TweenLite.to(box.node, time, { x: 0, y: 0, ease });
        }
    }
}

function ease(progress) {
    var beta  = Math.sqrt(1.0 - zeta * zeta);
    progress = 1 - Math.cos(progress * Math.PI / 2);
    progress = 1 / beta *
        Math.exp(-zeta * omega * progress) *
        Math.sin( beta * omega * progress + Math.atan(beta / zeta));
    return 1 - progress;
}
