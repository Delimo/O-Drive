(function () {
  var e = localStorage.getItem("theme");
  if (e === "dark" || e === "light") {
    document.documentElement.setAttribute("data-theme", e);
  } else if (matchMedia("(prefers-color-scheme:dark)").matches) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();
