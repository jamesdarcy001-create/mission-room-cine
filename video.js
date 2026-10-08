// Video mode for the site: play the pre-rendered loop (assets/mission-room.webm)
// in the scene box instead of running the live 3D scene. Pure DOM, no WebGL.
// Load as a classic script; it finds every .mrc-cine box on the page. The video
// URL comes from the box's data-video attribute: optimisers such as LiteSpeed
// copy this script elsewhere, so its own URL is only a fallback.
(function () {
  var self = document.currentScript && document.currentScript.src;
  var fallback = self ? new URL("assets/mission-room.webm", self).href : "";
  // Safari cannot show a VP9 video's transparency (it would draw a black box),
  // and reduced-motion visitors keep the still: both just keep the poster.
  var safari = /^((?!chrome|chromium|crios|fxios|edg|android).)*safari/i.test(navigator.userAgent);
  if (safari || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  [].forEach.call(document.querySelectorAll(".mrc-cine"), function (box) {
    var src = box.getAttribute("data-video") || fallback;
    if (!src) return;
    var video = document.createElement("video");
    video.className = "mrc-cine__video";
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = true;
    video.preload = "auto";
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("aria-hidden", "true");
    video.addEventListener("playing", function () { box.classList.add("is-video"); }, { once: true });
    video.src = src;
    box.insertBefore(video, box.querySelector(".mrc-cine__people"));
    // Only decode while the box is on screen.
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) video.play().catch(function () {});
      else video.pause();
    }).observe(box);
  });
})();
