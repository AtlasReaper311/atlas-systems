"use strict";

document.documentElement.classList.add("js");

if (["/work/", "/writing/"].includes(window.location.pathname)) {
  void import("./directory-header-fields.js?v=20260807-hero-contrast");
}
